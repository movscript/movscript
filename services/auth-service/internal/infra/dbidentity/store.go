package dbidentity

import (
	"context"
	"errors"
	"strings"
	"time"

	identityapp "github.com/movscript/auth-service/internal/app/identity"
	domainauth "github.com/movscript/auth-service/internal/domain/auth"
	persistencemodel "github.com/movscript/auth-service/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type Store struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Store {
	return &Store{db: db}
}

func (s *Store) UserProfile(ctx context.Context, userID uint) (domainauth.UserProfile, bool, error) {
	if s == nil || s.db == nil || userID == 0 {
		return domainauth.UserProfile{}, false, nil
	}
	var user persistencemodel.User
	if err := s.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainauth.UserProfile{}, false, nil
		}
		return domainauth.UserProfile{}, false, err
	}
	return userProfileFromModel(user), true, nil
}

func (s *Store) OrgMemberships(ctx context.Context, userID uint) ([]domainauth.OrgMembership, bool, error) {
	if s == nil || s.db == nil || userID == 0 {
		return nil, false, nil
	}
	var exists int64
	if err := s.db.WithContext(ctx).Model(&persistencemodel.User{}).Where("id = ?", userID).Count(&exists).Error; err != nil {
		return nil, false, err
	}
	if exists == 0 {
		return nil, false, nil
	}
	var rows []persistencemodel.OrganizationMember
	if err := s.db.WithContext(ctx).
		Preload("Org").
		Where("user_id = ?", userID).
		Find(&rows).Error; err != nil {
		return nil, false, err
	}
	memberships := make([]domainauth.OrgMembership, 0, len(rows))
	for _, row := range rows {
		memberships = append(memberships, domainauth.OrgMembership{
			OrgID:      row.OrgID,
			OrgName:    row.Org.Name,
			OrgSlug:    row.Org.Slug,
			IsPersonal: row.Org.IsPersonal,
			Plan:       row.Org.Plan,
			Status:     row.Org.Status,
			Role:       row.Role,
		})
	}
	return memberships, true, nil
}

func (s *Store) ListUsers(ctx context.Context, filter identityapp.ListUsersFilter) (identityapp.UserPage, error) {
	if s == nil || s.db == nil {
		return identityapp.UserPage{}, identityapp.ErrIdentityMutationUnavailable
	}
	users := make([]persistencemodel.User, 0)
	query := s.db.WithContext(ctx).Model(&persistencemodel.User{})
	if filter.UserID != nil {
		query = query.Where("id = ?", *filter.UserID)
	}
	if filter.Query != "" {
		like := "%" + filter.Query + "%"
		if s.db.Dialector.Name() == "postgres" {
			query = query.Where("username ILIKE ? OR display_name ILIKE ? OR primary_email ILIKE ?", like, like, like)
		} else {
			query = query.Where("LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?) OR LOWER(primary_email) LIKE LOWER(?)", like, like, like)
		}
	}
	if filter.SystemRole != "" {
		query = query.Where("system_role = ?", filter.SystemRole)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return identityapp.UserPage{}, err
	}
	offset := (filter.Page - 1) * filter.PageSize
	if err := query.Order("id desc").Limit(filter.PageSize).Offset(offset).Find(&users).Error; err != nil {
		return identityapp.UserPage{}, err
	}
	return identityapp.UserPage{
		Items:    userProfilesFromModels(users),
		Total:    total,
		Page:     filter.Page,
		PageSize: filter.PageSize,
	}, nil
}

func (s *Store) CreateUser(ctx context.Context, input identityapp.CreateUserInput) (domainauth.UserProfile, error) {
	if s == nil || s.db == nil {
		return domainauth.UserProfile{}, identityapp.ErrIdentityMutationUnavailable
	}
	return s.createUser(ctx, input, "")
}

func (s *Store) CreateUserWithPassword(ctx context.Context, input identityapp.CreateUserInput, passwordHash string) (domainauth.UserProfile, error) {
	if s == nil || s.db == nil {
		return domainauth.UserProfile{}, identityapp.ErrIdentityMutationUnavailable
	}
	passwordHash = strings.TrimSpace(passwordHash)
	if passwordHash == "" {
		return domainauth.UserProfile{}, identityapp.ErrInvalidPasswordHash
	}
	return s.createUser(ctx, input, passwordHash)
}

