package org

import (
	"context"
	"errors"
	"testing"
	"time"

	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestResolveCurrentMemberRejectsSuspendedPreferredAndFallsBackToActive(t *testing.T) {
	db := newOrgTestDB(t)
	user := createOrgTestUser(t, db, "org-user")
	suspended := createOrgTestOrg(t, db, "Suspended", "suspended", "SUSPENDED1", true, domainorg.StatusSuspended, user.ID)
	active := createOrgTestOrg(t, db, "Active", "active", "ACTIVE1", false, domainorg.StatusActive, user.ID)
	createOrgTestMember(t, db, suspended.ID, user.ID, domainorg.RoleOwner)
	createOrgTestMember(t, db, active.ID, user.ID, domainorg.RoleMember)

	service := NewService(db)
	_, found, err := service.ResolveCurrentMember(context.Background(), user.ID, &suspended.ID)
	if !errors.Is(err, ErrSuspended) {
		t.Fatalf("preferred suspended err = %v, want ErrSuspended", err)
	}
	if found {
		t.Fatalf("preferred suspended found = true, want false")
	}

	member, found, err := service.ResolveCurrentMember(context.Background(), user.ID, nil)
	if err != nil {
		t.Fatalf("fallback resolve returned error: %v", err)
	}
	if !found || member.OrgID != active.ID {
		t.Fatalf("fallback member = %+v found=%v, want active org %d", member, found, active.ID)
	}
}

func TestJoinByCodeRejectsSuspendedOrg(t *testing.T) {
	db := newOrgTestDB(t)
	user := createOrgTestUser(t, db, "join-user")
	org := createOrgTestOrg(t, db, "Suspended", "join-suspended", "JOINCODE1", false, domainorg.StatusSuspended, user.ID)

	service := NewService(db)
	_, err := service.JoinByCode(context.Background(), org.JoinCode, domainorg.User{ID: user.ID, Username: user.Username})
	if !errors.Is(err, ErrSuspended) {
		t.Fatalf("JoinByCode err = %v, want ErrSuspended", err)
	}

	var count int64
	if err := db.Model(&persistencemodel.OrganizationMember{}).Where("org_id = ? AND user_id = ?", org.ID, user.ID).Count(&count).Error; err != nil {
		t.Fatalf("count members: %v", err)
	}
	if count != 0 {
		t.Fatalf("member count = %d, want 0", count)
	}
}

func TestMembershipEntryPointsRejectInactiveUsers(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "owner-user")
	disabled := createOrgTestUserWithStatus(t, db, "disabled-user", "disabled")
	org := createOrgTestOrg(t, db, "Active", "active-entry", "ACTIVECODE", false, domainorg.StatusActive, owner.ID)
	createOrgTestMember(t, db, org.ID, owner.ID, domainorg.RoleOwner)
	group := persistencemodel.UserGroup{OrgID: org.ID, Name: "Crew"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}
	invitation := persistencemodel.OrgInvitation{
		OrgID:     org.ID,
		Token:     "inactive-invite-token",
		Role:      domainorg.RoleMember,
		CreatedBy: owner.ID,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := db.Create(&invitation).Error; err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	service := NewService(db)
	caller := domainorg.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner}

	if _, err := service.AddMember(context.Background(), caller, MemberInput{UserID: disabled.ID, Role: domainorg.RoleMember}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AddMember disabled err = %v, want ErrUserInactive", err)
	}
	if _, err := service.AddMember(context.Background(), caller, MemberInput{Username: disabled.Username, Role: domainorg.RoleMember}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AddMember disabled username err = %v, want ErrUserInactive", err)
	}
	if _, err := service.JoinByCode(context.Background(), org.JoinCode, domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("JoinByCode disabled err = %v, want ErrUserInactive", err)
	}
	if _, _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}, nil); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AcceptInvitation disabled err = %v, want ErrUserInactive", err)
	}
	if _, err := service.AddGroupMember(context.Background(), caller, group.ID, disabled.ID); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AddGroupMember disabled err = %v, want ErrUserInactive", err)
	}

	var memberCount int64
	if err := db.Model(&persistencemodel.OrganizationMember{}).Where("org_id = ? AND user_id = ?", org.ID, disabled.ID).Count(&memberCount).Error; err != nil {
		t.Fatalf("count members: %v", err)
	}
	if memberCount != 0 {
		t.Fatalf("disabled member count = %d, want 0", memberCount)
	}
	var groupMemberCount int64
	if err := db.Model(&persistencemodel.UserGroupMember{}).Where("group_id = ? AND user_id = ?", group.ID, disabled.ID).Count(&groupMemberCount).Error; err != nil {
		t.Fatalf("count group members: %v", err)
	}
	if groupMemberCount != 0 {
		t.Fatalf("disabled group member count = %d, want 0", groupMemberCount)
	}
}

