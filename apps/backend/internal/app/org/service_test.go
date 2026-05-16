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
	if _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}, nil); !errors.Is(err, ErrUserInactive) {
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
