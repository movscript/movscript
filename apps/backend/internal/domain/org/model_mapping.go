package org

import "github.com/movscript/movscript/internal/domain/model"

func UserIdentityFromModel(user model.User) UserIdentity {
	return UserIdentity{
		ID:       user.ID,
		Username: user.Username,
	}
}

func UserFromModel(user model.User) User {
	domainUser := User{
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
	if user.DeletedAt.Valid {
		deletedAt := user.DeletedAt.Time
		domainUser.DeletedAt = &deletedAt
	}
	return domainUser
}

func (user User) ToModel() model.User {
	var target model.User
	user.ApplyToModel(&target)
	return target
}

func (user User) ApplyToModel(target *model.User) {
	target.Model.ID = user.ID
	target.Username = user.Username
	target.SystemRole = user.SystemRole
	target.PrimaryEmail = user.PrimaryEmail
	target.PrimaryPhone = user.PrimaryPhone
	target.DisplayName = user.DisplayName
	target.AvatarURL = user.AvatarURL
	target.Locale = user.Locale
	target.Status = user.Status
	target.EmailVerifiedAt = user.EmailVerifiedAt
	target.CreatedAt = user.CreatedAt
	target.UpdatedAt = user.UpdatedAt
	if user.DeletedAt != nil {
		target.DeletedAt.Time = *user.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func OrganizationFromModel(org model.Organization) Organization {
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
	target.CreatedAt = org.CreatedAt
	target.UpdatedAt = org.UpdatedAt
	if org.DeletedAt != nil {
		target.DeletedAt.Time = *org.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func OrganizationMemberFromModel(member model.OrganizationMember) OrganizationMember {
	domainMember := OrganizationMember{
		ID:        member.ID,
		OrgID:     member.OrgID,
		UserID:    member.UserID,
		Role:      member.Role,
		CreatedAt: member.CreatedAt,
		UpdatedAt: member.UpdatedAt,
	}
	if member.DeletedAt.Valid {
		deletedAt := member.DeletedAt.Time
		domainMember.DeletedAt = &deletedAt
	}
	if member.User.ID != 0 {
		user := UserFromModel(member.User)
		domainMember.User = &user
	}
	return domainMember
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
	target.CreatedAt = member.CreatedAt
	target.UpdatedAt = member.UpdatedAt
	if member.DeletedAt != nil {
		target.DeletedAt.Time = *member.DeletedAt
		target.DeletedAt.Valid = true
	}
	if member.User != nil {
		target.User.Model.ID = member.User.ID
		target.User.Username = member.User.Username
		target.User.SystemRole = member.User.SystemRole
		target.User.PrimaryEmail = member.User.PrimaryEmail
		target.User.PrimaryPhone = member.User.PrimaryPhone
		target.User.DisplayName = member.User.DisplayName
		target.User.AvatarURL = member.User.AvatarURL
		target.User.Locale = member.User.Locale
		target.User.Status = member.User.Status
		target.User.EmailVerifiedAt = member.User.EmailVerifiedAt
		target.User.CreatedAt = member.User.CreatedAt
		target.User.UpdatedAt = member.User.UpdatedAt
	}
}

func InvitationFromModel(inv model.OrgInvitation) Invitation {
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
	target.CreatedAt = inv.CreatedAt
	target.UpdatedAt = inv.UpdatedAt
	if inv.DeletedAt != nil {
		target.DeletedAt.Time = *inv.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func UserGroupFromModel(group model.UserGroup) UserGroup {
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

func (group UserGroup) ToModel() model.UserGroup {
	var target model.UserGroup
	group.ApplyToModel(&target)
	return target
}

func (group UserGroup) ApplyToModel(target *model.UserGroup) {
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
		target.Members = make([]model.UserGroupMember, 0, len(group.Members))
		for _, member := range group.Members {
			target.Members = append(target.Members, member.ToModel())
		}
	}
}

func UserGroupMemberFromModel(member model.UserGroupMember) UserGroupMember {
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
	if member.User.ID != 0 {
		user := UserFromModel(member.User)
		domainMember.User = &user
	}
	return domainMember
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
	target.CreatedAt = member.CreatedAt
	target.UpdatedAt = member.UpdatedAt
	if member.DeletedAt != nil {
		target.DeletedAt.Time = *member.DeletedAt
		target.DeletedAt.Valid = true
	}
	if member.User != nil {
		target.User.Model.ID = member.User.ID
		target.User.Username = member.User.Username
		target.User.SystemRole = member.User.SystemRole
		target.User.PrimaryEmail = member.User.PrimaryEmail
		target.User.PrimaryPhone = member.User.PrimaryPhone
		target.User.DisplayName = member.User.DisplayName
		target.User.AvatarURL = member.User.AvatarURL
		target.User.Locale = member.User.Locale
		target.User.Status = member.User.Status
		target.User.EmailVerifiedAt = member.User.EmailVerifiedAt
		target.User.CreatedAt = member.User.CreatedAt
		target.User.UpdatedAt = member.User.UpdatedAt
	}
}

func OrganizationsFromModels(orgs []model.Organization) []Organization {
	out := make([]Organization, 0, len(orgs))
	for _, org := range orgs {
		out = append(out, OrganizationFromModel(org))
	}
	return out
}

func OrganizationMembersFromModels(members []model.OrganizationMember) []OrganizationMember {
	out := make([]OrganizationMember, 0, len(members))
	for _, member := range members {
		out = append(out, OrganizationMemberFromModel(member))
	}
	return out
}

func InvitationsFromModels(invitations []model.OrgInvitation) []Invitation {
	out := make([]Invitation, 0, len(invitations))
	for _, invitation := range invitations {
		out = append(out, InvitationFromModel(invitation))
	}
	return out
}

func UserGroupsFromModels(groups []model.UserGroup) []UserGroup {
	out := make([]UserGroup, 0, len(groups))
	for _, group := range groups {
		out = append(out, UserGroupFromModel(group))
	}
	return out
}

func UserGroupMembersFromModels(members []model.UserGroupMember) []UserGroupMember {
	out := make([]UserGroupMember, 0, len(members))
	for _, member := range members {
		out = append(out, UserGroupMemberFromModel(member))
	}
	return out
}
