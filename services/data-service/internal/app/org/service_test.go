package org

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestJoinByCodeRejectsSuspendedOrg(t *testing.T) {
	db := newOrgTestDB(t)
	user := createOrgTestUser(t, db, "join-user")
	org := createOrgTestOrg(t, db, "Suspended", "join-suspended", "JOINCODE1", false, domainorg.StatusSuspended, user.ID)

	service := NewService(db)
	_, err := service.JoinByCode(context.Background(), org.JoinCode, domainorg.User{ID: user.ID, Username: user.Username})
	if !errors.Is(err, ErrSuspended) {
		t.Fatalf("JoinByCode err = %v, want ErrSuspended", err)
	}
}

func TestMembershipEntryPointsRejectInactiveUsers(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "owner-user")
	disabled := createOrgTestUserWithStatus(t, db, "disabled-user", "disabled")
	org := createOrgTestOrg(t, db, "Active", "active-entry", "ACTIVECODE", false, domainorg.StatusActive, owner.ID)
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

	if _, err := service.AddMember(context.Background(), caller, domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}, MemberInput{Role: domainorg.RoleMember}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AddMember disabled err = %v, want ErrUserInactive", err)
	}
	if _, err := service.JoinByCode(context.Background(), org.JoinCode, domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("JoinByCode disabled err = %v, want ErrUserInactive", err)
	}
	if _, _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AcceptInvitation disabled err = %v, want ErrUserInactive", err)
	}
	if _, err := service.AddGroupMember(context.Background(), caller, group.ID, domainorg.User{ID: disabled.ID, Username: disabled.Username, Status: disabled.Status}); !errors.Is(err, ErrUserInactive) {
		t.Fatalf("AddGroupMember disabled err = %v, want ErrUserInactive", err)
	}

	var groupMemberCount int64
	if err := db.Model(&persistencemodel.UserGroupMember{}).Where("group_id = ? AND user_id = ?", group.ID, disabled.ID).Count(&groupMemberCount).Error; err != nil {
		t.Fatalf("count group members: %v", err)
	}
	if groupMemberCount != 0 {
		t.Fatalf("disabled group member count = %d, want 0", groupMemberCount)
	}
}

func TestListMembersEnrichesUsersFromAuthIdentity(t *testing.T) {
	db := newOrgTestDB(t)
	ownerID := uint(7001)
	memberID := uint(7002)
	org := createOrgTestOrg(t, db, "Identity Team", "identity-team", "IDENTITY1", false, domainorg.StatusActive, ownerID)

	service := NewServiceWithIdentity(db, fakeOrgIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			ownerID:  {ID: ownerID, Username: "auth-owner", Status: domainidentity.UserStatusActive},
			memberID: {ID: memberID, Username: "auth-member", Status: domainidentity.UserStatusActive},
		},
		members: map[uint]map[uint]authidentity.OrganizationMember{
			org.ID: {
				ownerID:  {ID: 1, OrgID: org.ID, UserID: ownerID, Role: domainorg.RoleOwner},
				memberID: {ID: 2, OrgID: org.ID, UserID: memberID, Role: domainorg.RoleMember},
			},
		},
	})
	members, err := service.ListMembers(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("ListMembers returned error: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("members len = %d, want 2", len(members))
	}
	seen := map[uint]string{}
	for _, member := range members {
		if member.User == nil {
			t.Fatalf("member %d user = nil", member.UserID)
		}
		seen[member.UserID] = member.User.Username
	}
	if seen[ownerID] != "auth-owner" || seen[memberID] != "auth-member" {
		t.Fatalf("member users = %+v", seen)
	}
}

func TestListGroupsEnrichesMembersFromAuthIdentity(t *testing.T) {
	db := newOrgTestDB(t)
	ownerID := uint(7101)
	memberID := uint(7102)
	org := createOrgTestOrg(t, db, "Group Identity Team", "group-identity-team", "GROUPID1", false, domainorg.StatusActive, ownerID)
	group := persistencemodel.UserGroup{OrgID: org.ID, Name: "Crew"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}
	if err := db.Create(&persistencemodel.UserGroupMember{GroupID: group.ID, UserID: memberID}).Error; err != nil {
		t.Fatalf("create group member: %v", err)
	}

	service := NewServiceWithIdentity(db, fakeOrgIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			memberID: {ID: memberID, Username: "auth-group-member", Status: domainidentity.UserStatusActive},
		},
	})
	groups, err := service.ListGroups(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("ListGroups returned error: %v", err)
	}
	if len(groups) != 1 || len(groups[0].Members) != 1 {
		t.Fatalf("groups = %+v, want one group member", groups)
	}
	user := groups[0].Members[0].User
	if user == nil || user.Username != "auth-group-member" {
		t.Fatalf("group member user = %+v", user)
	}
}

