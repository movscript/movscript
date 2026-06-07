package gitidentity

import (
	"context"
	"strings"
	"testing"

	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestEnsureForUserCreatesGiteaUserTokenAndStoresEncryptedCredential(t *testing.T) {
	db := testutil.OpenSQLite(t, "git-identity.db", &persistencemodel.UserGitCredential{})
	key := []byte("0123456789abcdef0123456789abcdef")
	adapter := &fakeGiteaAdapter{token: "gitea-user-token"}
	service := NewService(db, adapter, Config{
		UserEmailDomain: "users.example",
		UserTokenName:   "movscript-desktop",
	}, key)

	credential, err := service.EnsureForUser(t.Context(), domainauth.UserProfile{ID: 42, Username: "alice"})
	if err != nil {
		t.Fatalf("EnsureForUser returned error: %v", err)
	}
	if credential.Username != "alice" || credential.Token != "gitea-user-token" {
		t.Fatalf("unexpected credential: %+v", credential)
	}
	if adapter.ensureUserCalls != 1 || adapter.lastUserInput.Username != "alice" || adapter.lastUserInput.Email != "alice@users.example" {
		t.Fatalf("unexpected adapter call count/input: calls=%d input=%+v", adapter.ensureUserCalls, adapter.lastUserInput)
	}
	if !strings.HasPrefix(adapter.lastUserInput.TokenName, "movscript-desktop-42-") {
		t.Fatalf("token name = %q", adapter.lastUserInput.TokenName)
	}

	var row persistencemodel.UserGitCredential
	if err := db.First(&row, "user_id = ?", uint(42)).Error; err != nil {
		t.Fatalf("load credential row: %v", err)
	}
	if row.EncryptedToken == "" || strings.Contains(row.EncryptedToken, "gitea-user-token") {
		t.Fatalf("token was not encrypted: %q", row.EncryptedToken)
	}
	plain, err := crypto.Decrypt(row.EncryptedToken, key)
	if err != nil || plain != "gitea-user-token" {
		t.Fatalf("decrypt token = %q, %v", plain, err)
	}

	again, err := service.EnsureForUser(t.Context(), domainauth.UserProfile{ID: 42, Username: "alice"})
	if err != nil {
		t.Fatalf("second EnsureForUser returned error: %v", err)
	}
	if again.Token != "gitea-user-token" || adapter.ensureUserCalls != 1 {
		t.Fatalf("second credential = %+v ensureUserCalls=%d", again, adapter.ensureUserCalls)
	}
}

type fakeGiteaAdapter struct {
	token           string
	ensureUserCalls int
	lastUserInput   projectrepoapp.EnsureUserInput
}

func (a *fakeGiteaAdapter) EnsureUser(_ context.Context, input projectrepoapp.EnsureUserInput) (projectrepoapp.EnsureUserResult, error) {
	a.ensureUserCalls++
	a.lastUserInput = input
	return projectrepoapp.EnsureUserResult{
		ProviderUserID: "7",
		Username:       input.Username,
		Token:          a.token,
	}, nil
}

func (a *fakeGiteaAdapter) EnsureRepoCollaborator(context.Context, string, string, string, string) error {
	return nil
}
