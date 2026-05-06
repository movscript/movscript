package project

import "testing"

func TestNewProjectCopiesCreationFields(t *testing.T) {
	orgID := uint(5)
	project := NewProject("Film", "desc", 12, 7, &orgID)
	if project.Name != "Film" || project.OwnerID != 7 || project.OrgID == nil || *project.OrgID != 5 || project.TotalEpisodes != 12 {
		t.Fatalf("unexpected project: %+v", project)
	}
}

func TestNewMemberDefaultsViewerRole(t *testing.T) {
	member := NewMember(1, 2, "")
	if member.Role != "viewer" {
		t.Fatalf("role = %q, want viewer", member.Role)
	}
}

func TestResolveOwnerRole(t *testing.T) {
	role, ok := ResolveOwnerRole(8, 8)
	if !ok || role.Role != "owner" || role.UserID != 8 {
		t.Fatalf("unexpected owner role: %+v ok=%v", role, ok)
	}
}
