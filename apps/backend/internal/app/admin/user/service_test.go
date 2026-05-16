package user

import (
	"context"
	"errors"
	"testing"
	"time"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func TestUpdatePreventsRemovingLastActiveSuperAdmin(t *testing.T) {
	db := newTestDB(t)
	admin := createUser(t, db, "admin", domainauth.SystemRoleSuperAdmin, domainauth.UserStatusActive)

	service := NewService(db)
	status := "disabled"
	_, err := service.Update(context.Background(), admin.ID, UpdateInput{Status: &status})
	if !errors.Is(err, ErrLastSuperAdmin) {
		t.Fatalf("err = %v, want ErrLastSuperAdmin", err)
	}
}

func TestUpdateAllowsRemovingSuperAdminWhenAnotherActiveSuperAdminExists(t *testing.T) {
	db := newTestDB(t)
	admin := createUser(t, db, "admin", domainauth.SystemRoleSuperAdmin, domainauth.UserStatusActive)
	createUser(t, db, "backup", domainauth.SystemRoleSuperAdmin, domainauth.UserStatusActive)

	service := NewService(db)
	role := domainauth.SystemRoleUser
	updated, err := service.Update(context.Background(), admin.ID, UpdateInput{SystemRole: &role})
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if updated.SystemRole != domainauth.SystemRoleUser {
		t.Fatalf("system_role = %q, want %q", updated.SystemRole, domainauth.SystemRoleUser)
	}
}

func TestUpdateProfileFieldsNormalizesClearsAndRejectsDuplicateEmail(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	otherEmail := "taken@example.com"
	other := createUser(t, db, "bob", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	if err := db.Model(&persistencemodel.User{}).Where("id = ?", other.ID).Update("primary_email", otherEmail).Error; err != nil {
		t.Fatalf("set other email: %v", err)
	}

	service := NewService(db)
	displayName := "  Alice Admin  "
	email := " ALICE@Example.COM "
	updated, err := service.Update(context.Background(), user.ID, UpdateInput{DisplayName: &displayName, Email: &email})
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	if updated.DisplayName != "Alice Admin" || updated.PrimaryEmail == nil || *updated.PrimaryEmail != "alice@example.com" || updated.EmailVerifiedAt == nil {
		t.Fatalf("unexpected updated user: %+v", updated)
	}

	blankEmail := " "
	updated, err = service.Update(context.Background(), user.ID, UpdateInput{Email: &blankEmail})
	if err != nil {
		t.Fatalf("clearing email returned error: %v", err)
	}
	if updated.PrimaryEmail != nil || updated.EmailVerifiedAt != nil {
		t.Fatalf("email was not cleared: %+v", updated)
	}

	badEmail := "not-an-email"
	if _, err := service.Update(context.Background(), user.ID, UpdateInput{Email: &badEmail}); !errors.Is(err, ErrInvalidEmail) {
		t.Fatalf("invalid email err = %v, want ErrInvalidEmail", err)
	}
	if _, err := service.Update(context.Background(), user.ID, UpdateInput{Email: &otherEmail}); !errors.Is(err, ErrUserConflict) {
		t.Fatalf("duplicate email err = %v, want ErrUserConflict", err)
	}
}

func TestUpdateNonActiveStatusRevokesUserSessions(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	session := persistencemodel.AuthSession{UserID: user.ID, TokenHash: "active-session", ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}

	displayName := "Alice"
	if _, err := NewService(db).Update(context.Background(), user.ID, UpdateInput{DisplayName: &displayName}); err != nil {
		t.Fatalf("profile update returned error: %v", err)
	}
	var afterProfile persistencemodel.AuthSession
	if err := db.First(&afterProfile, session.ID).Error; err != nil {
		t.Fatalf("load session after profile update: %v", err)
	}
	if afterProfile.RevokedAt != nil {
		t.Fatalf("profile update should not revoke session: %+v", afterProfile)
	}

	status := "suspended"
	if _, err := NewService(db).Update(context.Background(), user.ID, UpdateInput{Status: &status}); err != nil {
		t.Fatalf("status update returned error: %v", err)
	}
	var afterStatus persistencemodel.AuthSession
	if err := db.First(&afterStatus, session.ID).Error; err != nil {
		t.Fatalf("load session after status update: %v", err)
	}
	if afterStatus.RevokedAt == nil {
		t.Fatalf("non-active status update should revoke sessions")
	}
}

func TestListFiltersAndPaginatesUsers(t *testing.T) {
	db := newTestDB(t)
	createUser(t, db, "alice", domainauth.SystemRoleSuperAdmin, domainauth.UserStatusActive)
	createUser(t, db, "bob", domainauth.SystemRoleUser, "disabled")
	carol := createUser(t, db, "carol", domainauth.SystemRoleUser, domainauth.UserStatusActive)

	service := NewService(db)
	page, err := service.List(context.Background(), ListFilter{
		SystemRole: domainauth.SystemRoleUser,
		Status:     domainauth.UserStatusActive,
		Page:       1,
		PageSize:   10,
	})
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].Username != "carol" {
		t.Fatalf("unexpected page: %+v", page)
	}

	page, err = service.List(context.Background(), ListFilter{
		UserID:   &carol.ID,
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("List by user ID returned error: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != carol.ID {
		t.Fatalf("unexpected user ID page: %+v", page)
	}
}

func TestDetailIncludesMembershipsUsageAndAudit(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "member", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	org := persistencemodel.Organization{Name: "Studio", Slug: "studio", Plan: "team", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: user.ID, Role: "admin"}).Error; err != nil {
		t.Fatalf("create org member: %v", err)
	}
	project := persistencemodel.Project{Name: "Film", Status: "production", OwnerID: user.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: user.ID, Role: "owner"}).Error; err != nil {
		t.Fatalf("create project member: %v", err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: user.ID, AIModelConfigID: 1, ProjectID: &project.ID, OperationType: "image", ImageCount: 3, InputTokens: 11, OutputTokens: 22, Cost: 1.5}).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuditLog{ActorID: &user.ID, Action: "user.tested", TargetType: "user", TargetID: "1"}).Error; err != nil {
		t.Fatalf("create audit log: %v", err)
	}
	if err := db.Create(&persistencemodel.AuthSession{UserID: user.ID, TokenHash: "hash", ExpiresAt: time.Now().Add(time.Hour), UserAgent: "browser", IPAddress: "127.0.0.1"}).Error; err != nil {
		t.Fatalf("create auth session: %v", err)
	}

	detail, err := NewService(db).Detail(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("Detail returned error: %v", err)
	}
	if detail.User.ID != user.ID || len(detail.Orgs) != 1 || detail.Orgs[0].Role != "admin" {
		t.Fatalf("unexpected org detail: %+v", detail)
	}
	if len(detail.Projects) != 1 || detail.Projects[0].ID != project.ID || detail.Projects[0].Role != "owner" {
		t.Fatalf("unexpected project detail: %+v", detail.Projects)
	}
	if detail.Usage.Calls != 1 || detail.Usage.Images != 3 || detail.Usage.InputTokens != 11 || detail.Usage.OutputTokens != 22 {
		t.Fatalf("unexpected usage summary: %+v", detail.Usage)
	}
	if detail.Audit.Records != 1 || detail.Audit.LastAction != "user.tested" || detail.Audit.LastAt == nil {
		t.Fatalf("unexpected audit summary: %+v", detail.Audit)
	}
	if len(detail.Sessions) != 1 || detail.Sessions[0].UserAgent != "browser" || detail.Sessions[0].IPAddress != "127.0.0.1" {
		t.Fatalf("unexpected sessions: %+v", detail.Sessions)
	}
}

