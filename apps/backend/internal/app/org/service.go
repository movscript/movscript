package org

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrNotFound       = errors.New("organization not found")
	ErrForbidden      = errors.New("organization permission denied")
	ErrConflict       = errors.New("organization conflict")
	ErrInvalidCode    = errors.New("organization code invalid")
	ErrInviteNotFound = errors.New("invitation not found")
	ErrInviteUsed     = errors.New("invitation already used")
	ErrInviteExpired  = errors.New("invitation expired")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

func IsDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique_violation")
}

type CreateInput struct {
	Name string
	Slug string
}

type MemberInput struct {
	UserID uint
	Role   string
}

type InvitationInput struct {
	Role string
	Note string
}

type GroupInput struct {
	Name string
}

type UsageRow struct {
	UserID      uint
	Username    string
	TotalCost   float64
	TotalTokens int
}

type UsageResult struct {
	Month string
	Rows  []UsageRow
}

type QuotaInput struct {
	MonthlyBudget float64
	Plan          *string
	Status        *string
}

func (s *Service) List(ctx context.Context, userID uint) ([]OrgWithRole, error) {
	var members []model.OrganizationMember
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}
	result := make([]OrgWithRole, 0, len(members))
	for _, m := range members {
		var org model.Organization
		if err := s.db.WithContext(ctx).First(&org, m.OrgID).Error; err != nil {
			continue
		}
		result = append(result, OrgWithRole{Organization: org, Role: m.Role})
	}
	return result, nil
}

func (s *Service) Create(ctx context.Context, ownerID uint, input CreateInput) (model.Organization, error) {
	var org model.Organization
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		code, err := generateUniqueJoinCode(tx)
		if err != nil {
			return err
		}
		org = model.Organization{Name: input.Name, Slug: input.Slug, JoinCode: code, IsPersonal: false, Plan: "team", Status: "trialing", CreatedBy: ownerID}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		member := model.OrganizationMember{OrgID: org.ID, UserID: ownerID, Role: "owner"}
		return tx.Create(&member).Error
	})
	return org, err
}

func (s *Service) Get(ctx context.Context, orgID uint) (model.Organization, error) {
	var org model.Organization
	if err := s.db.WithContext(ctx).First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return org, ErrNotFound
		}
		return org, err
	}
	return org, nil
}

func (s *Service) Update(ctx context.Context, member model.OrganizationMember, name string) error {
	if !IsAdminOrAbove(member.Role) {
		return ErrForbidden
	}
	return s.db.WithContext(ctx).Model(&model.Organization{}).Where("id = ?", member.OrgID).Update("name", name).Error
}

func (s *Service) ListMembers(ctx context.Context, orgID uint) ([]model.OrganizationMember, error) {
	var members []model.OrganizationMember
	if err := s.db.WithContext(ctx).Preload("User").Where("org_id = ?", orgID).Find(&members).Error; err != nil {
		return nil, err
	}
	return members, nil
}

func (s *Service) AddMember(ctx context.Context, caller model.OrganizationMember, input MemberInput) (model.OrganizationMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.OrganizationMember{}, ErrForbidden
	}
	role := domainorg.DefaultMemberRole(input.Role)
	member := model.OrganizationMember{OrgID: caller.OrgID, UserID: input.UserID, Role: role}
	if err := s.db.WithContext(ctx).Create(&member).Error; err != nil {
		return member, err
	}
	if err := s.db.WithContext(ctx).Preload("User").First(&member, member.ID).Error; err != nil {
		return member, err
	}
	return member, nil
}

func (s *Service) UpdateMember(ctx context.Context, caller model.OrganizationMember, targetUserID uint, role string) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.db.WithContext(ctx).Model(&model.OrganizationMember{}).
		Where("org_id = ? AND user_id = ?", caller.OrgID, targetUserID).
		Update("role", role).Error
}

func (s *Service) RemoveMember(ctx context.Context, caller model.OrganizationMember, targetUserID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.db.WithContext(ctx).Where("org_id = ? AND user_id = ?", caller.OrgID, targetUserID).
		Delete(&model.OrganizationMember{}).Error
}

func (s *Service) ListInvitations(ctx context.Context, caller model.OrganizationMember) ([]model.OrgInvitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return nil, ErrForbidden
	}
	var invitations []model.OrgInvitation
	if err := s.db.WithContext(ctx).Where("org_id = ?", caller.OrgID).Order("id desc").Find(&invitations).Error; err != nil {
		return nil, err
	}
	return invitations, nil
}

