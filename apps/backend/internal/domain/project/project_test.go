package project

import "testing"

func TestNewProjectCopiesCreationFields(t *testing.T) {
	orgID := uint(5)
	project := NewProject("Film", "desc", 12, 7, &orgID)
	if project.Name != "Film" || project.OwnerID != 7 || project.OrgID == nil || *project.OrgID != 5 || project.TotalEpisodes != 12 {
		t.Fatalf("unexpected project: %+v", project)
	}
	modelProject := project.ToModel()
	modelProject.ID = 18
	roundTrip := ProjectFromModel(modelProject)
	if roundTrip.ID != 18 || roundTrip.Name != "Film" || roundTrip.OwnerID != 7 {
		t.Fatalf("unexpected project round-trip: %+v", roundTrip)
	}
}

func TestNewMemberDefaultsViewerRole(t *testing.T) {
	member := NewMember(1, 2, "")
	if member.Role != "viewer" {
		t.Fatalf("role = %q, want viewer", member.Role)
	}
	modelMember := member.ToModel()
	modelMember.ID = 19
	roundTrip := MemberFromModel(modelMember)
	if roundTrip.ID != 19 || roundTrip.Role != RoleViewer {
		t.Fatalf("unexpected member round-trip: %+v", roundTrip)
	}
}

func TestResolveOwnerRole(t *testing.T) {
	role, ok := ResolveOwnerRole(8, 8)
	if !ok || role.Role != "owner" || role.UserID != 8 {
		t.Fatalf("unexpected owner role: %+v ok=%v", role, ok)
	}
}
