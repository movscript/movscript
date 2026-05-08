package project

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func ProjectFromModel(project persistencemodel.Project) Project {
	members := make([]Member, 0, len(project.Members))
	for _, member := range project.Members {
		members = append(members, MemberFromModel(member))
	}
	return Project{
		ID:            project.ID,
		Name:          project.Name,
		Description:   project.Description,
		OwnerID:       project.OwnerID,
		Owner:         UserRefFromModel(project.Owner),
		OrgID:         project.OrgID,
		Status:        project.Status,
		TotalEpisodes: project.TotalEpisodes,
		Members:       members,
		CreatedAt:     project.CreatedAt,
		UpdatedAt:     project.UpdatedAt,
	}
}

func (project Project) ToModel() persistencemodel.Project {
	var target persistencemodel.Project
	project.ApplyToModel(&target)
	return target
}

func (project Project) ApplyToModel(target *persistencemodel.Project) {
	target.Model.ID = project.ID
	target.Model.CreatedAt = project.CreatedAt
	target.Model.UpdatedAt = project.UpdatedAt
	target.Name = project.Name
	target.Description = project.Description
	target.OwnerID = project.OwnerID
	target.OrgID = project.OrgID
	target.Status = project.Status
	target.TotalEpisodes = project.TotalEpisodes
	target.Members = make([]persistencemodel.ProjectMember, 0, len(project.Members))
	for _, member := range project.Members {
		target.Members = append(target.Members, member.ToModel())
	}
}

func MemberFromModel(member persistencemodel.ProjectMember) Member {
	return Member{
		ID:        member.ID,
		ProjectID: member.ProjectID,
		UserID:    member.UserID,
		User:      UserRefFromModel(member.User),
		Role:      member.Role,
		CreatedAt: member.CreatedAt,
		UpdatedAt: member.UpdatedAt,
	}
}

func (member Member) ToModel() persistencemodel.ProjectMember {
	var target persistencemodel.ProjectMember
	member.ApplyToModel(&target)
	return target
}

func (member Member) ApplyToModel(target *persistencemodel.ProjectMember) {
	target.Model.ID = member.ID
	target.Model.CreatedAt = member.CreatedAt
	target.Model.UpdatedAt = member.UpdatedAt
	target.ProjectID = member.ProjectID
	target.UserID = member.UserID
	target.Role = member.Role
}

func UserRefFromModel(input any) *UserRef {
	user := userRefFields(input)
	if user.id == 0 {
		return nil
	}
	return &UserRef{
		ID:           user.id,
		Username:     user.username,
		SystemRole:   user.systemRole,
		PrimaryEmail: user.primaryEmail,
		DisplayName:  user.displayName,
		AvatarURL:    user.avatarURL,
		Status:       user.status,
	}
}

type userRefSnapshot struct {
	id           uint
	username     string
	systemRole   string
	primaryEmail *string
	displayName  string
	avatarURL    string
	status       string
}

func userRefFields(input any) userRefSnapshot {
	switch user := input.(type) {
	case persistencemodel.User:
		return userRefSnapshot{id: user.ID, username: user.Username, systemRole: user.SystemRole, primaryEmail: user.PrimaryEmail, displayName: user.DisplayName, avatarURL: user.AvatarURL, status: user.Status}
	case *persistencemodel.User:
		if user == nil {
			return userRefSnapshot{}
		}
		return userRefSnapshot{id: user.ID, username: user.Username, systemRole: user.SystemRole, primaryEmail: user.PrimaryEmail, displayName: user.DisplayName, avatarURL: user.AvatarURL, status: user.Status}
	default:
		return userRefSnapshot{}
	}
}
