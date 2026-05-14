package project

import "time"

type Role struct {
	Role   string
	UserID uint
}

const (
	RoleOwner      = "owner"
	RoleDirector   = "director"
	RoleSuperAdmin = "super_admin"
	RoleViewer     = "viewer"
)

type Project struct {
	ID            uint      `json:"ID"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	OwnerID       uint      `json:"owner_id"`
	Owner         *UserRef  `json:"owner,omitempty"`
	OrgID         *uint     `json:"org_id,omitempty"`
	Status        string    `json:"status"`
	TotalEpisodes int       `json:"total_episodes"`
	AspectRatio   string    `json:"aspect_ratio"`
	VisualStyle   string    `json:"visual_style"`
	ProjectStyle  string    `json:"project_style"`
	Members       []Member  `json:"members,omitempty"`
	CreatedAt     time.Time `json:"CreatedAt"`
	UpdatedAt     time.Time `json:"UpdatedAt"`
}

type Member struct {
	ID        uint      `json:"ID"`
	ProjectID uint      `json:"project_id"`
	UserID    uint      `json:"user_id"`
	User      *UserRef  `json:"user,omitempty"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"CreatedAt"`
	UpdatedAt time.Time `json:"UpdatedAt"`
}

type UserRef struct {
	ID           uint    `json:"ID"`
	Username     string  `json:"username"`
	SystemRole   string  `json:"system_role,omitempty"`
	PrimaryEmail *string `json:"primary_email,omitempty"`
	DisplayName  string  `json:"display_name,omitempty"`
	AvatarURL    string  `json:"avatar_url,omitempty"`
	Status       string  `json:"status,omitempty"`
}

func NewProject(name string, description string, totalEpisodes int, ownerID uint, orgID *uint) Project {
	return Project{
		Name:          name,
		Description:   description,
		OwnerID:       ownerID,
		OrgID:         orgID,
		TotalEpisodes: totalEpisodes,
	}
}

func OwnerMember(projectID uint, userID uint) Member {
	return Member{ProjectID: projectID, UserID: userID, Role: RoleOwner}
}

func NewMember(projectID uint, userID uint, role string) Member {
	return Member{ProjectID: projectID, UserID: userID, Role: DefaultMemberRole(role)}
}

func DefaultMemberRole(role string) string {
	if role == "" {
		return RoleViewer
	}
	return role
}

func ResolveSystemRole(projectID uint, userID uint, systemRole string) (Role, bool) {
	if projectID == 0 {
		return Role{}, false
	}
	if systemRole == RoleSuperAdmin {
		return Role{Role: RoleSuperAdmin, UserID: userID}, true
	}
	return Role{}, false
}

func ResolveOwnerRole(ownerID uint, userID uint) (Role, bool) {
	if ownerID == userID {
		return Role{Role: RoleOwner, UserID: userID}, true
	}
	return Role{}, false
}
