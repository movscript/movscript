package orgadmin

import (
	"context"
	"errors"
	"testing"
	"time"

	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestCreateCreatesTeamOrgWithOwnerAndRejectsDuplicateSlug(t *testing.T) {
	db := testutil.OpenSQLite(t, "orgadmin-create.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	owner := persistencemodel.User{Username: "org-owner", SystemRole: "user"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}
	service := NewService(db)

	created, err := service.Create(context.Background(), CreateInput{Name: "  Production Team  ", Slug: "Production Team", OwnerUserID: owner.ID})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if created.Name != "Production Team" || created.Slug != "production-team" || created.Plan != domainorg.PlanTeam || created.Status != domainorg.StatusActive || created.IsPersonal {
		t.Fatalf("unexpected created org: %#v", created)
	}
	if created.CreatedBy != owner.ID || created.JoinCode == "" || created.MemberCount != 1 {
		t.Fatalf("unexpected created org ownership/count: %#v", created)
	}
	var member persistencemodel.OrganizationMember
	if err := db.Where("org_id = ? AND user_id = ?", created.ID, owner.ID).First(&member).Error; err != nil {
		t.Fatalf("expected owner member: %v", err)
	}
	if member.Role != domainorg.RoleOwner {
		t.Fatalf("owner member role = %q, want owner", member.Role)
	}

	_, err = service.Create(context.Background(), CreateInput{Name: "Other", Slug: "production-team", OwnerUserID: owner.ID})
	if !errors.Is(err, ErrOrgAlreadyExists) {
		t.Fatalf("duplicate slug error = %v, want ErrOrgAlreadyExists", err)
	}
	_, err = service.Create(context.Background(), CreateInput{Name: "Missing Owner", OwnerUserID: 999})
	if !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("missing owner error = %v, want ErrUserNotFound", err)
	}
	disabledOwner := persistencemodel.User{Username: "disabled-owner", SystemRole: "user", Status: "disabled"}
	if err := db.Create(&disabledOwner).Error; err != nil {
		t.Fatal(err)
	}
	_, err = service.Create(context.Background(), CreateInput{Name: "Disabled Owner", OwnerUserID: disabledOwner.ID})
	if !errors.Is(err, ErrUserInactive) {
		t.Fatalf("disabled owner error = %v, want ErrUserInactive", err)
	}
	_, err = service.Create(context.Background(), CreateInput{Name: "  ", OwnerUserID: owner.ID})
	if !errors.Is(err, ErrInvalidOrgName) {
		t.Fatalf("blank name error = %v, want ErrInvalidOrgName", err)
	}
}

func TestAddMemberCreatesRejectsDuplicateAndRestoresSoftDeletedMember(t *testing.T) {
	db := testutil.OpenSQLite(t, "orgadmin.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.OrgInvitation{})
	user := persistencemodel.User{Username: "member-user", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: "team", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	service := NewService(db)

	created, err := service.AddMember(context.Background(), org.ID, AddMemberInput{UserID: user.ID, Role: "admin"})
	if err != nil {
		t.Fatalf("AddMember returned error: %v", err)
	}
	if created.UserID != user.ID || created.OrgID != org.ID || created.Role != "admin" {
		t.Fatalf("unexpected created member: %#v", created)
	}

	_, err = service.AddMember(context.Background(), org.ID, AddMemberInput{UserID: user.ID, Role: "member"})
	if !errors.Is(err, ErrMemberAlreadyExists) {
		t.Fatalf("duplicate AddMember error = %v, want ErrMemberAlreadyExists", err)
	}

	if err := service.RemoveMember(context.Background(), org.ID, user.ID); err != nil {
		t.Fatalf("RemoveMember returned error: %v", err)
	}
	restored, err := service.AddMember(context.Background(), org.ID, AddMemberInput{UserID: user.ID, Role: "viewer"})
	if err != nil {
		t.Fatalf("restoring AddMember returned error: %v", err)
	}
	if restored.ID != created.ID || restored.Role != "viewer" {
		t.Fatalf("unexpected restored member: %#v, created %#v", restored, created)
	}
	members, err := service.ListMembers(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("ListMembers returned error: %v", err)
	}
	if len(members) != 1 || members[0].ID != created.ID || members[0].Role != "viewer" {
		t.Fatalf("unexpected members after restore: %#v", members)
	}
	disabledUser := persistencemodel.User{Username: "disabled-member", SystemRole: "user", Status: "disabled"}
	if err := db.Create(&disabledUser).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddMember(context.Background(), org.ID, AddMemberInput{UserID: disabledUser.ID, Role: "member"}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("disabled member error = %v, want ErrUserInactive", err)
	}
}

func TestCreateInvitationDefaultsRoleAndValidatesOrg(t *testing.T) {
	db := testutil.OpenSQLite(t, "orgadmin-invitation.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{})
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

func TestDetailReturnsOrgOperationalSummary(t *testing.T) {
	db := testutil.OpenSQLite(t, "orgadmin-detail.db",
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
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
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: 1, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: 2, Role: "member"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrgInvitation{OrgID: org.ID, Token: "active-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrgInvitation{OrgID: org.ID, Token: "expired-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(-time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	project := persistencemodel.Project{Name: "Project", OwnerID: 1, OrgID: &org.ID, Status: "planning"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	otherProject := persistencemodel.Project{Name: "Other Project", OwnerID: 2, OrgID: &otherOrg.ID, Status: "planning"}
	if err := db.Create(&otherProject).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.RawResource{Name: "Asset", OwnerID: 1, OrgID: &org.ID, Type: "image", FilePath: "asset.png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: 1, OrgID: &org.ID, AIModelConfigID: 1, OperationType: "image", InputTokens: 11, OutputTokens: 22, ImageCount: 3, Cost: 4.5}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: 2, OrgID: &otherOrg.ID, AIModelConfigID: 1, OperationType: "image", InputTokens: 99, OutputTokens: 99, ImageCount: 99, Cost: 99}).Error; err != nil {
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

	detail, err := NewService(db).Detail(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("Detail returned error: %v", err)
	}
	if detail.Org.ID != org.ID || detail.Org.MemberCount != 2 {
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

	if _, err := NewService(db).Detail(context.Background(), 999); !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("missing org error = %v, want ErrOrgNotFound", err)
	}
}

func TestRotateJoinCodeUpdatesTeamOrgAndRejectsPersonalOrg(t *testing.T) {
	db := testutil.OpenSQLite(t, "orgadmin-rotate-join-code.db", &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	team := persistencemodel.Organization{Name: "Team", Slug: "team", JoinCode: "OLDTEAM123", Plan: "team", Status: "active", CreatedBy: 1}
	personal := persistencemodel.Organization{Name: "Personal", Slug: "personal", IsPersonal: true, Plan: "personal", Status: "active", CreatedBy: 2}
	if err := db.Create(&team).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&personal).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: team.ID, UserID: 1, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}

	service := NewService(db)
	updated, err := service.RotateJoinCode(context.Background(), team.ID)
	if err != nil {
		t.Fatalf("RotateJoinCode returned error: %v", err)
	}
	if updated.JoinCode == "" || updated.JoinCode == "OLDTEAM123" || updated.MemberCount != 1 {
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
