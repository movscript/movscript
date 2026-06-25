package bootstrap

import (
	"testing"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/movscript/internal/infra/config"
)

func TestBuildAuthIdentityManagerUsesOpaqueKeyAuthServiceConfig(t *testing.T) {
	manager, err := buildAuthIdentityManager(&config.Config{
		AuthBaseURL:         "http://auth.example",
		AuthManagementToken: "sk-admin",
	})
	if err != nil {
		t.Fatalf("buildAuthIdentityManager returned error: %v", err)
	}
	if manager == nil {
		t.Fatal("buildAuthIdentityManager returned nil manager")
	}
}

func TestBuildAuthIdentityManagerUsesLocalOwnerManager(t *testing.T) {
	manager, err := buildAuthIdentityManager(&config.Config{
		AppMode:           "local",
		DependencyProfile: "local",
		DataDir:           "/tmp/movscript",
	})
	if err != nil {
		t.Fatalf("buildAuthIdentityManager returned error: %v", err)
	}
	if manager == nil {
		t.Fatal("buildAuthIdentityManager returned nil manager for local owner mode")
	}
	profile, err := manager.UserProfile(t.Context(), 1)
	if err != nil {
		t.Fatalf("local manager UserProfile returned error: %v", err)
	}
	if profile.Username != "local-owner" {
		t.Fatalf("local profile username = %q, want local-owner", profile.Username)
	}
	if profile.SystemRole != domainidentity.SystemRoleSuperAdmin {
		t.Fatalf("local profile system_role = %q, want %q", profile.SystemRole, domainidentity.SystemRoleSuperAdmin)
	}
}
