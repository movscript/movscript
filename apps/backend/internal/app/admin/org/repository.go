package org

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, filter ListFilter) (Page, error)
	Detail(ctx context.Context, id uint) (Detail, error)
	Create(ctx context.Context, input CreateInput) (Organization, error)
	ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error)
	ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error)
	AddMember(ctx context.Context, orgID uint, userID uint, role string) (domainorg.OrganizationMember, error)
	CreateInvitation(ctx context.Context, invitation domainorg.Invitation) (domainorg.Invitation, error)
	UpdateMemberRole(ctx context.Context, orgID uint, userID uint, role string) (domainorg.OrganizationMember, error)
	DeleteMember(ctx context.Context, orgID uint, userID uint) error
	DeleteInvitation(ctx context.Context, orgID uint, invitationID uint) error
	RotateJoinCode(ctx context.Context, orgID uint) (Organization, error)
	Update(ctx context.Context, id uint, spec updateSpec) (Organization, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Create(ctx context.Context, input CreateInput) (Organization, error) {
	var org persistencemodel.Organization
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := ensureActiveUserExists(tx, input.OwnerUserID); err != nil {
			return err
		}
		code, err := generateUniqueJoinCode(tx)
		if err != nil {
			return err
		}
		org = domainorg.NewTeamOrg(input.Name, input.Slug, code, input.OwnerUserID).ToModel()
		if err := tx.Create(&org).Error; err != nil {
			if isDuplicateKey(err) {
				return ErrOrgAlreadyExists
			}
			return err
		}
		member := domainorg.OwnerMember(org.ID, input.OwnerUserID).ToModel()
		return tx.Create(&member).Error
	})
	if err != nil {
		return Organization{}, err
	}
	return Organization{Organization: domainorg.OrganizationFromModel(org), MemberCount: 1}, nil
}

func (r *gormRepository) List(ctx context.Context, filter ListFilter) (Page, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.Organization{})
	if filter.Query != "" {
		like := "%" + filter.Query + "%"
		if r.db.Dialector.Name() == "postgres" {
			q = q.Where("name ILIKE ? OR slug ILIKE ? OR join_code ILIKE ?", like, like, like)
		} else {
			q = q.Where("LOWER(name) LIKE LOWER(?) OR LOWER(slug) LIKE LOWER(?) OR LOWER(join_code) LIKE LOWER(?)", like, like, like)
		}
	}
	if filter.Plan != "" {
		q = q.Where("plan = ?", filter.Plan)
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if filter.IsPersonal != nil {
		q = q.Where("is_personal = ?", *filter.IsPersonal)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return Page{}, err
	}

	var rows []orgListRow
	offset := (filter.Page - 1) * filter.PageSize
	err := q.
		Select("organizations.*, COUNT(organization_members.id) AS member_count").
		Joins("LEFT JOIN organization_members ON organization_members.org_id = organizations.id AND organization_members.deleted_at IS NULL").
		Group("organizations.id").
		Order("organizations.id desc").
		Limit(filter.PageSize).
		Offset(offset).
		Scan(&rows).Error
	if err != nil {
		return Page{}, err
	}

	items := make([]Organization, 0, len(rows))
	for _, row := range rows {
		items = append(items, Organization{
			Organization: domainorg.OrganizationFromModel(row.Organization),
			MemberCount:  row.MemberCount,
		})
	}
	return Page{Items: items, Total: total, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (r *gormRepository) Detail(ctx context.Context, id uint) (Detail, error) {
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).First(&org, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Detail{}, ErrOrgNotFound
		}
		return Detail{}, err
	}

	var memberCount int64
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.OrganizationMember{}).
		Where("org_id = ?", id).
		Count(&memberCount).Error; err != nil {
		return Detail{}, err
	}

	var activeInvitations int64
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.OrgInvitation{}).
		Where("org_id = ? AND used_at IS NULL AND expires_at > ?", id, time.Now().UTC()).
		Count(&activeInvitations).Error; err != nil {
		return Detail{}, err
	}

	var projectCount int64
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.Project{}).
		Where("org_id = ?", id).
		Count(&projectCount).Error; err != nil {
		return Detail{}, err
	}

	var resourceCount int64
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.RawResource{}).
		Where("org_id = ?", id).
		Count(&resourceCount).Error; err != nil {
		return Detail{}, err
	}

	projects := make([]ProjectSummary, 0)
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.Project{}).
		Select("id, name, status, owner_id, updated_at").
		Where("org_id = ?", id).
		Order("updated_at DESC, id DESC").
		Limit(10).
		Scan(&projects).Error; err != nil {
		return Detail{}, err
	}

	var usage UsageSummary
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.UsageLog{}).
		Select(`
			COUNT(*) AS calls,
			COALESCE(SUM(cost), 0) AS cost,
			COALESCE(SUM(input_tokens), 0) AS input_tokens,
			COALESCE(SUM(output_tokens), 0) AS output_tokens,
			COALESCE(SUM(CASE WHEN operation_type = ? THEN image_count ELSE 0 END), 0) AS images,
			COALESCE(SUM(duration_sec), 0) AS duration_sec
		`, "image").
		Where("org_id = ?", id).
		Scan(&usage).Error; err != nil {
		return Detail{}, err
	}

	audit := AuditSummary{}
	auditQuery := r.db.WithContext(ctx).
		Model(&persistencemodel.AuditLog{}).
		Where("org_id = ? OR (target_type = ? AND target_id = ?)", id, "organization", strconv.FormatUint(uint64(id), 10))
	if err := auditQuery.Count(&audit.Records).Error; err != nil {
		return Detail{}, err
	}
	if audit.Records > 0 {
		var last persistencemodel.AuditLog
		if err := auditQuery.Order("created_at DESC, id DESC").First(&last).Error; err != nil {
			return Detail{}, err
		}
		audit.LastAction = last.Action
		audit.LastAt = &last.CreatedAt
	}

	return Detail{
		Org: Organization{
			Organization: domainorg.OrganizationFromModel(org),
			MemberCount:  memberCount,
		},
		ActiveInvitations: activeInvitations,
		ProjectCount:      projectCount,
		ResourceCount:     resourceCount,
		Projects:          projects,
		Usage:             usage,
		Audit:             audit,
	}, nil
}

