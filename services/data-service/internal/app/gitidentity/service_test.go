package gitidentity

import (
	"context"
	"strings"
	"testing"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
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

	credential, err := service.EnsureForUser(t.Context(), domainidentity.UserProfile{ID: 42, Username: "alice"})
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

	again, err := service.EnsureForUser(t.Context(), domainidentity.UserProfile{ID: 42, Username: "alice"})
	if err != nil {
		t.Fatalf("second EnsureForUser returned error: %v", err)
	}
	if again.Token != "gitea-user-token" || adapter.ensureUserCalls != 1 {
		t.Fatalf("second credential = %+v ensureUserCalls=%d", again, adapter.ensureUserCalls)
	}
}

type fakeGiteaAdapter struct {
	token            string
	accessAllowed    bool
	ensureUserCalls  int
	accessCheckCalls int
	lastUserInput    projectrepoapp.EnsureUserInput
	lastAccessInput  projectrepoapp.RepositoryAccessRequest
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

func (a *fakeGiteaAdapter) CheckRepoAccess(_ context.Context, request projectrepoapp.RepositoryAccessRequest) (projectrepoapp.RepositoryAccessResult, error) {
	a.accessCheckCalls++
	a.lastAccessInput = request
	if a.accessAllowed {
		return projectrepoapp.RepositoryAccessResult{Allowed: true, Permission: "write"}, nil
	}
	return projectrepoapp.RepositoryAccessResult{Allowed: false, Permission: "read"}, nil
}

func TestEnsureRepoAccessVerifiesRemoteCollaboratorPermission(t *testing.T) {
	db := testutil.OpenSQLite(t, "git-identity-access.db", &persistencemodel.UserGitCredential{})
	key := []byte("0123456789abcdef0123456789abcdef")
	encryptedToken, err := crypto.Encrypt("gitea-user-token", key)
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	if err := db.Create(&persistencemodel.UserGitCredential{
		UserID:         42,
		Provider:       ProviderGitea,
		Username:       "alice",
		EncryptedToken: encryptedToken,
		Status:         "active",
	}).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	adapter := &fakeGiteaAdapter{accessAllowed: true}
	service := NewService(db, adapter, Config{}, key)

	credential, err := service.EnsureRepoAccess(t.Context(), 42, "acme", "project")
	if err != nil {
		t.Fatalf("EnsureRepoAccess returned error: %v", err)
	}
	if credential.Username != "alice" {
		t.Fatalf("credential = %+v, want alice", credential)
	}
	if adapter.accessCheckCalls != 1 {
		t.Fatalf("accessCheckCalls = %d, want 1", adapter.accessCheckCalls)
	}
	if adapter.lastAccessInput.Owner != "acme" || adapter.lastAccessInput.Repo != "project" || adapter.lastAccessInput.Username != "alice" || adapter.lastAccessInput.Permission != "write" {
		t.Fatalf("access input = %+v, want write probe for acme/project alice", adapter.lastAccessInput)
	}
}

func TestEnsureRepoAccessFailsWhenRemotePermissionProbeDenies(t *testing.T) {
	db := testutil.OpenSQLite(t, "git-identity-access-denied.db", &persistencemodel.UserGitCredential{})
	key := []byte("0123456789abcdef0123456789abcdef")
	encryptedToken, err := crypto.Encrypt("gitea-user-token", key)
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	if err := db.Create(&persistencemodel.UserGitCredential{
		UserID:         42,
		Provider:       ProviderGitea,
		Username:       "alice",
		EncryptedToken: encryptedToken,
		Status:         "active",
	}).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	adapter := &fakeGiteaAdapter{accessAllowed: false}
	service := NewService(db, adapter, Config{}, key)

	_, err = service.EnsureRepoAccess(t.Context(), 42, "acme", "project")
	if err == nil || !strings.Contains(err.Error(), "does not have write access") {
		t.Fatalf("EnsureRepoAccess error = %v, want permission denial", err)
	}
}
