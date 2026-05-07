package project

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
	ID            uint
	Name          string
	Description   string
	OwnerID       uint
	OrgID         *uint
	Status        string
	TotalEpisodes int
}

type Member struct {
	ID        uint
	ProjectID uint
	UserID    uint
	Role      string
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