func TestAcceptInvitationConsumesSingleUseTokenForExistingMember(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "invite-owner")
	member := createOrgTestUser(t, db, "invite-member")
	org := createOrgTestOrg(t, db, "Invite Team", "invite-team", "INVITECODE", false, domainorg.StatusActive, owner.ID)
	createOrgTestMember(t, db, org.ID, owner.ID, domainorg.RoleOwner)
	createOrgTestMember(t, db, org.ID, member.ID, domainorg.RoleMember)
	invitation := persistencemodel.OrgInvitation{
		OrgID:     org.ID,
		Token:     "single-use-token",
		Role:      domainorg.RoleMember,
		CreatedBy: owner.ID,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := db.Create(&invitation).Error; err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	service := NewService(db)
	if _, _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: member.ID, Username: member.Username, Status: member.Status}, nil); err != nil {
		t.Fatalf("AcceptInvitation existing member returned error: %v", err)
	}
	if _, _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: owner.ID, Username: owner.Username, Status: owner.Status}, nil); !errors.Is(err, ErrInviteUsed) {
		t.Fatalf("second AcceptInvitation err = %v, want ErrInviteUsed", err)
	}
	var consumed persistencemodel.OrgInvitation
	if err := db.First(&consumed, invitation.ID).Error; err != nil {
		t.Fatalf("load consumed invitation: %v", err)
	}
	if consumed.UsedAt == nil || consumed.UsedBy == nil || *consumed.UsedBy != member.ID {
		t.Fatalf("invitation was not consumed by existing member: %+v", consumed)
	}
}

func TestPersonalOrgRejectsTeamManagement(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "personal-owner")
	member := createOrgTestUser(t, db, "personal-member")
	personal := createOrgTestOrg(t, db, "Personal", "personal", "", true, domainorg.StatusActive, owner.ID)
	createOrgTestMember(t, db, personal.ID, owner.ID, domainorg.RoleOwner)

	service := NewService(db)
	caller := domainorg.OrganizationMember{OrgID: personal.ID, UserID: owner.ID, Role: domainorg.RoleOwner}

	if _, err := service.AddMember(context.Background(), caller, MemberInput{UserID: member.ID, Role: domainorg.RoleMember}); !errors.Is(err, ErrPersonalOrg) {
		t.Fatalf("AddMember personal err = %v, want ErrPersonalOrg", err)
	}
	if _, err := service.CreateInvitation(context.Background(), caller, owner.ID, InvitationInput{Role: domainorg.RoleMember}); !errors.Is(err, ErrPersonalOrg) {
		t.Fatalf("CreateInvitation personal err = %v, want ErrPersonalOrg", err)
	}
	if _, err := service.CreateGroup(context.Background(), caller, GroupInput{Name: "Crew"}); !errors.Is(err, ErrPersonalOrg) {
		t.Fatalf("CreateGroup personal err = %v, want ErrPersonalOrg", err)
	}
	if _, err := service.GetUsage(context.Background(), personal.ID); !errors.Is(err, ErrPersonalOrg) {
		t.Fatalf("GetUsage personal err = %v, want ErrPersonalOrg", err)
	}
}

