package org

import "github.com/movscript/movscript/internal/domain/model"

func UserIdentityFromModel(user model.User) UserIdentity {
	return UserIdentity{
		ID:       user.ID,
		Username: user.Username,
	}
}

func OrganizationFromModel(org model.Organization) Organization {
	return Organization{
		ID:         org.ID,
		Name:       org.Name,
		Slug:       org.Slug,
		JoinCode:   org.JoinCode,
		IsPersonal: org.IsPersonal,
		Plan:       org.Plan,
		Status:     org.Status,
		CreatedBy:  org.CreatedBy,
	}
}

func (org Organization) ToModel() model.Organization {
	var target model.Organization
	org.ApplyToModel(&target)
	return target
}

func (org Organization) ApplyToModel(target *model.Organization) {
	target.Model.ID = org.ID
	target.Name = org.Name
	target.Slug = org.Slug
	target.JoinCode = org.JoinCode
	target.IsPersonal = org.IsPersonal
	target.Plan = org.Plan
	target.Status = org.Status
	target.CreatedBy = org.CreatedBy
}

func OrganizationMemberFromModel(member model.OrganizationMember) OrganizationMember {
	return OrganizationMember{
		ID:     member.ID,
		OrgID:  member.OrgID,
		UserID: member.UserID,
		Role:   member.Role,
	}
}

func (member OrganizationMember) ToModel() model.OrganizationMember {
	var target model.OrganizationMember
	member.ApplyToModel(&target)
	return target
}

func (member OrganizationMember) ApplyToModel(target *model.OrganizationMember) {
	target.Model.ID = member.ID
	target.OrgID = member.OrgID
	target.UserID = member.UserID
	target.Role = member.Role
}

func InvitationFromModel(inv model.OrgInvitation) Invitation {
	return Invitation{
		ID:        inv.ID,
		OrgID:     inv.OrgID,
		Token:     inv.Token,
		Role:      inv.Role,
		Note:      inv.Note,
		CreatedBy: inv.CreatedBy,
		UsedBy:    inv.UsedBy,
		ExpiresAt: inv.ExpiresAt,
		UsedAt:    inv.UsedAt,
	}
}

func (inv Invitation) ToModel() model.OrgInvitation {
	var target model.OrgInvitation
	inv.ApplyToModel(&target)
	return target
}

func (inv Invitation) ApplyToModel(target *model.OrgInvitation) {
	target.Model.ID = inv.ID
	target.OrgID = inv.OrgID
	target.Token = inv.Token
	target.Role = inv.Role
	target.Note = inv.Note
	target.CreatedBy = inv.CreatedBy
	target.UsedBy = inv.UsedBy
	target.ExpiresAt = inv.ExpiresAt
	target.UsedAt = inv.UsedAt
}

func UserGroupFromModel(group model.UserGroup) UserGroup {
	return UserGroup{
		ID:    group.ID,
		OrgID: group.OrgID,
		Name:  group.Name,
	}
}

func (group UserGroup) ToModel() model.UserGroup {
	var target model.UserGroup
	group.ApplyToModel(&target)
	return target
}

func (group UserGroup) ApplyToModel(target *model.UserGroup) {
	target.Model.ID = group.ID
	target.OrgID = group.OrgID
	target.Name = group.Name
}

func UserGroupMemberFromModel(member model.UserGroupMember) UserGroupMember {
	return UserGroupMember{
		ID:      member.ID,
		GroupID: member.GroupID,
		UserID:  member.UserID,
	}
}

func (member UserGroupMember) ToModel() model.UserGroupMember {
	var target model.UserGroupMember
	member.ApplyToModel(&target)
	return target
}

func (member UserGroupMember) ApplyToModel(target *model.UserGroupMember) {
	target.Model.ID = member.ID
	target.GroupID = member.GroupID
	target.UserID = member.UserID
}
