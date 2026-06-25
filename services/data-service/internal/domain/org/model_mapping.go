package org

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func OrganizationFromModel(org persistencemodel.Organization) Organization {
	domainOrg := Organization{
		ID:         org.ID,
		Name:       org.Name,
		Slug:       org.Slug,
		JoinCode:   org.JoinCode,
		IsPersonal: org.IsPersonal,
		Plan:       org.Plan,
		Status:     org.Status,
		CreatedBy:  org.CreatedBy,
		CreatedAt:  org.CreatedAt,
		UpdatedAt:  org.UpdatedAt,
	}
	if org.DeletedAt.Valid {
		deletedAt := org.DeletedAt.Time
		domainOrg.DeletedAt = &deletedAt
	}
	return domainOrg
}

func (org Organization) ToModel() persistencemodel.Organization {
	var target persistencemodel.Organization
	org.ApplyToModel(&target)
	return target
}

func (org Organization) ApplyToModel(target *persistencemodel.Organization) {
	target.Model.ID = org.ID
	target.Name = org.Name
	target.Slug = org.Slug
	target.JoinCode = org.JoinCode
	target.IsPersonal = org.IsPersonal
	target.Plan = org.Plan
	target.Status = org.Status
	target.CreatedBy = org.CreatedBy
	target.CreatedAt = org.CreatedAt
	target.UpdatedAt = org.UpdatedAt
	if org.DeletedAt != nil {
		target.DeletedAt.Time = *org.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func InvitationFromModel(inv persistencemodel.OrgInvitation) Invitation {
	domainInvitation := Invitation{
		ID:        inv.ID,
		OrgID:     inv.OrgID,
		Token:     inv.Token,
		Role:      inv.Role,
		Note:      inv.Note,
		CreatedBy: inv.CreatedBy,
		UsedBy:    inv.UsedBy,
		ExpiresAt: inv.ExpiresAt,
		UsedAt:    inv.UsedAt,
		CreatedAt: inv.CreatedAt,
		UpdatedAt: inv.UpdatedAt,
	}
	if inv.DeletedAt.Valid {
		deletedAt := inv.DeletedAt.Time
		domainInvitation.DeletedAt = &deletedAt
	}
	return domainInvitation
}

func (inv Invitation) ToModel() persistencemodel.OrgInvitation {
	var target persistencemodel.OrgInvitation
	inv.ApplyToModel(&target)
	return target
}

func (inv Invitation) ApplyToModel(target *persistencemodel.OrgInvitation) {
	target.Model.ID = inv.ID
	target.OrgID = inv.OrgID
	target.Token = inv.Token
	target.Role = inv.Role
	target.Note = inv.Note
	target.CreatedBy = inv.CreatedBy
	target.UsedBy = inv.UsedBy
	target.ExpiresAt = inv.ExpiresAt
	target.UsedAt = inv.UsedAt
	target.CreatedAt = inv.CreatedAt
	target.UpdatedAt = inv.UpdatedAt
	if inv.DeletedAt != nil {
		target.DeletedAt.Time = *inv.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func UserGroupFromModel(group persistencemodel.UserGroup) UserGroup {
	domainGroup := UserGroup{
		ID:        group.ID,
		OrgID:     group.OrgID,
		Name:      group.Name,
		CreatedAt: group.CreatedAt,
		UpdatedAt: group.UpdatedAt,
	}
	if group.DeletedAt.Valid {
		deletedAt := group.DeletedAt.Time
		domainGroup.DeletedAt = &deletedAt
	}
	if len(group.Members) > 0 {
		domainGroup.Members = UserGroupMembersFromModels(group.Members)
	}
	return domainGroup
}

func (group UserGroup) ToModel() persistencemodel.UserGroup {
	var target persistencemodel.UserGroup
	group.ApplyToModel(&target)
	return target
}

func (group UserGroup) ApplyToModel(target *persistencemodel.UserGroup) {
	target.Model.ID = group.ID
	target.OrgID = group.OrgID
	target.Name = group.Name
	target.CreatedAt = group.CreatedAt
	target.UpdatedAt = group.UpdatedAt
	if group.DeletedAt != nil {
		target.DeletedAt.Time = *group.DeletedAt
		target.DeletedAt.Valid = true
	}
	if len(group.Members) > 0 {
		target.Members = make([]persistencemodel.UserGroupMember, 0, len(group.Members))
		for _, member := range group.Members {
			target.Members = append(target.Members, member.ToModel())
		}
	}
}

func UserGroupMemberFromModel(member persistencemodel.UserGroupMember) UserGroupMember {
	domainMember := UserGroupMember{
		ID:        member.ID,
		GroupID:   member.GroupID,
		UserID:    member.UserID,
		CreatedAt: member.CreatedAt,
		UpdatedAt: member.UpdatedAt,
	}
	if member.DeletedAt.Valid {
		deletedAt := member.DeletedAt.Time
		domainMember.DeletedAt = &deletedAt
	}
	return domainMember
}

func (member UserGroupMember) ToModel() persistencemodel.UserGroupMember {
	var target persistencemodel.UserGroupMember
	member.ApplyToModel(&target)
	return target
}

func (member UserGroupMember) ApplyToModel(target *persistencemodel.UserGroupMember) {
	target.Model.ID = member.ID
	target.GroupID = member.GroupID
	target.UserID = member.UserID
	target.CreatedAt = member.CreatedAt
	target.UpdatedAt = member.UpdatedAt
	if member.DeletedAt != nil {
		target.DeletedAt.Time = *member.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func OrganizationsFromModels(orgs []persistencemodel.Organization) []Organization {
	out := make([]Organization, 0, len(orgs))
	for _, org := range orgs {
		out = append(out, OrganizationFromModel(org))
	}
	return out
}

func InvitationsFromModels(invitations []persistencemodel.OrgInvitation) []Invitation {
	out := make([]Invitation, 0, len(invitations))
	for _, invitation := range invitations {
		out = append(out, InvitationFromModel(invitation))
	}
	return out
}

func UserGroupsFromModels(groups []persistencemodel.UserGroup) []UserGroup {
	out := make([]UserGroup, 0, len(groups))
	for _, group := range groups {
		out = append(out, UserGroupFromModel(group))
	}
	return out
}

func UserGroupMembersFromModels(members []persistencemodel.UserGroupMember) []UserGroupMember {
	out := make([]UserGroupMember, 0, len(members))
	for _, member := range members {
		out = append(out, UserGroupMemberFromModel(member))
	}
	return out
}