func TestMemberRoleAndOwnerGuards(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "owner-guard")
	admin := createOrgTestUser(t, db, "admin-guard")
	member := createOrgTestUser(t, db, "member-guard")
	org := createOrgTestOrg(t, db, "Team", "owner-guard-team", "OWNERGUARD", false, domainorg.StatusActive, owner.ID)
	createOrgTestMember(t, db, org.ID, owner.ID, domainorg.RoleOwner)
	createOrgTestMember(t, db, org.ID, admin.ID, domainorg.RoleAdmin)
	createOrgTestMember(t, db, org.ID, member.ID, domainorg.RoleMember)

	service := NewService(db)
	ownerCaller := domainorg.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner}
	adminCaller := domainorg.OrganizationMember{OrgID: org.ID, UserID: admin.ID, Role: domainorg.RoleAdmin}

	if _, err := service.AddMember(context.Background(), ownerCaller, MemberInput{UserID: member.ID, Role: "bad"}); !errors.Is(err, ErrInvalidRole) {
		t.Fatalf("AddMember invalid role err = %v, want ErrInvalidRole", err)
	}
	if err := service.UpdateMember(context.Background(), adminCaller, owner.ID, domainorg.RoleMember); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin demote owner err = %v, want ErrForbidden", err)
	}
	if err := service.UpdateMember(context.Background(), ownerCaller, owner.ID, domainorg.RoleAdmin); !errors.Is(err, ErrForbidden) {
		t.Fatalf("self demote err = %v, want ErrForbidden", err)
	}
	if err := service.UpdateMember(context.Background(), ownerCaller, owner.ID, domainorg.RoleMember); !errors.Is(err, ErrForbidden) {
		t.Fatalf("self demote last owner err = %v, want ErrForbidden", err)
	}
	if err := service.RemoveMember(context.Background(), ownerCaller, owner.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("self remove err = %v, want ErrForbidden", err)
	}
}

func TestGroupMembershipRequiresCallerOrg(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "group-owner")
	member := createOrgTestUser(t, db, "group-member")
	org := createOrgTestOrg(t, db, "Team A", "team-a", "TEAMACODE", false, domainorg.StatusActive, owner.ID)
	otherOrg := createOrgTestOrg(t, db, "Team B", "team-b", "TEAMBCODE", false, domainorg.StatusActive, owner.ID)
	createOrgTestMember(t, db, org.ID, owner.ID, domainorg.RoleOwner)
	otherGroup := persistencemodel.UserGroup{OrgID: otherOrg.ID, Name: "Other"}
	if err := db.Create(&otherGroup).Error; err != nil {
		t.Fatalf("create other group: %v", err)
	}

	service := NewService(db)
	caller := domainorg.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner}
	if _, err := service.AddGroupMember(context.Background(), caller, otherGroup.ID, member.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("AddGroupMember cross org err = %v, want ErrForbidden", err)
	}
	if err := service.RemoveGroupMember(context.Background(), caller, otherGroup.ID, member.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("RemoveGroupMember cross org err = %v, want ErrForbidden", err)
	}
}

func newOrgTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "org-service.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.OrgInvitation{}, &persistencemodel.UserGroup{}, &persistencemodel.UserGroupMember{})
}

func createOrgTestUser(t *testing.T, db *gorm.DB, username string) persistencemodel.User {
	return createOrgTestUserWithStatus(t, db, username, "active")
}

func createOrgTestUserWithStatus(t *testing.T, db *gorm.DB, username string, status string) persistencemodel.User {
	t.Helper()
	user := persistencemodel.User{Username: username, Status: status}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func createOrgTestOrg(t *testing.T, db *gorm.DB, name string, slug string, joinCode string, personal bool, status string, creatorID uint) persistencemodel.Organization {
	t.Helper()
	org := persistencemodel.Organization{
		Name:       name,
		Slug:       slug,
		JoinCode:   joinCode,
		IsPersonal: personal,
		Plan:       domainorg.PlanTeam,
		Status:     status,
		CreatedBy:  creatorID,
	}
	if personal {
		org.Plan = domainorg.PlanPersonal
	}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org %q: %v", name, err)
	}
	return org
}

func createOrgTestMember(t *testing.T, db *gorm.DB, orgID uint, userID uint, role string) persistencemodel.OrganizationMember {
	t.Helper()
	member := persistencemodel.OrganizationMember{OrgID: orgID, UserID: userID, Role: role}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create org member: %v", err)
	}
	return member
}
