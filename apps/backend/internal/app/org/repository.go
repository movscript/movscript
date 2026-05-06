package org

import (
	"context"
	"errors"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, userID uint) ([]OrgWithRole, error)
	Create(ctx context.Context, ownerID uint, input CreateInput) (model.Organization, error)
	Get(ctx context.Context, orgID uint) (model.Organization, error)
	UpdateName(ctx context.Context, orgID uint, name string) error
	ListMembers(ctx context.Context, orgID uint) ([]model.OrganizationMember, error)
	CreateMember(ctx context.Context, member model.OrganizationMember) (model.OrganizationMember, error)
	UpdateMemberRole(ctx context.Context, orgID uint, userID uint, role string) error
	DeleteMember(ctx context.Context, orgID uint, userID uint) error
	ListInvitations(ctx context.Context, orgID uint) ([]model.OrgInvitation, error)
	CreateInvitation(ctx context.Context, inv model.OrgInvitation) (model.OrgInvitation, error)
	DeleteInvitation(ctx context.Context, orgID uint, invID uint) error
	FindInvitationByToken(ctx context.Context, token string) (model.OrgInvitation, error)
	CreateUser(ctx context.Context, user *model.User) error
	UsernameExists(ctx context.Context, username string) (bool, error)
	AcceptInvitation(ctx context.Context, inv model.OrgInvitation, userID uint) error
	JoinByCode(ctx context.Context, code string, user model.User) (uint, error)
	ListGroups(ctx context.Context, orgID uint) ([]model.UserGroup, error)
	CreateGroup(ctx context.Context, group model.UserGroup) (model.UserGroup, error)
	CreateGroupMember(ctx context.Context, member model.UserGroupMember) (model.UserGroupMember, error)
	DeleteGroupMember(ctx context.Context, groupID uint, userID uint) error
	GetUsage(ctx context.Context, orgID uint) (UsageResult, error)
	CreatePersonalOrg(ctx context.Context, user *model.User) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, userID uint) ([]OrgWithRole, error) {
	var members []model.OrganizationMember
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}
	result := make([]OrgWithRole, 0, len(members))
	for _, member := range members {
		var org model.Organization
		if err := r.db.WithContext(ctx).First(&org, member.OrgID).Error; err != nil {
			continue
		}
		result = append(result, OrgWithRole{Organization: org, Role: member.Role})
	}
	return result, nil
}

func (r *gormRepository) Create(ctx context.Context, ownerID uint, input CreateInput) (model.Organization, error) {
	var org model.Organization
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		code, err := generateUniqueJoinCode(tx)
		if err != nil {
			return err
		}
		org = domainorg.NewTeamOrg(input.Name, input.Slug, code, ownerID)
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		member := domainorg.OwnerMember(org.ID, ownerID)
		return tx.Create(&member).Error
	})
	return org, err
}

func (r *gormRepository) Get(ctx context.Context, orgID uint) (model.Organization, error) {
	var org model.Organization
	if err := r.db.WithContext(ctx).First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return org, ErrNotFound
		}
		return org, err
	}
	return org, nil
}

func (r *gormRepository) UpdateName(ctx context.Context, orgID uint, name string) error {
	return r.db.WithContext(ctx).Model(&model.Organization{}).Where("id = ?", orgID).Update("name", name).Error
}

func (r *gormRepository) ListMembers(ctx context.Context, orgID uint) ([]model.OrganizationMember, error) {
	var members []model.OrganizationMember
	if err := r.db.WithContext(ctx).Preload("User").Where("org_id = ?", orgID).Find(&members).Error; err != nil {
		return nil, err
	}
	return members, nil
}

func (r *gormRepository) CreateMember(ctx context.Context, member model.OrganizationMember) (model.OrganizationMember, error) {
	if err := r.db.WithContext(ctx).Create(&member).Error; err != nil {
		return member, err
	}
	if err := r.db.WithContext(ctx).Preload("User").First(&member, member.ID).Error; err != nil {
		return member, err
	}
	return member, nil
}

func (r *gormRepository) UpdateMemberRole(ctx context.Context, orgID uint, userID uint, role string) error {
	return r.db.WithContext(ctx).Model(&model.OrganizationMember{}).
		Where("org_id = ? AND user_id = ?", orgID, userID).
		Update("role", role).Error
}

func (r *gormRepository) DeleteMember(ctx context.Context, orgID uint, userID uint) error {
	return r.db.WithContext(ctx).Where("org_id = ? AND user_id = ?", orgID, userID).
		Delete(&model.OrganizationMember{}).Error
}

