package org

import (
	"context"
	"errors"
	"strconv"
	"time"

	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	Detail(ctx context.Context, id uint) (Detail, error)
	ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error)
	CreateInvitation(ctx context.Context, invitation domainorg.Invitation) (domainorg.Invitation, error)
	DeleteInvitation(ctx context.Context, orgID uint, invitationID uint) error
	RotateJoinCode(ctx context.Context, orgID uint) (Organization, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Detail(ctx context.Context, id uint) (Detail, error) {
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).First(&org, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Detail{}, ErrOrgNotFound
		}
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
		Select("id, name, owner_id, updated_at").
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
		},
		ActiveInvitations: activeInvitations,
		ProjectCount:      projectCount,
		ResourceCount:     resourceCount,
		Projects:          projects,
		Usage:             usage,
		Audit:             audit,
	}, nil
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
	return Organization{Organization: domainorg.OrganizationFromModel(org)}, nil
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
