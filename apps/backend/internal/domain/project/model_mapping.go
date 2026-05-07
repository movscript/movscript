package project

import "github.com/movscript/movscript/internal/domain/model"

func ProjectFromModel(project model.Project) Project {
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

func (project Project) ToModel() model.Project {
	var target model.Project
	project.ApplyToModel(&target)
	return target
}

func (project Project) ApplyToModel(target *model.Project) {
	target.Model.ID = project.ID
	target.Model.CreatedAt = project.CreatedAt
	target.Model.UpdatedAt = project.UpdatedAt
	target.Name = project.Name
	target.Description = project.Description
	target.OwnerID = project.OwnerID
	target.OrgID = project.OrgID
	target.Status = project.Status
	target.TotalEpisodes = project.TotalEpisodes
	target.Members = make([]model.ProjectMember, 0, len(project.Members))
	for _, member := range project.Members {
		target.Members = append(target.Members, member.ToModel())
	}
}

func MemberFromModel(member model.ProjectMember) Member {
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

func (member Member) ToModel() model.ProjectMember {
	var target model.ProjectMember
	member.ApplyToModel(&target)
	return target
}

func (member Member) ApplyToModel(target *model.ProjectMember) {
	target.Model.ID = member.ID
	target.Model.CreatedAt = member.CreatedAt
	target.Model.UpdatedAt = member.UpdatedAt
	target.ProjectID = member.ProjectID
	target.UserID = member.UserID
	target.Role = member.Role
}

func UserRefFromModel(user model.User) *UserRef {
	if user.ID == 0 {
		return nil
	}
	return &UserRef{
		ID:           user.ID,
		Username:     user.Username,
		SystemRole:   user.SystemRole,
		PrimaryEmail: user.PrimaryEmail,
		DisplayName:  user.DisplayName,
		AvatarURL:    user.AvatarURL,
		Status:       user.Status,
	}
}