func (s *Service) CreateInvitation(ctx context.Context, caller model.OrganizationMember, creatorID uint, input InvitationInput) (model.OrgInvitation, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.OrgInvitation{}, ErrForbidden
	}
	token, err := generateInviteToken()
	if err != nil {
		return model.OrgInvitation{}, err
	}
	role := domainorg.DefaultMemberRole(input.Role)
	inv := model.OrgInvitation{
		OrgID:     caller.OrgID,
		Token:     token,
		Role:      role,
		Note:      input.Note,
		CreatedBy: creatorID,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	if err := s.db.WithContext(ctx).Create(&inv).Error; err != nil {
		return inv, err
	}
	return inv, nil
}

func (s *Service) RevokeInvitation(ctx context.Context, caller model.OrganizationMember, invID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.db.WithContext(ctx).Where("id = ? AND org_id = ?", invID, caller.OrgID).Delete(&model.OrgInvitation{}).Error
}

func (s *Service) GetInvitation(ctx context.Context, token string) (model.OrgInvitation, model.Organization, error) {
	var inv model.OrgInvitation
	if err := s.db.WithContext(ctx).Where("token = ?", token).First(&inv).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return inv, model.Organization{}, ErrInviteNotFound
		}
		return inv, model.Organization{}, err
	}
	if inv.UsedAt != nil {
		return inv, model.Organization{}, ErrInviteUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return inv, model.Organization{}, ErrInviteExpired
	}
	var org model.Organization
	_ = s.db.WithContext(ctx).First(&org, inv.OrgID).Error
	return inv, org, nil
}

func (s *Service) AcceptInvitation(ctx context.Context, token string, user *model.User, registration *RegistrationInput) (uint, error) {
	var inv model.OrgInvitation
	if err := s.db.WithContext(ctx).Where("token = ?", token).First(&inv).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrInviteNotFound
		}
		return 0, err
	}
	if inv.UsedAt != nil {
		return 0, ErrInviteUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return 0, ErrInviteExpired
	}
	if user == nil {
		if registration == nil {
			return 0, ErrForbidden
		}
		var existing model.User
		if s.db.WithContext(ctx).Where("username = ?", registration.Username).First(&existing).Error == nil {
			return 0, ErrConflict
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(registration.Password), 12)
		if err != nil {
			return 0, err
		}
		user = &model.User{Username: registration.Username, PasswordHash: string(hash), SystemRole: "user"}
		if err := s.db.WithContext(ctx).Create(user).Error; err != nil {
			return 0, err
		}
		if err := CreatePersonalOrg(s.db.WithContext(ctx), user); err != nil {
			// non-fatal
		}
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing model.OrganizationMember
		if tx.Where("org_id = ? AND user_id = ?", inv.OrgID, user.ID).First(&existing).Error == nil {
			return nil
		}
		member := model.OrganizationMember{OrgID: inv.OrgID, UserID: user.ID, Role: inv.Role}
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&inv).Updates(map[string]any{"used_by": user.ID, "used_at": now}).Error
	})
	return inv.OrgID, err
}

func (s *Service) JoinByCode(ctx context.Context, token string, user model.User) (uint, error) {
	code := normalizeJoinCode(token)
	if code == "" {
		return 0, ErrInvalidCode
	}
	var org model.Organization
	if err := s.db.WithContext(ctx).Where("join_code = ? AND is_personal = ?", code, false).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrInvalidCode
		}
		return 0, err
	}
	member := model.OrganizationMember{OrgID: org.ID, UserID: user.ID, Role: "member"}
	if err := s.db.WithContext(ctx).Create(&member).Error; err != nil {
		if IsDuplicateKey(err) {
			return org.ID, nil
		}
		return 0, err
	}
	return org.ID, nil
}

func (s *Service) ListGroups(ctx context.Context, orgID uint) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	if err := s.db.WithContext(ctx).Preload("Members.User").Where("org_id = ?", orgID).Find(&groups).Error; err != nil {
		return nil, err
	}
	return groups, nil
}

func (s *Service) CreateGroup(ctx context.Context, caller model.OrganizationMember, input GroupInput) (model.UserGroup, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.UserGroup{}, ErrForbidden
	}
	group := model.UserGroup{OrgID: caller.OrgID, Name: input.Name}
	if err := s.db.WithContext(ctx).Create(&group).Error; err != nil {
		return group, err
	}
	return group, nil
}

func (s *Service) AddGroupMember(ctx context.Context, caller model.OrganizationMember, groupID uint, userID uint) (model.UserGroupMember, error) {
	if !IsAdminOrAbove(caller.Role) {
		return model.UserGroupMember{}, ErrForbidden
	}
	gm := model.UserGroupMember{GroupID: groupID, UserID: userID}
	if err := s.db.WithContext(ctx).Create(&gm).Error; err != nil {
		return gm, err
	}
	return gm, nil
}

