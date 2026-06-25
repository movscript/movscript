package org

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestCreateInvitationDefaultsRoleAndValidatesOrg(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminorg-invitation.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{})
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	service := NewService(db)

	invitation, err := service.CreateInvitation(context.Background(), org.ID, 9, CreateInvitationInput{Note: "  hello  "})
	if err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}
	if invitation.OrgID != org.ID || invitation.CreatedBy != 9 || invitation.Role != "member" || invitation.Note != "hello" || invitation.Token == "" {
		t.Fatalf("unexpected invitation: %#v", invitation)
	}

	_, err = service.CreateInvitation(context.Background(), 999, 9, CreateInvitationInput{Role: "admin"})
	if !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("missing org error = %v, want ErrOrgNotFound", err)
	}
	suspended := persistencemodel.Organization{Name: "Suspended", Slug: "suspended", Plan: "team", Status: "suspended", CreatedBy: 1}
	if err := db.Create(&suspended).Error; err != nil {
		t.Fatal(err)
	}
	_, err = service.CreateInvitation(context.Background(), suspended.ID, 9, CreateInvitationInput{Role: "member"})
	if !errors.Is(err, ErrOrgInactive) {
		t.Fatalf("suspended org error = %v, want ErrOrgInactive", err)
	}
	_, err = service.CreateInvitation(context.Background(), org.ID, 9, CreateInvitationInput{Role: "bad"})
	if !errors.Is(err, ErrInvalidMemberRole) {
		t.Fatalf("invalid role error = %v, want ErrInvalidMemberRole", err)
	}
}

func TestListAndRevokeInvitations(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminorg-invitation-list.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{})
	org := persistencemodel.Organization{Name: "Team", Slug: "team-list", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	invitation := persistencemodel.OrgInvitation{OrgID: org.ID, Token: "token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(time.Hour)}
	if err := db.Create(&invitation).Error; err != nil {
		t.Fatal(err)
	}

	service := NewService(db)
	invitations, err := service.ListInvitations(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("ListInvitations returned error: %v", err)
	}
	if len(invitations) != 1 || invitations[0].ID != invitation.ID {
		t.Fatalf("unexpected invitations: %#v", invitations)
	}
	if err := service.RevokeInvitation(context.Background(), org.ID, invitation.ID); err != nil {
		t.Fatalf("RevokeInvitation returned error: %v", err)
	}
	if err := service.RevokeInvitation(context.Background(), org.ID, invitation.ID); !errors.Is(err, ErrInvitationNotFound) {
		t.Fatalf("second revoke err = %v, want ErrInvitationNotFound", err)
	}
	if _, err := service.ListInvitations(context.Background(), 999); !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("missing org list err = %v, want ErrOrgNotFound", err)
	}
}

