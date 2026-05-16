package auth

import (
	"context"
	"errors"
	"testing"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestStartChallengeReturnsDevCodeOnlyInLocalMode(t *testing.T) {
	db := testutil.OpenSQLite(t, "auth_service_challenge.db", &model.AuthChallenge{})

	prodResult, err := NewService(db).StartChallenge(context.Background(), ChallengeStartInput{Target: "alice@example.com"})
	if err != nil {
		t.Fatalf("StartChallenge(default) error = %v", err)
	}
	if prodResult.DevCode != "" {
		t.Fatalf("StartChallenge(default) DevCode = %q, want empty", prodResult.DevCode)
	}

	localResult, err := NewLocalService(db).StartChallenge(context.Background(), ChallengeStartInput{Target: "bob@example.com"})
	if err != nil {
		t.Fatalf("StartChallenge(local) error = %v", err)
	}
	if localResult.DevCode == "" {
		t.Fatal("StartChallenge(local) DevCode is empty")
	}
}

func TestLocalBootstrapDoesNotResetExistingSuperAdmin(t *testing.T) {
	db := testutil.OpenSQLite(t, "auth_service_bootstrap.db", &model.User{})
	row := model.User{
		Username:     "admin",
		PasswordHash: "old-hash",
		SystemRole:   domainauth.SystemRoleSuperAdmin,
		Status:       domainauth.UserStatusActive,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create super admin: %v", err)
	}

	_, err := NewLocalService(db).LocalBootstrap(context.Background(), LocalBootstrapInput{
		DisplayName: "Admin",
		Password:    "new-password",
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("LocalBootstrap() error = %v, want ErrConflict", err)
	}

	var stored model.User
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load super admin: %v", err)
	}
	if stored.PasswordHash != "old-hash" {
		t.Fatalf("PasswordHash = %q, want old-hash", stored.PasswordHash)
	}
}