func TestCreateUserCreatesPersonalOrgAndValidatesPassword(t *testing.T) {
	db := newTestDB(t)
	service := NewService(db)
	if _, err := service.Create(context.Background(), CreateInput{Username: "alice", Password: "short"}); !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("short password err = %v, want ErrInvalidPassword", err)
	}
	email := "alice@example.com"
	displayName := "Alice"
	created, err := service.Create(context.Background(), CreateInput{
		Username:    "alice",
		Password:    "secret123",
		Email:       &email,
		DisplayName: &displayName,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if created.Username != "alice" || created.DisplayName != "Alice" || created.PrimaryEmail == nil || *created.PrimaryEmail != email {
		t.Fatalf("unexpected user: %+v", created)
	}
	var member persistencemodel.OrganizationMember
	if err := db.Where("user_id = ? AND role = ?", created.ID, domainorg.RoleOwner).First(&member).Error; err != nil {
		t.Fatalf("personal org member not created: %v", err)
	}
	if _, err := service.Create(context.Background(), CreateInput{Username: "alice", Password: "secret123"}); !errors.Is(err, ErrUserConflict) {
		t.Fatalf("duplicate user err = %v, want ErrUserConflict", err)
	}
}

func TestResetPasswordHashesPassword(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice", domainauth.SystemRoleUser, domainauth.UserStatusActive)

	updated, err := NewService(db).ResetPassword(context.Background(), user.ID, ResetPasswordInput{Password: "newpass123"})
	if err != nil {
		t.Fatalf("ResetPassword returned error: %v", err)
	}
	if updated.ID != user.ID {
		t.Fatalf("updated user ID = %d, want %d", updated.ID, user.ID)
	}
	var row persistencemodel.User
	if err := db.First(&row, user.ID).Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	if row.PasswordHash == "newpass123" || bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte("newpass123")) != nil {
		t.Fatalf("password hash was not updated correctly")
	}
}