func TestDetailReturnsOrgOperationalSummary(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminorg-detail.db",
		&persistencemodel.Organization{},
		&persistencemodel.OrgInvitation{},
		&persistencemodel.Project{},
		&persistencemodel.RawResource{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
	org := persistencemodel.Organization{Name: "Team", Slug: "team-detail", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	otherOrg := persistencemodel.Organization{Name: "Other", Slug: "other-detail", Plan: "team", Status: "active", CreatedBy: 2}
	if err := db.Create(&otherOrg).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrgInvitation{OrgID: org.ID, Token: "active-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrgInvitation{OrgID: org.ID, Token: "expired-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(-time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	project := persistencemodel.Project{Name: "Project", OwnerID: 1, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	otherProject := persistencemodel.Project{Name: "Other Project", OwnerID: 2, OrgID: &otherOrg.ID}
	if err := db.Create(&otherProject).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.RawResource{Name: "Asset", OwnerID: 1, OrgID: &org.ID, Type: "image", FilePath: "asset.png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: 1, OrgID: &org.ID, RuntimeModelID: 1, OperationType: "image", InputTokens: 11, OutputTokens: 22, ImageCount: 3, Cost: 4.5}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: 2, OrgID: &otherOrg.ID, RuntimeModelID: 1, OperationType: "image", InputTokens: 99, OutputTokens: 99, ImageCount: 99, Cost: 99}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.AuditLog{OrgID: &org.ID, Action: "org.member.admin_added", TargetType: "org_member", TargetID: "1"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.AuditLog{Action: "org.admin_updated", TargetType: "organization", TargetID: "1"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.AuditLog{OrgID: &org.ID, ProjectID: &project.ID, Action: "project.admin_updated", TargetType: "project", TargetID: "1"}).Error; err != nil {
		t.Fatal(err)
	}

	detail, err := NewServiceWithIdentity(db, fakeAdminOrgIdentity{
		members: map[uint][]authidentity.OrganizationMember{
			org.ID: {
				{OrgID: org.ID, UserID: 1, Role: "owner"},
				{OrgID: org.ID, UserID: 2, Role: "member"},
				{OrgID: org.ID, UserID: 3, Role: "viewer"},
			},
		},
	}).Detail(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("Detail returned error: %v", err)
	}
	if detail.Org.ID != org.ID || detail.Org.MemberCount != 3 {
		t.Fatalf("unexpected org detail: %+v", detail.Org)
	}
	if detail.ActiveInvitations != 1 || detail.ProjectCount != 1 || detail.ResourceCount != 1 {
		t.Fatalf("unexpected counts: %+v", detail)
	}
	if len(detail.Projects) != 1 || detail.Projects[0].ID != project.ID {
		t.Fatalf("unexpected projects: %+v", detail.Projects)
	}
	if detail.Usage.Calls != 1 || detail.Usage.Cost != 4.5 || detail.Usage.InputTokens != 11 || detail.Usage.OutputTokens != 22 || detail.Usage.Images != 3 {
		t.Fatalf("unexpected usage: %+v", detail.Usage)
	}
	if detail.Audit.Records != 3 || detail.Audit.LastAction == "" || detail.Audit.LastAt == nil {
		t.Fatalf("unexpected audit summary: %+v", detail.Audit)
	}

	if _, err := NewServiceWithIdentity(db, fakeAdminOrgIdentity{}).Detail(context.Background(), 999); !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("missing org error = %v, want ErrOrgNotFound", err)
	}
}

func TestRotateJoinCodeUpdatesTeamOrgAndRejectsPersonalOrg(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminorg-rotate-join-code.db", &persistencemodel.Organization{})
	team := persistencemodel.Organization{Name: "Team", Slug: "team", JoinCode: "OLDTEAM123", Plan: "team", Status: "active", CreatedBy: 1}
	personal := persistencemodel.Organization{Name: "Personal", Slug: "personal", IsPersonal: true, Plan: "personal", Status: "active", CreatedBy: 2}
	if err := db.Create(&team).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&personal).Error; err != nil {
		t.Fatal(err)
	}
	service := NewServiceWithIdentity(db, fakeAdminOrgIdentity{
		members: map[uint][]authidentity.OrganizationMember{
			team.ID: {
				{OrgID: team.ID, UserID: 1, Role: domainorg.RoleOwner},
				{OrgID: team.ID, UserID: 2, Role: domainorg.RoleMember},
			},
		},
	})
	updated, err := service.RotateJoinCode(context.Background(), team.ID)
	if err != nil {
		t.Fatalf("RotateJoinCode returned error: %v", err)
	}
	if updated.JoinCode == "" || updated.JoinCode == "OLDTEAM123" || updated.MemberCount != 2 {
		t.Fatalf("unexpected rotated org: %#v", updated)
	}
	var stored persistencemodel.Organization
	if err := db.First(&stored, team.ID).Error; err != nil {
		t.Fatalf("load stored org: %v", err)
	}
	if stored.JoinCode != updated.JoinCode {
		t.Fatalf("stored join code = %q, want %q", stored.JoinCode, updated.JoinCode)
	}
	if _, err := service.RotateJoinCode(context.Background(), personal.ID); !errors.Is(err, ErrPersonalOrgJoinCode) {
		t.Fatalf("personal org error = %v, want ErrPersonalOrgJoinCode", err)
	}
	if _, err := service.RotateJoinCode(context.Background(), 999); !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("missing org error = %v, want ErrOrgNotFound", err)
	}
}

type fakeAdminOrgIdentity struct {
	members map[uint][]authidentity.OrganizationMember
}

func (f fakeAdminOrgIdentity) ListOrgMembers(_ context.Context, orgID uint) ([]authidentity.OrganizationMember, error) {
	members, ok := f.members[orgID]
	if !ok {
		return nil, authidentity.ErrOrgNotFound
	}
	return members, nil
}
