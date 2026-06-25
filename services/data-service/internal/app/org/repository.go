package org

import (
	"context"
	"errors"
	"time"

	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	Create(ctx context.Context, ownerID uint, input CreateInput) (domainorg.Organization, error)
	Get(ctx context.Context, orgID uint) (domainorg.Organization, error)
	UpdateName(ctx context.Context, orgID uint, name string) error
	ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error)
	CreateInvitation(ctx context.Context, inv domainorg.Invitation) (domainorg.Invitation, error)
	DeleteInvitation(ctx context.Context, orgID uint, invID uint) error
	FindInvitationByToken(ctx context.Context, token string) (domainorg.Invitation, error)
	AcceptInvitation(ctx context.Context, inv domainorg.Invitation, userID uint) error
	FindByJoinCode(ctx context.Context, code string) (domainorg.Organization, error)
	ListGroups(ctx context.Context, orgID uint) ([]domainorg.UserGroup, error)
	CreateGroup(ctx context.Context, group domainorg.UserGroup) (domainorg.UserGroup, error)
	FindGroupOrgID(ctx context.Context, groupID uint) (uint, error)
	CreateGroupMember(ctx context.Context, member domainorg.UserGroupMember) (domainorg.UserGroupMember, error)
	DeleteGroupMember(ctx context.Context, groupID uint, userID uint) error
	GetUsage(ctx context.Context, orgID uint) (UsageResult, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Create(ctx context.Context, ownerID uint, input CreateInput) (domainorg.Organization, error) {
	var org persistencemodel.Organization
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		code, err := generateUniqueJoinCode(tx)
		if err != nil {
			return err
		}
		org = domainorg.NewTeamOrg(input.Name, input.Slug, code, ownerID).ToModel()
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return domainorg.Organization{}, err
	}
	return domainorg.OrganizationFromModel(org), nil
}

func (r *gormRepository) Get(ctx context.Context, orgID uint) (domainorg.Organization, error) {
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.Organization{}, ErrNotFound
		}
		return domainorg.Organization{}, err
	}
	return domainorg.OrganizationFromModel(org), nil
}

func (r *gormRepository) UpdateName(ctx context.Context, orgID uint, name string) error {
	return r.db.WithContext(ctx).Model(&persistencemodel.Organization{}).Where("id = ?", orgID).Update("name", name).Error
}

func (r *gormRepository) ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error) {
	var invitations []persistencemodel.OrgInvitation
	if err := r.db.WithContext(ctx).Where("org_id = ?", orgID).Order("id desc").Find(&invitations).Error; err != nil {
		return nil, err
	}
	return domainorg.InvitationsFromModels(invitations), nil
}

func (r *gormRepository) CreateInvitation(ctx context.Context, inv domainorg.Invitation) (domainorg.Invitation, error) {
	row := inv.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return inv, err
	}
	return domainorg.InvitationFromModel(row), nil
}

func (r *gormRepository) DeleteInvitation(ctx context.Context, orgID uint, invID uint) error {
	return r.db.WithContext(ctx).Where("id = ? AND org_id = ?", invID, orgID).Delete(&persistencemodel.OrgInvitation{}).Error
}

func (r *gormRepository) FindInvitationByToken(ctx context.Context, token string) (domainorg.Invitation, error) {
	var inv persistencemodel.OrgInvitation
	if err := r.db.WithContext(ctx).Where("token = ?", token).First(&inv).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.Invitation{}, ErrInviteNotFound
		}
		return domainorg.Invitation{}, err
	}
	return domainorg.InvitationFromModel(inv), nil
}

func (r *gormRepository) AcceptInvitation(ctx context.Context, inv domainorg.Invitation, userID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return consumeInvitation(tx, inv.ID, userID)
	})
}

func consumeInvitation(tx *gorm.DB, invitationID uint, userID uint) error {
	now := time.Now()
	result := tx.Model(&persistencemodel.OrgInvitation{}).
		Where("id = ? AND used_at IS NULL", invitationID).
		Updates(map[string]any{"used_by": userID, "used_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrInviteUsed
	}
	return nil
}

func (r *gormRepository) FindByJoinCode(ctx context.Context, code string) (domainorg.Organization, error) {
	var org persistencemodel.Organization
	if err := r.db.WithContext(ctx).Where("join_code = ? AND is_personal = ?", code, false).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.Organization{}, ErrInvalidCode
		}
		return domainorg.Organization{}, err
	}
	return domainorg.OrganizationFromModel(org), nil
}

func (r *gormRepository) ListGroups(ctx context.Context, orgID uint) ([]domainorg.UserGroup, error) {
	var groups []persistencemodel.UserGroup
	if err := r.db.WithContext(ctx).Preload("Members").Where("org_id = ?", orgID).Find(&groups).Error; err != nil {
		return nil, err
	}
	return domainorg.UserGroupsFromModels(groups), nil
}

func (r *gormRepository) CreateGroup(ctx context.Context, group domainorg.UserGroup) (domainorg.UserGroup, error) {
	row := group.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return group, err
	}
	return domainorg.UserGroupFromModel(row), nil
}

func (r *gormRepository) FindGroupOrgID(ctx context.Context, groupID uint) (uint, error) {
	var group persistencemodel.UserGroup
	if err := r.db.WithContext(ctx).Select("id, org_id").First(&group, groupID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	return group.OrgID, nil
}

func (r *gormRepository) CreateGroupMember(ctx context.Context, member domainorg.UserGroupMember) (domainorg.UserGroupMember, error) {
	row := member.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return domainorg.UserGroupMember{}, err
	}
	return domainorg.UserGroupMemberFromModel(row), nil
}

func (r *gormRepository) DeleteGroupMember(ctx context.Context, groupID uint, userID uint) error {
	return r.db.WithContext(ctx).Where("group_id = ? AND user_id = ?", groupID, userID).Delete(&persistencemodel.UserGroupMember{}).Error
}

func (r *gormRepository) GetUsage(ctx context.Context, orgID uint) (UsageResult, error) {
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var rows []UsageRow
	if err := r.db.WithContext(ctx).Table("usage_logs ul").
		Select("ul.user_id, SUM(ul.cost) as total_cost, SUM(ul.input_tokens + ul.output_tokens) as total_tokens").
		Where("ul.org_id = ? AND ul.created_at >= ? AND ul.deleted_at IS NULL", orgID, startOfMonth).
		Group("ul.user_id").
		Scan(&rows).Error; err != nil {
		return UsageResult{}, err
	}
	return UsageResult{Month: startOfMonth.Format("2006-01"), Rows: rows}, nil
}
