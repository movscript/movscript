package bootstrap

import (
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/infra/config"
)

func TestBuildAuthProviderRequiresAuthServiceForCloudConfig(t *testing.T) {
	provider, err := buildAuthProvider(&config.Config{AppMode: "cloud", DependencyProfile: "external"})
	if err == nil {
		t.Fatal("buildAuthProvider returned nil error for cloud config without auth service")
	}
	if provider != nil {
		t.Fatalf("provider = %#v, want nil provider on configuration error", provider)
	}
}

func TestBuildAuthProviderUsesOpaqueKeyWhenAuthBaseURLIsConfigured(t *testing.T) {
	provider, err := buildAuthProvider(&config.Config{AuthBaseURL: "http://auth.example"})
	if err != nil {
		t.Fatalf("buildAuthProvider returned error: %v", err)
	}
	if provider == nil || provider.Mode() != authprovider.ModeOpaqueKey {
		t.Fatalf("provider = %#v, want opaque-key provider", provider)
	}
}

func TestBuildAuthProviderUsesLocalOwnerForLocalProfile(t *testing.T) {
	provider, err := buildAuthProvider(&config.Config{AppMode: "local", DependencyProfile: "local", DataDir: "/tmp/movscript"})
	if err != nil {
		t.Fatalf("buildAuthProvider returned error: %v", err)
	}
	if provider == nil || provider.Mode() != authprovider.ModeLocalOwner {
		t.Fatalf("provider = %#v, want local-owner provider", provider)
	}
	authCtx, err := provider.Authenticate(t.Context(), authprovider.Request{})
	if err != nil {
		t.Fatalf("Authenticate returned error: %v", err)
	}
	if authCtx.Claims["user_id"] != "1" || authCtx.Claims["username"] != "local-owner" {
		t.Fatalf("local auth claims = %#v, want local owner identity claims", authCtx.Claims)
	}
	if authCtx.Claims["system_role"] != domainidentity.SystemRoleSuperAdmin {
		t.Fatalf("local owner system_role = %q, want %q", authCtx.Claims["system_role"], domainidentity.SystemRoleSuperAdmin)
	}
	if authCtx.Claims["user_id"] != "1" || authidentity.LocalOwnerUserID != 1 {
		t.Fatalf("local auth identity constants drifted from provider claims")
	}
}

func TestBuildAuthProviderRequiresBaseURLForExplicitOpaqueMode(t *testing.T) {
	if _, err := buildAuthProvider(&config.Config{AuthMode: "opaque-key"}); err == nil {
		t.Fatal("expected opaque-key provider without base url to fail")
	}
}
