package project

import "github.com/movscript/movscript/internal/domain/model"

type Role struct {
	Role   string
	UserID uint
}

func NewProject(name string, description string, totalEpisodes int, ownerID uint, orgID *uint) model.Project {
	return model.Project{
		Name:          name,
		Description:   description,
		OwnerID:       ownerID,
		OrgID:         orgID,
		TotalEpisodes: totalEpisodes,
	}
}

func OwnerMember(projectID uint, userID uint) model.ProjectMember {
	return model.ProjectMember{ProjectID: projectID, UserID: userID, Role: "owner"}
}

func NewMember(projectID uint, userID uint, role string) model.ProjectMember {
	return model.ProjectMember{ProjectID: projectID, UserID: userID, Role: DefaultMemberRole(role)}
}

func DefaultMemberRole(role string) string {
	if role == "" {
		return "viewer"
	}
	return role
}

func ResolveSystemRole(projectID uint, userID uint, systemRole string) (Role, bool) {
	if projectID == 0 {
		return Role{}, false
	}
	if systemRole == "super_admin" {
		return Role{Role: "super_admin", UserID: userID}, true
	}
	return Role{}, false
}

func ResolveOwnerRole(ownerID uint, userID uint) (Role, bool) {
	if ownerID == userID {
		return Role{Role: "owner", UserID: userID}, true
	}
	return Role{}, false
}