func (s *Store) createUser(ctx context.Context, input identityapp.CreateUserInput, passwordHash string) (domainauth.UserProfile, error) {
	user := persistencemodel.User{
		Username:     input.Username,
		SystemRole:   valueOrDefault(input.SystemRole, domainauth.SystemRoleUser),
		Status:       valueOrDefault(input.Status, domainauth.UserStatusActive),
		PasswordHash: passwordHash,
	}
	if input.Email != nil {
		user.PrimaryEmail = input.Email
		now := time.Now().UTC().Unix()
		user.EmailVerifiedAt = &now
	}
	if input.DisplayName != nil {
		user.DisplayName = *input.DisplayName
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			if isDuplicateKey(err) {
				return identityapp.ErrUserConflict
			}
			return err
		}
		return createPersonalOrg(tx, user)
	}); err != nil {
		return domainauth.UserProfile{}, err
	}
	return userProfileFromModel(user), nil
}

func (s *Store) UpdateUser(ctx context.Context, userID uint, spec identityapp.UpdateUserSpec) (domainauth.UserProfile, error) {
	if s == nil || s.db == nil {
		return domainauth.UserProfile{}, identityapp.ErrIdentityMutationUnavailable
	}
	var updated persistencemodel.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user persistencemodel.User
		if err := tx.First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return identityapp.ErrUserNotFound
			}
			return err
		}
		if removesLastSuperAdmin(tx, user, spec) {
			return identityapp.ErrLastSuperAdmin
		}
		updates := map[string]any{}
		if spec.SystemRole != nil {
			updates["system_role"] = *spec.SystemRole
		}
		if spec.Status != nil {
			updates["status"] = *spec.Status
		}
		if spec.DisplayName != nil {
			updates["display_name"] = *spec.DisplayName
		}
		if spec.EmailSet {
			updates["primary_email"] = spec.PrimaryEmail
			updates["email_verified_at"] = spec.EmailVerifiedAt
		}
		if err := tx.Model(&persistencemodel.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			if isDuplicateKey(err) {
				return identityapp.ErrUserConflict
			}
			return err
		}
		return tx.First(&updated, user.ID).Error
	})
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	return userProfileFromModel(updated), nil
}

func (s *Store) SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainauth.UserProfile, error) {
	if s == nil || s.db == nil {
		return domainauth.UserProfile{}, identityapp.ErrIdentityMutationUnavailable
	}
	var updated persistencemodel.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user persistencemodel.User
		if err := tx.First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return identityapp.ErrUserNotFound
			}
			return err
		}
		if err := tx.Model(&persistencemodel.User{}).Where("id = ?", user.ID).Update("password_hash", passwordHash).Error; err != nil {
			return err
		}
		return tx.First(&updated, user.ID).Error
	})
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	return userProfileFromModel(updated), nil
}

func (s *Store) ListOrgs(ctx context.Context, filter identityapp.ListOrgsFilter) (identityapp.OrgPage, error) {
	if s == nil || s.db == nil {
		return identityapp.OrgPage{}, identityapp.ErrIdentityMutationUnavailable
	}
	orgs := make([]persistencemodel.Organization, 0)
	query := s.db.WithContext(ctx).Model(&persistencemodel.Organization{})
	if filter.OrgID != nil {
		query = query.Where("organizations.id = ?", *filter.OrgID)
	}
	if filter.UserID != nil {
		query = query.Joins("JOIN organization_members om ON om.org_id = organizations.id AND om.deleted_at IS NULL").
			Where("om.user_id = ?", *filter.UserID)
	}
	if filter.Query != "" {
		like := "%" + filter.Query + "%"
		if s.db.Dialector.Name() == "postgres" {
			query = query.Where("organizations.name ILIKE ? OR organizations.slug ILIKE ?", like, like)
		} else {
			query = query.Where("LOWER(organizations.name) LIKE LOWER(?) OR LOWER(organizations.slug) LIKE LOWER(?)", like, like)
		}
	}
	if filter.Status != "" {
		query = query.Where("organizations.status = ?", filter.Status)
	}
	if filter.Plan != "" {
		query = query.Where("organizations.plan = ?", filter.Plan)
	}
	if filter.IsPersonal != nil {
		query = query.Where("organizations.is_personal = ?", *filter.IsPersonal)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return identityapp.OrgPage{}, err
	}
	offset := (filter.Page - 1) * filter.PageSize
	if err := query.Order("organizations.id desc").Limit(filter.PageSize).Offset(offset).Find(&orgs).Error; err != nil {
		return identityapp.OrgPage{}, err
	}
	return identityapp.OrgPage{
		Items:    organizationsFromModels(orgs),
		Total:    total,
		Page:     filter.Page,
		PageSize: filter.PageSize,
	}, nil
}

