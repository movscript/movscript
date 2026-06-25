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
		OrgID:         project.OrgID,
		TotalEpisodes: project.TotalEpisodes,
		AspectRatio:   project.AspectRatio,
		VisualStyle:   project.VisualStyle,
		ProjectStyle:  project.ProjectStyle,
		ProjectUID:    project.ProjectUID,
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
	target.TotalEpisodes = project.TotalEpisodes
	target.AspectRatio = project.AspectRatio
	target.VisualStyle = project.VisualStyle
	target.ProjectStyle = project.ProjectStyle
	target.ProjectUID = project.ProjectUID
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