func (r *gormRepository) ListInvitations(ctx context.Context, orgID uint) ([]model.OrgInvitation, error) {
	var invitations []model.OrgInvitation
	if err := r.db.WithContext(ctx).Where("org_id = ?", orgID).Order("id desc").Find(&invitations).Error; err != nil {
		return nil, err
	}
	return invitations, nil
}

func (r *gormRepository) CreateInvitation(ctx context.Context, inv model.OrgInvitation) (model.OrgInvitation, error) {
	if err := r.db.WithContext(ctx).Create(&inv).Error; err != nil {
		return inv, err
	}
	return inv, nil
}

func (r *gormRepository) DeleteInvitation(ctx context.Context, orgID uint, invID uint) error {
	return r.db.WithContext(ctx).Where("id = ? AND org_id = ?", invID, orgID).Delete(&model.OrgInvitation{}).Error
}

func (r *gormRepository) FindInvitationByToken(ctx context.Context, token string) (model.OrgInvitation, error) {
	var inv model.OrgInvitation
	if err := r.db.WithContext(ctx).Where("token = ?", token).First(&inv).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return inv, ErrInviteNotFound
		}
		return inv, err
	}
	return inv, nil
}

func (r *gormRepository) UsernameExists(ctx context.Context, username string) (bool, error) {
	var existing model.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (r *gormRepository) CreateUser(ctx context.Context, user *model.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *gormRepository) AcceptInvitation(ctx context.Context, inv model.OrgInvitation, userID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing model.OrganizationMember
		if tx.Where("org_id = ? AND user_id = ?", inv.OrgID, userID).First(&existing).Error == nil {
			return nil
		}
		member := domainorg.Member(inv.OrgID, userID, inv.Role)
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&inv).Updates(map[string]any{"used_by": userID, "used_at": now}).Error
	})
}

func (r *gormRepository) JoinByCode(ctx context.Context, code string, user model.User) (uint, error) {
	var org model.Organization
	if err := r.db.WithContext(ctx).Where("join_code = ? AND is_personal = ?", code, false).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrInvalidCode
		}
		return 0, err
	}
	member := domainorg.Member(org.ID, user.ID, domainorg.RoleMember)
	if err := r.db.WithContext(ctx).Create(&member).Error; err != nil {
		if IsDuplicateKey(err) {
			return org.ID, nil
		}
		return 0, err
	}
	return org.ID, nil
}

func (r *gormRepository) ListGroups(ctx context.Context, orgID uint) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	if err := r.db.WithContext(ctx).Preload("Members.User").Where("org_id = ?", orgID).Find(&groups).Error; err != nil {
		return nil, err
	}
	return groups, nil
}

func (r *gormRepository) CreateGroup(ctx context.Context, group model.UserGroup) (model.UserGroup, error) {
	if err := r.db.WithContext(ctx).Create(&group).Error; err != nil {
		return group, err
	}
	return group, nil
}

func (r *gormRepository) CreateGroupMember(ctx context.Context, member model.UserGroupMember) (model.UserGroupMember, error) {
	if err := r.db.WithContext(ctx).Create(&member).Error; err != nil {
		return member, err
	}
	return member, nil
}

func (r *gormRepository) DeleteGroupMember(ctx context.Context, groupID uint, userID uint) error {
	return r.db.WithContext(ctx).Where("group_id = ? AND user_id = ?", groupID, userID).Delete(&model.UserGroupMember{}).Error
}

func (r *gormRepository) GetUsage(ctx context.Context, orgID uint) (UsageResult, error) {
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var rows []UsageRow
	if err := r.db.WithContext(ctx).Table("usage_logs ul").
		Select("ul.user_id, u.username, SUM(ul.cost) as total_cost, SUM(ul.input_tokens + ul.output_tokens) as total_tokens").
		Joins("JOIN users u ON u.id = ul.user_id").
		Where("ul.org_id = ? AND ul.created_at >= ? AND ul.deleted_at IS NULL", orgID, startOfMonth).
		Group("ul.user_id, u.username").
		Scan(&rows).Error; err != nil {
		return UsageResult{}, err
	}
	return UsageResult{Month: startOfMonth.Format("2006-01"), Rows: rows}, nil
}

func (r *gormRepository) CreatePersonalOrg(ctx context.Context, user *model.User) error {
	return CreatePersonalOrg(r.db.WithContext(ctx), user)
}