func (s *Store) CreateOrg(ctx context.Context, input identityapp.CreateOrgInput) (domainauth.Organization, error) {
	if s == nil || s.db == nil {
		return domainauth.Organization{}, identityapp.ErrIdentityMutationUnavailable
	}
	var org persistencemodel.Organization
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if ok, err := userExistsTx(tx, input.CreatedBy); err != nil {
			return err
		} else if !ok {
			return identityapp.ErrUserNotFound
		}
		org = persistencemodel.Organization{
			Name:       input.Name,
			Slug:       input.Slug,
			IsPersonal: input.Plan == domainauth.OrgPlanPersonal,
			Plan:       input.Plan,
			Status:     input.Status,
			CreatedBy:  input.CreatedBy,
		}
		if err := tx.Create(&org).Error; err != nil {
			if isDuplicateKey(err) {
				return identityapp.ErrOrgConflict
			}
			return err
		}
		return tx.Create(&persistencemodel.OrganizationMember{
			OrgID:  org.ID,
			UserID: input.CreatedBy,
			Role:   domainauth.OrgRoleOwner,
		}).Error
	})
	if err != nil {
		return domainauth.Organization{}, err
	}
	return organizationFromModel(org), nil
}

func (s *Store) UpdateOrg(ctx context.Context, orgID uint, spec identityapp.UpdateOrgSpec) (domainauth.Organization, error) {
	if s == nil || s.db == nil {
		return domainauth.Organization{}, identityapp.ErrIdentityMutationUnavailable
	}
	updates := map[string]any{}
	if spec.Name != nil {
		updates["name"] = *spec.Name
	}
	if spec.Slug != nil {
		updates["slug"] = *spec.Slug
	}
	if spec.Plan != nil {
		updates["plan"] = *spec.Plan
		updates["is_personal"] = *spec.Plan == domainauth.OrgPlanPersonal
	}
	if spec.Status != nil {
		updates["status"] = *spec.Status
	}
	var updated persistencemodel.Organization
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var org persistencemodel.Organization
		if err := tx.First(&org, orgID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return identityapp.ErrOrgNotFound
			}
			return err
		}
		if err := tx.Model(&persistencemodel.Organization{}).Where("id = ?", org.ID).Updates(updates).Error; err != nil {
			if isDuplicateKey(err) {
				return identityapp.ErrOrgConflict
			}
			return err
		}
		return tx.First(&updated, org.ID).Error
	})
	if err != nil {
		return domainauth.Organization{}, err
	}
	return organizationFromModel(updated), nil
}

func (s *Store) ListOrgMembers(ctx context.Context, orgID uint) ([]domainauth.OrganizationMember, error) {
	if s == nil || s.db == nil {
		return nil, identityapp.ErrIdentityMutationUnavailable
	}
	if ok, err := s.orgExists(ctx, orgID); err != nil {
		return nil, err
	} else if !ok {
		return nil, identityapp.ErrOrgNotFound
	}
	var rows []persistencemodel.OrganizationMember
	if err := s.db.WithContext(ctx).Preload("User").Where("org_id = ?", orgID).Order("id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return organizationMembersFromModels(rows), nil
}

func (s *Store) AddOrgMember(ctx context.Context, orgID uint, input identityapp.OrgMemberInput) (domainauth.OrganizationMember, error) {
	if s == nil || s.db == nil {
		return domainauth.OrganizationMember{}, identityapp.ErrIdentityMutationUnavailable
	}
	row := persistencemodel.OrganizationMember{OrgID: orgID, UserID: input.UserID, Role: input.Role}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if ok, err := orgExistsTx(tx, orgID); err != nil {
			return err
		} else if !ok {
			return identityapp.ErrOrgNotFound
		}
		if ok, err := userExistsTx(tx, input.UserID); err != nil {
			return err
		} else if !ok {
			return identityapp.ErrUserNotFound
		}
		if err := tx.Create(&row).Error; err != nil {
			if isDuplicateKey(err) {
				return identityapp.ErrOrgMemberConflict
			}
			return err
		}
		return tx.Preload("User").First(&row, row.ID).Error
	}); err != nil {
		return domainauth.OrganizationMember{}, err
	}
	return organizationMemberFromModel(row), nil
}

