package project

import "github.com/movscript/movscript/internal/domain/model"

func ProjectFromModel(project model.Project) Project {
	return Project{
		ID:            project.ID,
		Name:          project.Name,
		Description:   project.Description,
		OwnerID:       project.OwnerID,
		OrgID:         project.OrgID,
		Status:        project.Status,
		TotalEpisodes: project.TotalEpisodes,
	}
}

func (project Project) ToModel() model.Project {
	var target model.Project
	project.ApplyToModel(&target)
	return target
}

func (project Project) ApplyToModel(target *model.Project) {
	target.Model.ID = project.ID
	target.Name = project.Name
	target.Description = project.Description
	target.OwnerID = project.OwnerID
	target.OrgID = project.OrgID
	target.Status = project.Status
	target.TotalEpisodes = project.TotalEpisodes
}

func MemberFromModel(member model.ProjectMember) Member {
	return Member{
		ID:        member.ID,
		ProjectID: member.ProjectID,
		UserID:    member.UserID,
		Role:      member.Role,
	}
}

func (member Member) ToModel() model.ProjectMember {
	var target model.ProjectMember
	member.ApplyToModel(&target)
	return target
}

func (member Member) ApplyToModel(target *model.ProjectMember) {
	target.Model.ID = member.ID
	target.ProjectID = member.ProjectID
	target.UserID = member.UserID
	target.Role = member.Role
}
