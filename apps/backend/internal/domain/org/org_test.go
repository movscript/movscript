package org

import (
	"strings"
	"testing"
	"time"
)

func TestGenerateJoinCodeUsesReadableAlphabet(t *testing.T) {
	code, err := GenerateJoinCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != 10 {
		t.Fatalf("code length = %d, want 10", len(code))
	}
	if strings.ContainsAny(code, "IO01") {
		t.Fatalf("code contains ambiguous character: %q", code)
	}
}

func TestNormalizeJoinCode(t *testing.T) {
	if got := NormalizeJoinCode(" ab-cd "); got != "ABCD" {
		t.Fatalf("code = %q, want ABCD", got)
	}
}

func TestNormalizePlanAndStatus(t *testing.T) {
	if got := NormalizePlan(""); got != PlanTeam {
		t.Fatalf("plan = %q, want team", got)
	}
	if got := NormalizePlan("enterprise"); got != PlanEnterprise {
		t.Fatalf("plan = %q, want enterprise", got)
	}
	if got := NormalizeStatus(""); got != StatusActive {
		t.Fatalf("status = %q, want active", got)
	}
	if got := NormalizeStatus("suspended"); got != StatusSuspended {
		t.Fatalf("status = %q, want suspended", got)
	}
}

func TestNewPersonalOrgUsesStableSlugFallback(t *testing.T) {
	user := UserIdentity{ID: 7, Username: "alice"}
	org := NewPersonalOrg(user, true)
	if org.Slug != "alice-7" || !org.IsPersonal || org.CreatedBy != 7 {
		t.Fatalf("unexpected personal org: %+v", org)
	}
	modelOrg := org.ToModel()
	modelOrg.ID = 23
	roundTrip := OrganizationFromModel(modelOrg)
	if roundTrip.ID != 23 || roundTrip.Slug != "alice-7" || !roundTrip.IsPersonal {
		t.Fatalf("unexpected org round-trip: %+v", roundTrip)
	}
}

func TestNewInvitationAppliesDefaultRole(t *testing.T) {
	expiresAt := time.Unix(100, 0)
	inv := NewInvitation(1, "token", "", "hello", 2, expiresAt)
	if inv.OrgID != 1 || inv.Token != "token" || inv.Role != RoleMember || inv.Note != "hello" || inv.CreatedBy != 2 || !inv.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("unexpected invitation: %+v", inv)
	}
	modelInv := inv.ToModel()
	modelInv.ID = 24
	roundTrip := InvitationFromModel(modelInv)
	if roundTrip.ID != 24 || roundTrip.Role != RoleMember || !roundTrip.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("unexpected invitation round-trip: %+v", roundTrip)
	}
}

func TestNewUserGroupTrimsName(t *testing.T) {
	group := NewUserGroup(1, " Team ")
	if group.OrgID != 1 || group.Name != "Team" {
		t.Fatalf("unexpected group: %+v", group)
	}
	modelGroup := group.ToModel()
	modelGroup.ID = 25
	roundTrip := UserGroupFromModel(modelGroup)
	if roundTrip.ID != 25 || roundTrip.Name != "Team" {
		t.Fatalf("unexpected group round-trip: %+v", roundTrip)
	}
}

func TestGroupMemberLinksGroupAndUser(t *testing.T) {
	member := GroupMember(1, 2)
	if member.GroupID != 1 || member.UserID != 2 {
		t.Fatalf("unexpected group member: %+v", member)
	}
	modelMember := member.ToModel()
	modelMember.ID = 26
	roundTrip := UserGroupMemberFromModel(modelMember)
	if roundTrip.ID != 26 || roundTrip.GroupID != 1 || roundTrip.UserID != 2 {
		t.Fatalf("unexpected group member round-trip: %+v", roundTrip)
	}
}