func (s *Store) UpdateOrgMember(ctx context.Context, orgID uint, userID uint, role string) (domainauth.OrganizationMember, error) {
	if s == nil || s.db == nil {
		return domainauth.OrganizationMember{}, identityapp.ErrIdentityMutationUnavailable
	}
	var updated persistencemodel.OrganizationMember
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var member persistencemodel.OrganizationMember
		if err := tx.Where("org_id = ? AND user_id = ?", orgID, userID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return identityapp.ErrOrgMemberNotFound
			}
			return err
		}
		if member.Role == domainauth.OrgRoleOwner && role != domainauth.OrgRoleOwner {
			if ok, err := hasOtherOwner(tx, orgID, userID); err != nil {
				return err
			} else if !ok {
				return identityapp.ErrLastOrgOwner
			}
		}
		if err := tx.Model(&persistencemodel.OrganizationMember{}).
			Where("id = ?", member.ID).
			Update("role", role).Error; err != nil {
			return err
		}
		return tx.Preload("User").First(&updated, member.ID).Error
	})
	if err != nil {
		return domainauth.OrganizationMember{}, err
	}
	return organizationMemberFromModel(updated), nil
}

func (s *Store) RemoveOrgMember(ctx context.Context, orgID uint, userID uint) error {
	if s == nil || s.db == nil {
		return identityapp.ErrIdentityMutationUnavailable
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var member persistencemodel.OrganizationMember
		if err := tx.Where("org_id = ? AND user_id = ?", orgID, userID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return identityapp.ErrOrgMemberNotFound
			}
			return err
		}
		if member.Role == domainauth.OrgRoleOwner {
			if ok, err := hasOtherOwner(tx, orgID, userID); err != nil {
				return err
			} else if !ok {
				return identityapp.ErrLastOrgOwner
			}
		}
		return tx.Delete(&member).Error
	})
}

func (s *Store) orgExists(ctx context.Context, orgID uint) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&persistencemodel.Organization{}).Where("id = ?", orgID).Count(&count).Error
	return count > 0, err
}

func userProfileFromModel(user persistencemodel.User) domainauth.UserProfile {
	return domainauth.UserProfile{
		ID:              user.ID,
		Username:        user.Username,
		SystemRole:      user.SystemRole,
		PrimaryEmail:    user.PrimaryEmail,
		PrimaryPhone:    user.PrimaryPhone,
		DisplayName:     user.DisplayName,
		AvatarURL:       user.AvatarURL,
		Locale:          user.Locale,
		Status:          user.Status,
		EmailVerifiedAt: user.EmailVerifiedAt,
		CreatedAt:       user.CreatedAt,
		UpdatedAt:       user.UpdatedAt,
	}
}

func userProfilesFromModels(users []persistencemodel.User) []domainauth.UserProfile {
	result := make([]domainauth.UserProfile, 0, len(users))
	for _, user := range users {
		result = append(result, userProfileFromModel(user))
	}
	return result
}

func organizationFromModel(org persistencemodel.Organization) domainauth.Organization {
	return domainauth.Organization{
		ID:         org.ID,
		Name:       org.Name,
		Slug:       org.Slug,
		IsPersonal: org.IsPersonal,
		Plan:       org.Plan,
		Status:     org.Status,
		CreatedBy:  org.CreatedBy,
		CreatedAt:  org.CreatedAt,
		UpdatedAt:  org.UpdatedAt,
	}
}