func (s *Service) RemoveGroupMember(ctx context.Context, caller model.OrganizationMember, groupID uint, userID uint) error {
	if !IsAdminOrAbove(caller.Role) {
		return ErrForbidden
	}
	return s.db.WithContext(ctx).Where("group_id = ? AND user_id = ?", groupID, userID).Delete(&model.UserGroupMember{}).Error
}

func (s *Service) GetUsage(ctx context.Context, orgID uint) (UsageResult, error) {
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var rows []UsageRow
	if err := s.db.WithContext(ctx).Table("usage_logs ul").
		Select("ul.user_id, u.username, SUM(ul.cost) as total_cost, SUM(ul.input_tokens + ul.output_tokens) as total_tokens").
		Joins("JOIN users u ON u.id = ul.user_id").
		Where("ul.org_id = ? AND ul.created_at >= ? AND ul.deleted_at IS NULL", orgID, startOfMonth).
		Group("ul.user_id, u.username").
		Scan(&rows).Error; err != nil {
		return UsageResult{}, err
	}
	return UsageResult{Month: startOfMonth.Format("2006-01"), Rows: rows}, nil
}

func (s *Service) GetQuota(ctx context.Context, orgID uint) (model.OrgQuota, error) {
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{}, ErrNotFound
		}
		return model.OrgQuota{}, err
	}
	var quota model.OrgQuota
	if err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&quota).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{OrgID: orgID, MonthlyBudget: 0}, nil
		}
		return model.OrgQuota{}, err
	}
	return quota, nil
}

func (s *Service) SetQuota(ctx context.Context, orgID uint, input QuotaInput) (model.OrgQuota, error) {
	if input.MonthlyBudget < 0 {
		input.MonthlyBudget = 0
	}
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{}, ErrNotFound
		}
		return model.OrgQuota{}, err
	}
	orgUpdates := map[string]any{}
	if input.Plan != nil {
		orgUpdates["plan"] = normalizeOrgPlan(*input.Plan)
	}
	if input.Status != nil {
		orgUpdates["status"] = normalizeOrgStatus(*input.Status)
	}
	if len(orgUpdates) > 0 {
		if err := s.db.WithContext(ctx).Model(&org).Updates(orgUpdates).Error; err != nil {
			return model.OrgQuota{}, err
		}
	}
	var quota model.OrgQuota
	err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&quota).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{}, err
		}
		quota = model.OrgQuota{OrgID: orgID, MonthlyBudget: input.MonthlyBudget}
		if err := s.db.WithContext(ctx).Create(&quota).Error; err != nil {
			return model.OrgQuota{}, err
		}
		return quota, nil
	}
	quota.MonthlyBudget = input.MonthlyBudget
	if err := s.db.WithContext(ctx).Save(&quota).Error; err != nil {
		return model.OrgQuota{}, err
	}
	return quota, nil
}

func normalizeOrgPlan(value string) string {
	return domainorg.NormalizePlan(value)
}

func normalizeOrgStatus(value string) string {
	return domainorg.NormalizeStatus(value)
}

func (s *Service) CreatePersonalOrg(ctx context.Context, user *model.User) error {
	return CreatePersonalOrg(s.db.WithContext(ctx), user)
}

type OrgWithRole struct {
	model.Organization
	Role string `json:"role"`
}

type RegistrationInput struct {
	Username string
	Password string
}

func IsAdminOrAbove(role string) bool {
	return domainorg.IsAdminOrAbove(role)
}

func generateInviteToken() (string, error) {
	return domainorg.GenerateInviteToken()
}

func GenerateJoinCode() (string, error) {
	return domainorg.GenerateJoinCode()
}

func generateUniqueJoinCode(db *gorm.DB) (string, error) {
	for i := 0; i < 8; i++ {
		code, err := GenerateJoinCode()
		if err != nil {
			return "", err
		}
		var count int64
		if err := db.Model(&model.Organization{}).Where("join_code = ?", code).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", ErrConflict
}

func EnsureJoinCode(db *gorm.DB, org *model.Organization) error {
	if strings.TrimSpace(org.JoinCode) != "" {
		return nil
	}
	code, err := generateUniqueJoinCode(db)
	if err != nil {
		return err
	}
	org.JoinCode = code
	return db.Model(org).Update("join_code", code).Error
}

func normalizeJoinCode(value string) string {
	return domainorg.NormalizeJoinCode(value)
}

func CreatePersonalOrg(db *gorm.DB, user *model.User) error {
	var count int64
	db.Model(&model.Organization{}).Where("slug = ?", user.Username).Count(&count)
	org := domainorg.NewPersonalOrg(*user, count > 0)
	if err := db.Create(&org).Error; err != nil {
		return err
	}
	member := domainorg.OwnerMember(org.ID, user.ID)
	return db.Create(&member).Error
}
