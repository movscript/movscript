package dbidentity

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	identityapp "github.com/movscript/auth-service/internal/app/identity"
	domainauth "github.com/movscript/auth-service/internal/domain/auth"
	"github.com/movscript/auth-service/internal/infra/db"
	persistencemodel "github.com/movscript/auth-service/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func TestStoreReadsUserProfileAndOrgMemberships(t *testing.T) {
	database := newTestDB(t)
	email := "alice@example.com"
	user := persistencemodel.User{
		Username:     "alice",
		SystemRole:   "user",
		PrimaryEmail: &email,
		Status:       "active",
	}
	if err := database.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	org := persistencemodel.Organization{
		Name:       "Studio",
		Slug:       "studio",
		Plan:       "team",
		Status:     "active",
		CreatedBy:  user.ID,
		IsPersonal: false,
	}
	if err := database.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	if err := database.Create(&persistencemodel.OrganizationMember{
		OrgID:  org.ID,
		UserID: user.ID,
		Role:   "owner",
	}).Error; err != nil {
		t.Fatalf("create member: %v", err)
	}

	store := New(database)
	profile, ok, err := store.UserProfile(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	if !ok || profile.ID != user.ID || profile.PrimaryEmail == nil || *profile.PrimaryEmail != email {
		t.Fatalf("profile = %#v ok=%v", profile, ok)
	}
	memberships, ok, err := store.OrgMemberships(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}
	if !ok || len(memberships) != 1 || memberships[0].OrgID != org.ID || memberships[0].Role != "owner" {
		t.Fatalf("memberships = %#v ok=%v", memberships, ok)
	}
}

func TestStoreReturnsMissingForUnknownUser(t *testing.T) {
	database := newTestDB(t)

	store := New(database)
	if _, ok, err := store.UserProfile(context.Background(), 404); err != nil || ok {
		t.Fatalf("UserProfile ok=%v err=%v, want missing nil", ok, err)
	}
	if _, ok, err := store.OrgMemberships(context.Background(), 404); err != nil || ok {
		t.Fatalf("OrgMemberships ok=%v err=%v, want missing nil", ok, err)
	}
}

func TestStoreCreatesListsAndUpdatesUsers(t *testing.T) {
	database := newTestDB(t)
	store := New(database)
	email := "alice@example.com"
	displayName := "Alice"

	profile, err := store.CreateUser(context.Background(), identityapp.CreateUserInput{
		Username:    "alice",
		Email:       &email,
		DisplayName: &displayName,
		SystemRole:  ptr(domainauth.SystemRoleUser),
		Status:      ptr(domainauth.UserStatusActive),
	})
	if err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}
	if profile.ID == 0 || profile.PrimaryEmail == nil || *profile.PrimaryEmail != email {
		t.Fatalf("profile = %#v", profile)
	}
	var createdRow persistencemodel.User
	if err := database.First(&createdRow, profile.ID).Error; err != nil {
		t.Fatalf("load created user: %v", err)
	}
	if createdRow.PasswordHash != "" {
		t.Fatalf("CreateUser stored password hash %q, want empty credential until explicit password update", createdRow.PasswordHash)
	}
	if _, err := store.SetUserPasswordHash(context.Background(), profile.ID, "hash-secret"); err != nil {
		t.Fatalf("SetUserPasswordHash returned error: %v", err)
	}
	var passwordRow persistencemodel.User
	if err := database.First(&passwordRow, profile.ID).Error; err != nil {
		t.Fatalf("load password user: %v", err)
	}
	if passwordRow.PasswordHash != "hash-secret" {
		t.Fatalf("password hash = %q, want explicit hash", passwordRow.PasswordHash)
	}

	page, err := store.ListUsers(context.Background(), identityapp.ListUsersFilter{Query: "ali", Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("ListUsers returned error: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].Username != "alice" {
		t.Fatalf("page = %#v", page)
	}

	updatedName := "Alice Updated"
	updated, err := store.UpdateUser(context.Background(), profile.ID, identityapp.UpdateUserSpec{
		DisplayName: &updatedName,
		Status:      ptr(domainauth.UserStatusSuspended),
	})
	if err != nil {
		t.Fatalf("UpdateUser returned error: %v", err)
	}
	if updated.DisplayName != updatedName || updated.Status != domainauth.UserStatusSuspended {
		t.Fatalf("updated = %#v", updated)
	}

	memberships, ok, err := store.OrgMemberships(context.Background(), profile.ID)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}
	if !ok || len(memberships) != 1 || !memberships[0].IsPersonal || memberships[0].Role != "owner" {
		t.Fatalf("memberships = %#v ok=%v", memberships, ok)
	}
}

