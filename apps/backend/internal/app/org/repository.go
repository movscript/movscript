package org

import (
	"context"
	"errors"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/domain/model"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, userID uint) ([]OrgWithRole, error)
	Create(ctx context.Context, ownerID uint, input CreateInput) (domainorg.Organization, error)
	Get(ctx context.Context, orgID uint) (domainorg.Organization, error)
	FindUserByID(ctx context.Context, userID uint) (domainorg.User, error)
	ListUserMembers(ctx context.Context, userID uint) ([]domainorg.OrganizationMember, error)
	FindUserMember(ctx context.Context, orgID uint, userID uint) (domainorg.OrganizationMember, error)
	FindPersonalMember(ctx context.Context, userID uint) (domainorg.OrganizationMember, bool, error)
	UpdateName(ctx context.Context, orgID uint, name string) error
	ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error)
	CreateMember(ctx context.Context, member domainorg.OrganizationMember) (domainorg.OrganizationMember, error)
	UpdateMemberRole(ctx context.Context, orgID uint, userID uint, role string) error
	DeleteMember(ctx context.Context, orgID uint, userID uint) error
	ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error)
	CreateInvitation(ctx context.Context, inv domainorg.Invitation) (domainorg.Invitation, error)
	DeleteInvitation(ctx context.Context, orgID uint, invID uint) error
	FindInvitationByToken(ctx context.Context, token string) (domainorg.Invitation, error)
	CreateUser(ctx context.Context, user domainauth.RegisteredUser) (domainorg.User, error)
	FindUserByUsername(ctx context.Context, username string) (domainorg.User, error)
	UsernameExists(ctx context.Context, username string) (bool, error)
	AcceptInvitation(ctx context.Context, inv domainorg.Invitation, userID uint) error
	JoinByCode(ctx context.Context, code string, userID uint) (uint, error)
	ListGroups(ctx context.Context, orgID uint) ([]domainorg.UserGroup, error)
	CreateGroup(ctx context.Context, group domainorg.UserGroup) (domainorg.UserGroup, error)
	CreateGroupMember(ctx context.Context, member domainorg.UserGroupMember) (domainorg.UserGroupMember, error)
	DeleteGroupMember(ctx context.Context, groupID uint, userID uint) error
	GetUsage(ctx context.Context, orgID uint) (UsageResult, error)
	CreatePersonalOrg(ctx context.Context, user domainorg.User) error
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
		result = append(result, OrgWithRole{Organization: domainorg.OrganizationFromModel(org), Role: member.Role})
	}
	return result, nil
}

func (r *gormRepository) Create(ctx context.Context, ownerID uint, input CreateInput) (domainorg.Organization, error) {
	var org model.Organization
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		code, err := generateUniqueJoinCode(tx)
		if err != nil {
			return err
		}
		org = domainorg.NewTeamOrg(input.Name, input.Slug, code, ownerID).ToModel()
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		member := domainorg.OwnerMember(org.ID, ownerID).ToModel()
		return tx.Create(&member).Error
	})
	if err != nil {
		return domainorg.Organization{}, err
	}
	return domainorg.OrganizationFromModel(org), nil
}

func (r *gormRepository) Get(ctx context.Context, orgID uint) (domainorg.Organization, error) {
	var org model.Organization
	if err := r.db.WithContext(ctx).First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.Organization{}, ErrNotFound
		}
		return domainorg.Organization{}, err
	}
	return domainorg.OrganizationFromModel(org), nil
}

func (r *gormRepository) FindUserByID(ctx context.Context, userID uint) (domainorg.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.User{}, ErrNotFound
		}
		return domainorg.User{}, err
	}
	return domainorg.UserFromModel(user), nil
}

func (r *gormRepository) ListUserMembers(ctx context.Context, userID uint) ([]domainorg.OrganizationMember, error) {
	var members []model.OrganizationMember
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}
	return domainorg.OrganizationMembersFromModels(members), nil
}

func (r *gormRepository) FindUserMember(ctx context.Context, orgID uint, userID uint) (domainorg.OrganizationMember, error) {
	var member model.OrganizationMember
	if err := r.db.WithContext(ctx).Where("org_id = ? AND user_id = ?", orgID, userID).First(&member).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.OrganizationMember{}, ErrNotFound
		}
		return domainorg.OrganizationMember{}, err
	}
	return domainorg.OrganizationMemberFromModel(member), nil
}