func organizationsFromModels(orgs []persistencemodel.Organization) []domainauth.Organization {
	result := make([]domainauth.Organization, 0, len(orgs))
	for _, org := range orgs {
		result = append(result, organizationFromModel(org))
	}
	return result
}

func organizationMemberFromModel(member persistencemodel.OrganizationMember) domainauth.OrganizationMember {
	var user *domainauth.UserProfile
	if member.User.ID != 0 {
		profile := userProfileFromModel(member.User)
		user = &profile
	}
	return domainauth.OrganizationMember{
		ID:        member.ID,
		OrgID:     member.OrgID,
		UserID:    member.UserID,
		Role:      member.Role,
		User:      user,
		CreatedAt: member.CreatedAt,
		UpdatedAt: member.UpdatedAt,
	}
}

func organizationMembersFromModels(members []persistencemodel.OrganizationMember) []domainauth.OrganizationMember {
	result := make([]domainauth.OrganizationMember, 0, len(members))
	for _, member := range members {
		result = append(result, organizationMemberFromModel(member))
	}
	return result
}

func valueOrDefault(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

func createPersonalOrg(tx *gorm.DB, user persistencemodel.User) error {
	slug := personalOrgSlug(user)
	org := persistencemodel.Organization{
		Name:       user.Username,
		Slug:       slug,
		IsPersonal: true,
		Plan:       domainauth.OrgPlanPersonal,
		Status:     domainauth.OrgStatusActive,
		CreatedBy:  user.ID,
	}
	if err := tx.Create(&org).Error; err != nil {
		if isDuplicateKey(err) {
			return nil
		}
		return err
	}
	return tx.Create(&persistencemodel.OrganizationMember{
		OrgID:  org.ID,
		UserID: user.ID,
		Role:   domainauth.OrgRoleOwner,
	}).Error
}

func personalOrgSlug(user persistencemodel.User) string {
	base := strings.ToLower(strings.TrimSpace(user.Username))
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '-' || r == '_':
			return r
		default:
			return '-'
		}
	}, base)
	base = strings.Trim(base, "-_")
	if base == "" {
		base = "user"
	}
	return "personal-" + base + "-" + strings.TrimSpace(strings.ToLower(time.Now().UTC().Format("20060102150405")))
}

func removesLastSuperAdmin(tx *gorm.DB, user persistencemodel.User, spec identityapp.UpdateUserSpec) bool {
	if user.SystemRole != domainauth.SystemRoleSuperAdmin || user.Status != domainauth.UserStatusActive {
		return false
	}
	if spec.SystemRole == nil && spec.Status == nil {
		return false
	}
	nextRole := user.SystemRole
	if spec.SystemRole != nil {
		nextRole = *spec.SystemRole
	}
	nextStatus := user.Status
	if spec.Status != nil {
		nextStatus = *spec.Status
	}
	if nextRole == domainauth.SystemRoleSuperAdmin && nextStatus == domainauth.UserStatusActive {
		return false
	}
	var count int64
	err := tx.Model(&persistencemodel.User{}).
		Where("system_role = ? AND status = ? AND id <> ?", domainauth.SystemRoleSuperAdmin, domainauth.UserStatusActive, user.ID).
		Count(&count).Error
	return err == nil && count == 0
}

func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique_violation")
}

func orgExistsTx(tx *gorm.DB, orgID uint) (bool, error) {
	var count int64
	err := tx.Model(&persistencemodel.Organization{}).Where("id = ?", orgID).Count(&count).Error
	return count > 0, err
}

func userExistsTx(tx *gorm.DB, userID uint) (bool, error) {
	var count int64
	err := tx.Model(&persistencemodel.User{}).Where("id = ?", userID).Count(&count).Error
	return count > 0, err
}

func hasOtherOwner(tx *gorm.DB, orgID uint, userID uint) (bool, error) {
	var count int64
	err := tx.Model(&persistencemodel.OrganizationMember{}).
		Where("org_id = ? AND user_id <> ? AND role = ?", orgID, userID, domainauth.OrgRoleOwner).
		Count(&count).Error
	return count > 0, err
}