func TestStoreCreatesUserWithPasswordInOneTransaction(t *testing.T) {
	database := newTestDB(t)
	store := New(database)

	profile, err := store.CreateUserWithPassword(context.Background(), identityapp.CreateUserInput{
		Username: "password-user",
	}, "hash-secret")
	if err != nil {
		t.Fatalf("CreateUserWithPassword returned error: %v", err)
	}
	var created persistencemodel.User
	if err := database.First(&created, profile.ID).Error; err != nil {
		t.Fatalf("load created user: %v", err)
	}
	if created.PasswordHash != "hash-secret" {
		t.Fatalf("password hash = %q, want hash-secret", created.PasswordHash)
	}
	memberships, ok, err := store.OrgMemberships(context.Background(), profile.ID)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}
	if !ok || len(memberships) != 1 || !memberships[0].IsPersonal || memberships[0].Role != "owner" {
		t.Fatalf("memberships = %#v ok=%v", memberships, ok)
	}

	_, err = store.CreateUserWithPassword(context.Background(), identityapp.CreateUserInput{Username: "empty-password"}, " ")
	if !errors.Is(err, identityapp.ErrInvalidPasswordHash) {
		t.Fatalf("empty password err = %v, want ErrInvalidPasswordHash", err)
	}
}

func TestStoreProtectsLastSuperAdmin(t *testing.T) {
	database := newTestDB(t)
	store := New(database)
	profile, err := store.CreateUser(context.Background(), identityapp.CreateUserInput{
		Username:   "admin",
		SystemRole: ptr(domainauth.SystemRoleSuperAdmin),
		Status:     ptr(domainauth.UserStatusActive),
	})
	if err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}

	_, err = store.UpdateUser(context.Background(), profile.ID, identityapp.UpdateUserSpec{
		SystemRole: ptr(domainauth.SystemRoleUser),
	})
	if !errors.Is(err, identityapp.ErrLastSuperAdmin) {
		t.Fatalf("UpdateUser err = %v, want ErrLastSuperAdmin", err)
	}
}

func TestStoreManagesOrgsAndMembers(t *testing.T) {
	database := newTestDB(t)
	store := New(database)
	owner, err := store.CreateUser(context.Background(), identityapp.CreateUserInput{
		Username: "owner",
	})
	if err != nil {
		t.Fatalf("CreateUser owner returned error: %v", err)
	}
	member, err := store.CreateUser(context.Background(), identityapp.CreateUserInput{
		Username: "member",
	})
	if err != nil {
		t.Fatalf("CreateUser member returned error: %v", err)
	}

	org, err := store.CreateOrg(context.Background(), identityapp.CreateOrgInput{
		Name:      "Studio",
		Slug:      "studio",
		CreatedBy: owner.ID,
		Plan:      domainauth.OrgPlanTeam,
		Status:    domainauth.OrgStatusActive,
	})
	if err != nil {
		t.Fatalf("CreateOrg returned error: %v", err)
	}
	if org.ID == 0 || org.Slug != "studio" || org.CreatedBy != owner.ID {
		t.Fatalf("org = %#v", org)
	}

	page, err := store.ListOrgs(context.Background(), identityapp.ListOrgsFilter{
		Query:    "studio",
		OrgID:    &org.ID,
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("ListOrgs returned error: %v", err)
	}
	if page.Total != 1 || page.Items[0].ID != org.ID {
		t.Fatalf("page = %#v", page)
	}

	renamed, err := store.UpdateOrg(context.Background(), org.ID, identityapp.UpdateOrgSpec{
		Name: ptr("Studio Updated"),
	})
	if err != nil {
		t.Fatalf("UpdateOrg returned error: %v", err)
	}
	if renamed.Name != "Studio Updated" {
		t.Fatalf("renamed = %#v", renamed)
	}

	added, err := store.AddOrgMember(context.Background(), org.ID, identityapp.OrgMemberInput{
		UserID: member.ID,
		Role:   domainauth.OrgRoleMember,
	})
	if err != nil {
		t.Fatalf("AddOrgMember returned error: %v", err)
	}
	if added.UserID != member.ID || added.Role != domainauth.OrgRoleMember || added.User == nil || added.User.Username != "member" {
		t.Fatalf("added = %#v", added)
	}

	updated, err := store.UpdateOrgMember(context.Background(), org.ID, member.ID, domainauth.OrgRoleAdmin)
	if err != nil {
		t.Fatalf("UpdateOrgMember returned error: %v", err)
	}
	if updated.Role != domainauth.OrgRoleAdmin {
		t.Fatalf("updated = %#v", updated)
	}

	if err := store.RemoveOrgMember(context.Background(), org.ID, owner.ID); !errors.Is(err, identityapp.ErrLastOrgOwner) {
		t.Fatalf("RemoveOrgMember owner err = %v, want ErrLastOrgOwner", err)
	}
	if _, err := store.UpdateOrgMember(context.Background(), org.ID, member.ID, domainauth.OrgRoleOwner); err != nil {
		t.Fatalf("promote member owner: %v", err)
	}
	if err := store.RemoveOrgMember(context.Background(), org.ID, owner.ID); err != nil {
		t.Fatalf("RemoveOrgMember owner returned error: %v", err)
	}
	members, err := store.ListOrgMembers(context.Background(), org.ID)
	if err != nil {
		t.Fatalf("ListOrgMembers returned error: %v", err)
	}
	if len(members) != 1 || members[0].UserID != member.ID {
		t.Fatalf("members = %#v", members)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := db.Connect(db.Config{Driver: "sqlite", Path: filepath.Join(t.TempDir(), "auth.db")})
	if err != nil {
		t.Fatalf("connect sqlite: %v", err)
	}
	if err := db.RunMigrations(database); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return database
}

func ptr(value string) *string {
	return &value
}