func (r *gormRepository) FindPersonalMember(ctx context.Context, userID uint) (domainorg.OrganizationMember, bool, error) {
	var member model.OrganizationMember
	err := r.db.WithContext(ctx).
		Joins("JOIN organizations ON organizations.id = organization_members.org_id").
		Where("organization_members.user_id = ? AND organizations.is_personal = ?", userID, true).
		First(&member).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.OrganizationMember{}, false, nil
		}
		return domainorg.OrganizationMember{}, false, err
	}
	return domainorg.OrganizationMemberFromModel(member), true, nil
}

func (r *gormRepository) UpdateName(ctx context.Context, orgID uint, name string) error {
	return r.db.WithContext(ctx).Model(&model.Organization{}).Where("id = ?", orgID).Update("name", name).Error
}

func (r *gormRepository) ListMembers(ctx context.Context, orgID uint) ([]domainorg.OrganizationMember, error) {
	var members []model.OrganizationMember
	if err := r.db.WithContext(ctx).Preload("User").Where("org_id = ?", orgID).Find(&members).Error; err != nil {
		return nil, err
	}
	return domainorg.OrganizationMembersFromModels(members), nil
}

func (r *gormRepository) CreateMember(ctx context.Context, member domainorg.OrganizationMember) (domainorg.OrganizationMember, error) {
	row := member.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return member, err
	}
	if err := r.db.WithContext(ctx).Preload("User").First(&row, row.ID).Error; err != nil {
		return domainorg.OrganizationMember{}, err
	}
	return domainorg.OrganizationMemberFromModel(row), nil
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

func (r *gormRepository) ListInvitations(ctx context.Context, orgID uint) ([]domainorg.Invitation, error) {
	var invitations []model.OrgInvitation
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
	return r.db.WithContext(ctx).Where("id = ? AND org_id = ?", invID, orgID).Delete(&model.OrgInvitation{}).Error
}

func (r *gormRepository) FindInvitationByToken(ctx context.Context, token string) (domainorg.Invitation, error) {
	var inv model.OrgInvitation
	if err := r.db.WithContext(ctx).Where("token = ?", token).First(&inv).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.Invitation{}, ErrInviteNotFound
		}
		return domainorg.Invitation{}, err
	}
	return domainorg.InvitationFromModel(inv), nil
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

func (r *gormRepository) FindUserByUsername(ctx context.Context, username string) (domainorg.User, error) {
	var existing model.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainorg.User{}, ErrNotFound
		}
		return domainorg.User{}, err
	}
	return domainorg.UserFromModel(existing), nil
}

func (r *gormRepository) CreateUser(ctx context.Context, user domainauth.RegisteredUser) (domainorg.User, error) {
	row := user.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return domainorg.User{}, err
	}
	return domainorg.UserFromModel(row), nil
}

func (r *gormRepository) AcceptInvitation(ctx context.Context, inv domainorg.Invitation, userID uint) error {
	row := inv.ToModel()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing model.OrganizationMember
		if tx.Where("org_id = ? AND user_id = ?", inv.OrgID, userID).First(&existing).Error == nil {
			return nil
		}
		member := domainorg.Member(inv.OrgID, userID, inv.Role).ToModel()
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&row).Updates(map[string]any{"used_by": userID, "used_at": now}).Error
	})
}

func (r *gormRepository) JoinByCode(ctx context.Context, code string, userID uint) (uint, error) {
	var org model.Organization
	if err := r.db.WithContext(ctx).Where("join_code = ? AND is_personal = ?", code, false).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrInvalidCode
		}
		return 0, err
	}
	member := domainorg.Member(org.ID, userID, domainorg.RoleMember).ToModel()
	if err := r.db.WithContext(ctx).Create(&member).Error; err != nil {
		if IsDuplicateKey(err) {
			return org.ID, nil
		}
		return 0, err
	}
	return org.ID, nil
}

func (r *gormRepository) ListGroups(ctx context.Context, orgID uint) ([]domainorg.UserGroup, error) {
	var groups []model.UserGroup
	if err := r.db.WithContext(ctx).Preload("Members.User").Where("org_id = ?", orgID).Find(&groups).Error; err != nil {
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

func (r *gormRepository) CreateGroupMember(ctx context.Context, member domainorg.UserGroupMember) (domainorg.UserGroupMember, error) {
	row := member.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return member, err
	}
	return domainorg.UserGroupMemberFromModel(row), nil
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

func (r *gormRepository) CreatePersonalOrg(ctx context.Context, user domainorg.User) error {
	return CreatePersonalOrg(r.db.WithContext(ctx), user)
}