func TestAcceptInvitationConsumesSingleUseTokenForExistingMember(t *testing.T) {
	db := newOrgTestDB(t)
	owner := createOrgTestUser(t, db, "invite-owner")
	member := createOrgTestUser(t, db, "invite-member")
	org := createOrgTestOrg(t, db, "Invite Team", "invite-team", "INVITECODE", false, domainorg.StatusActive, owner.ID)
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

	service := NewServiceWithIdentity(db, fakeOrgIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID:  {ID: owner.ID, Username: owner.Username, Status: owner.Status},
			member.ID: {ID: member.ID, Username: member.Username, Status: member.Status},
		},
		members: map[uint]map[uint]authidentity.OrganizationMember{
			org.ID: {
				member.ID: {ID: 1, OrgID: org.ID, UserID: member.ID, Role: domainorg.RoleMember},
			},
		},
	})
	if _, _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: member.ID, Username: member.Username, Status: member.Status}); err != nil {
		t.Fatalf("AcceptInvitation existing member returned error: %v", err)
	}
	if _, _, err := service.AcceptInvitation(context.Background(), invitation.Token, &domainorg.User{ID: owner.ID, Username: owner.Username, Status: owner.Status}); !errors.Is(err, ErrInviteUsed) {
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

	service := NewService(db)
	caller := domainorg.OrganizationMember{OrgID: personal.ID, UserID: owner.ID, Role: domainorg.RoleOwner}

	if _, err := service.AddMember(context.Background(), caller, domainorg.User{ID: member.ID, Username: member.Username, Status: member.Status}, MemberInput{Role: domainorg.RoleMember}); !errors.Is(err, ErrPersonalOrg) {
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

	service := NewServiceWithIdentity(db, fakeOrgIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			owner.ID:  {ID: owner.ID, Username: owner.Username, Status: owner.Status},
			admin.ID:  {ID: admin.ID, Username: admin.Username, Status: admin.Status},
			member.ID: {ID: member.ID, Username: member.Username, Status: member.Status},
		},
		members: map[uint]map[uint]authidentity.OrganizationMember{
			org.ID: {
				owner.ID:  {ID: 1, OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner},
				admin.ID:  {ID: 2, OrgID: org.ID, UserID: admin.ID, Role: domainorg.RoleAdmin},
				member.ID: {ID: 3, OrgID: org.ID, UserID: member.ID, Role: domainorg.RoleMember},
			},
		},
	})
	ownerCaller := domainorg.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner}
	adminCaller := domainorg.OrganizationMember{OrgID: org.ID, UserID: admin.ID, Role: domainorg.RoleAdmin}

	if _, err := service.AddMember(context.Background(), ownerCaller, domainorg.User{ID: member.ID, Username: member.Username, Status: member.Status}, MemberInput{Role: "bad"}); !errors.Is(err, ErrInvalidRole) {
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
	otherGroup := persistencemodel.UserGroup{OrgID: otherOrg.ID, Name: "Other"}
	if err := db.Create(&otherGroup).Error; err != nil {
		t.Fatalf("create other group: %v", err)
	}

	service := NewService(db)
	caller := domainorg.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner}
	if _, err := service.AddGroupMember(context.Background(), caller, otherGroup.ID, domainorg.User{ID: member.ID, Username: member.Username, Status: member.Status}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("AddGroupMember cross org err = %v, want ErrForbidden", err)
	}
	if err := service.RemoveGroupMember(context.Background(), caller, otherGroup.ID, member.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("RemoveGroupMember cross org err = %v, want ErrForbidden", err)
	}
}

func newOrgTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "org-service.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{}, &persistencemodel.UserGroup{}, &persistencemodel.UserGroupMember{})
}

func createOrgTestUser(t *testing.T, db *gorm.DB, username string) testutil.ExternalUser {
	return createOrgTestUserWithStatus(t, db, username, "active")
}

func createOrgTestUserWithStatus(t *testing.T, _ *gorm.DB, username string, status string) testutil.ExternalUser {
	t.Helper()
	nextOrgTestUserID++
	return testutil.NewExternalUserWithStatus(nextOrgTestUserID, username, status)
}

var nextOrgTestUserID uint = 100

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

type fakeOrgIdentity struct {
	profiles map[uint]domainidentity.UserProfile
	members  map[uint]map[uint]authidentity.OrganizationMember
}

func (f fakeOrgIdentity) UserProfile(_ context.Context, userID uint) (domainidentity.UserProfile, error) {
	if profile, ok := f.profiles[userID]; ok {
		return profile, nil
	}
	return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
}

func (f fakeOrgIdentity) OrgMemberships(context.Context, uint) ([]authidentity.OrgMembership, error) {
	return nil, nil
}

func (f fakeOrgIdentity) ListOrgMembers(_ context.Context, orgID uint) ([]authidentity.OrganizationMember, error) {
	members := make([]authidentity.OrganizationMember, 0)
	for _, member := range f.members[orgID] {
		if member.User == nil {
			if profile, ok := f.profiles[member.UserID]; ok {
				user := profile
				member.User = &user
			}
		}
		members = append(members, member)
	}
	return members, nil
}

func (f fakeOrgIdentity) AddOrgMember(_ context.Context, orgID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	if input.UserID == 0 {
		return authidentity.OrganizationMember{}, authidentity.ErrUserNotFound
	}
	if f.members == nil {
		f.members = map[uint]map[uint]authidentity.OrganizationMember{}
	}
	if f.members[orgID] == nil {
		f.members[orgID] = map[uint]authidentity.OrganizationMember{}
	}
	if _, ok := f.members[orgID][input.UserID]; ok {
		return authidentity.OrganizationMember{}, authidentity.ErrConflict
	}
	role := input.Role
	if role == "" {
		role = domainorg.RoleMember
	}
	member := authidentity.OrganizationMember{ID: uint(len(f.members[orgID]) + 1), OrgID: orgID, UserID: input.UserID, Role: role}
	if profile, ok := f.profiles[input.UserID]; ok {
		member.User = &profile
	}
	f.members[orgID][input.UserID] = member
	return member, nil
}

func (f fakeOrgIdentity) UpdateOrgMember(_ context.Context, orgID uint, userID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	member, ok := f.members[orgID][userID]
	if !ok {
		return authidentity.OrganizationMember{}, authidentity.ErrUserNotFound
	}
	member.Role = input.Role
	f.members[orgID][userID] = member
	return member, nil
}

func (f fakeOrgIdentity) RemoveOrgMember(_ context.Context, orgID uint, userID uint) (bool, error) {
	if _, ok := f.members[orgID][userID]; !ok {
		return false, authidentity.ErrUserNotFound
	}
	delete(f.members[orgID], userID)
	return true, nil
}