func (r *gormRepository) ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error) {
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrOrgNotFound
		}
		return nil, err
	}
	members := make([]persistencemodel.OrganizationMember, 0)
	if err := r.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Preload("User").
		Order("role asc, id asc").
		Find(&members).Error; err != nil {
		return nil, err
	}
	return domainorg.OrganizationMembersFromModels(members), nil
}

func (r *gormRepository) ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error) {
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrOrgNotFound
		}
		return nil, err
	}
	invitations := make([]persistencemodel.OrgInvitation, 0)
	if err := r.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("id desc").
		Find(&invitations).Error; err != nil {
		return nil, err
	}
	return domainorg.InvitationsFromModels(invitations), nil
}

func (r *gormRepository) AddMember(ctx context.Context, orgID uint, userID uint, role string) (domainorg.OrganizationMember, error) {
	var member persistencemodel.OrganizationMember
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := ensureOrgExists(tx, orgID); err != nil {
			return err
		}
		if err := ensureActiveUserExists(tx, userID); err != nil {
			return err
		}
		err := tx.Unscoped().
			Where("org_id = ? AND user_id = ?", orgID, userID).
			First(&member).Error
		if err == nil {
			if !member.DeletedAt.Valid {
				return ErrMemberAlreadyExists
			}
			if err := tx.Unscoped().Model(&persistencemodel.OrganizationMember{}).
				Where("id = ?", member.ID).
				Updates(map[string]any{"role": role, "deleted_at": nil}).Error; err != nil {
				return err
			}
			return tx.Preload("User").First(&member, member.ID).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		member = persistencemodel.OrganizationMember{OrgID: orgID, UserID: userID, Role: role}
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		return tx.Preload("User").First(&member, member.ID).Error
	})
	if err != nil {
		return domainorg.OrganizationMember{}, err
	}
	return domainorg.OrganizationMemberFromModel(member), nil
}

func (r *gormRepository) CreateInvitation(ctx context.Context, invitation domainorg.Invitation) (domainorg.Invitation, error) {
	var row persistencemodel.OrgInvitation
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := ensureActiveOrgExists(tx, invitation.OrgID); err != nil {
			return err
		}
		row = invitation.ToModel()
		return tx.Create(&row).Error
	})
	if err != nil {
		return domainorg.Invitation{}, err
	}
	return domainorg.InvitationFromModel(row), nil
}

func (r *gormRepository) UpdateMemberRole(ctx context.Context, orgID uint, userID uint, role string) (domainorg.OrganizationMember, error) {
	var updated persistencemodel.OrganizationMember
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var member persistencemodel.OrganizationMember
		if err := tx.Where("org_id = ? AND user_id = ?", orgID, userID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMemberNotFound
			}
			return err
		}
		if member.Role == domainorg.RoleOwner && role != domainorg.RoleOwner {
			if err := ensureAnotherOwner(tx, orgID, userID); err != nil {
				return err
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
		return domainorg.OrganizationMember{}, err
	}
	return domainorg.OrganizationMemberFromModel(updated), nil
}