func TestRevokeSessionScopesToUser(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	other := createUser(t, db, "bob", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	session := persistencemodel.AuthSession{UserID: user.ID, TokenHash: "hash1", ExpiresAt: time.Now().Add(time.Hour)}
	otherSession := persistencemodel.AuthSession{UserID: other.ID, TokenHash: "hash2", ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}
	if err := db.Create(&otherSession).Error; err != nil {
		t.Fatalf("create other session: %v", err)
	}

	service := NewService(db)
	if err := service.RevokeSession(context.Background(), user.ID, otherSession.ID); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("cross-user revoke err = %v, want ErrSessionNotFound", err)
	}
	if err := service.RevokeSession(context.Background(), user.ID, session.ID); err != nil {
		t.Fatalf("RevokeSession returned error: %v", err)
	}
	var row persistencemodel.AuthSession
	if err := db.First(&row, session.ID).Error; err != nil {
		t.Fatalf("load session: %v", err)
	}
	if row.RevokedAt == nil {
		t.Fatalf("session was not revoked: %+v", row)
	}
}

func TestRevokeAllSessionsRevokesOnlyUnrevokedUserSessions(t *testing.T) {
	db := newTestDB(t)
	user := createUser(t, db, "alice", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	other := createUser(t, db, "bob", domainauth.SystemRoleUser, domainauth.UserStatusActive)
	now := time.Now()
	activeOne := persistencemodel.AuthSession{UserID: user.ID, TokenHash: "active-1", ExpiresAt: now.Add(time.Hour)}
	activeTwo := persistencemodel.AuthSession{UserID: user.ID, TokenHash: "active-2", ExpiresAt: now.Add(2 * time.Hour)}
	expired := persistencemodel.AuthSession{UserID: user.ID, TokenHash: "expired", ExpiresAt: now.Add(-time.Hour)}
	alreadyRevokedAt := now.Add(-time.Minute)
	alreadyRevoked := persistencemodel.AuthSession{UserID: user.ID, TokenHash: "revoked", ExpiresAt: now.Add(time.Hour), RevokedAt: &alreadyRevokedAt}
	otherSession := persistencemodel.AuthSession{UserID: other.ID, TokenHash: "other-active", ExpiresAt: now.Add(time.Hour)}
	for _, session := range []*persistencemodel.AuthSession{&activeOne, &activeTwo, &expired, &alreadyRevoked, &otherSession} {
		if err := db.Create(session).Error; err != nil {
			t.Fatalf("create session: %v", err)
		}
	}

	count, err := NewService(db).RevokeAllSessions(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("RevokeAllSessions returned error: %v", err)
	}
	if count != 3 {
		t.Fatalf("revoked count = %d, want 3", count)
	}
	for _, id := range []uint{activeOne.ID, activeTwo.ID, expired.ID} {
		var row persistencemodel.AuthSession
		if err := db.First(&row, id).Error; err != nil {
			t.Fatalf("load revoked session: %v", err)
		}
		if row.RevokedAt == nil {
			t.Fatalf("session %d was not revoked", id)
		}
	}
	for _, id := range []uint{alreadyRevoked.ID, otherSession.ID} {
		var row persistencemodel.AuthSession
		if err := db.First(&row, id).Error; err != nil {
			t.Fatalf("load untouched session: %v", err)
		}
		if id == alreadyRevoked.ID {
			if row.RevokedAt == nil || !row.RevokedAt.Equal(alreadyRevokedAt) {
				t.Fatalf("already revoked session changed: %+v", row)
			}
			continue
		}
		if row.RevokedAt != nil {
			t.Fatalf("session %d should not be revoked: %+v", id, row)
		}
	}
	if _, err := NewService(db).RevokeAllSessions(context.Background(), 999); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("missing user err = %v, want ErrUserNotFound", err)
	}
}

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(
		t,
		"adminuser.db",
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
		&persistencemodel.AuthSession{},
	)
}

func createUser(t *testing.T, db *gorm.DB, username string, systemRole string, status string) persistencemodel.User {
	t.Helper()
	user := persistencemodel.User{Username: username, SystemRole: systemRole, Status: status}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	return user
}
