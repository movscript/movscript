package main

import (
	"path/filepath"
	"testing"

	identityapp "github.com/movscript/auth-service/internal/app/identity"
)

func TestBuildIdentityServiceUsesDatabaseWhenStaticIdentitiesAreUnset(t *testing.T) {
	t.Setenv("MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON", "")
	t.Setenv("MOVSCRIPT_AUTH_DB_DRIVER", "sqlite")
	t.Setenv("MOVSCRIPT_AUTH_DB_PATH", filepath.Join(t.TempDir(), "auth.db"))

	service, closeService, err := buildIdentityService()
	if err != nil {
		t.Fatalf("buildIdentityService returned error: %v", err)
	}
	defer closeService()
	if service == nil {
		t.Fatal("service = nil, want database-backed identity service")
	}
	if _, err := service.UserProfile(t.Context(), 404); err != identityapp.ErrUserNotFound {
		t.Fatalf("UserProfile err = %v, want ErrUserNotFound from database-backed service", err)
	}
}

func TestBuildIdentityServiceUsesExplicitStaticIdentities(t *testing.T) {
	t.Setenv("MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON", `{"users":[{"id":7,"username":"alice","system_role":"user","status":"active"}]}`)

	service, closeService, err := buildIdentityService()
	if err != nil {
		t.Fatalf("buildIdentityService returned error: %v", err)
	}
	defer closeService()

	profile, err := service.UserProfile(t.Context(), 7)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	if profile.ID != 7 || profile.Username != "alice" {
		t.Fatalf("profile = %#v", profile)
	}
}