func (r *gormRepository) DeleteMember(ctx context.Context, orgID uint, userID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var member persistencemodel.OrganizationMember
		if err := tx.Where("org_id = ? AND user_id = ?", orgID, userID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMemberNotFound
			}
			return err
		}
		if member.Role == domainorg.RoleOwner {
			if err := ensureAnotherOwner(tx, orgID, userID); err != nil {
				return err
			}
		}
		return tx.Delete(&member).Error
	})
}

func (r *gormRepository) DeleteInvitation(ctx context.Context, orgID uint, invitationID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", invitationID, orgID).
		Delete(&persistencemodel.OrgInvitation{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrInvitationNotFound
	}
	return nil
}

func (r *gormRepository) RotateJoinCode(ctx context.Context, orgID uint) (Organization, error) {
	var org persistencemodel.Organization
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&org, orgID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOrgNotFound
			}
			return err
		}
		if org.IsPersonal {
			return ErrPersonalOrgJoinCode
		}
		code, err := generateUniqueJoinCode(tx)
		if err != nil {
			return err
		}
		if err := tx.Model(&persistencemodel.Organization{}).Where("id = ?", org.ID).Update("join_code", code).Error; err != nil {
			return err
		}
		return tx.First(&org, org.ID).Error
	})
	if err != nil {
		return Organization{}, err
	}
	var memberCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.OrganizationMember{}).Where("org_id = ?", orgID).Count(&memberCount).Error; err != nil {
		return Organization{}, err
	}
	return Organization{Organization: domainorg.OrganizationFromModel(org), MemberCount: memberCount}, nil
}

func (r *gormRepository) Update(ctx context.Context, id uint, spec updateSpec) (Organization, error) {
	var org persistencemodel.Organization
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&org, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOrgNotFound
			}
			return err
		}
		updates := map[string]any{}
		if spec.Name != nil {
			updates["name"] = *spec.Name
		}
		if spec.Plan != nil {
			updates["plan"] = *spec.Plan
		}
		if spec.Status != nil {
			updates["status"] = *spec.Status
		}
		if err := tx.Model(&persistencemodel.Organization{}).Where("id = ?", org.ID).Updates(updates).Error; err != nil {
			return err
		}
		return tx.First(&org, id).Error
	})
	if err != nil {
		return Organization{}, err
	}
	var memberCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.OrganizationMember{}).Where("org_id = ?", id).Count(&memberCount).Error; err != nil {
		return Organization{}, err
	}
	return Organization{Organization: domainorg.OrganizationFromModel(org), MemberCount: memberCount}, nil
}

type orgListRow struct {
	persistencemodel.Organization
	MemberCount int64
}

func ensureOrgExists(tx *gorm.DB, orgID uint) error {
	var org persistencemodel.Organization
	if err := tx.Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOrgNotFound
		}
		return err
	}
	return nil
}

func ensureActiveOrgExists(tx *gorm.DB, orgID uint) error {
	var org persistencemodel.Organization
	if err := tx.Select("id, status").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOrgNotFound
		}
		return err
	}
	if org.Status == domainorg.StatusSuspended {
		return ErrOrgInactive
	}
	return nil
}

func ensureActiveUserExists(tx *gorm.DB, userID uint) error {
	var user persistencemodel.User
	if err := tx.Select("id, status").First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrUserNotFound
		}
		return err
	}
	if user.Status != "" && user.Status != domainauth.UserStatusActive {
		return ErrUserInactive
	}
	return nil
}

func ensureAnotherOwner(tx *gorm.DB, orgID uint, userID uint) error {
	var count int64
	if err := tx.Model(&persistencemodel.OrganizationMember{}).
		Where("org_id = ? AND user_id <> ? AND role = ?", orgID, userID, domainorg.RoleOwner).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrLastOwner
	}
	return nil
}

func generateUniqueJoinCode(tx *gorm.DB) (string, error) {
	for i := 0; i < 8; i++ {
		code, err := domainorg.GenerateJoinCode()
		if err != nil {
			return "", err
		}
		var count int64
		if err := tx.Model(&persistencemodel.Organization{}).Where("join_code = ?", code).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", ErrOrgAlreadyExists
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
