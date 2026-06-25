package authprovider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLocalOwnerProviderReturnsLocalAuthContext(t *testing.T) {
	provider := NewLocalOwnerProvider(LocalOwnerOptions{
		Subject:     "local-owner",
		HomeID:      "home_1",
		WorkspaceID: "workspace_1",
	})

	authCtx, err := provider.Authenticate(context.Background(), Request{})
	if err != nil {
		t.Fatalf("Authenticate returned error: %v", err)
	}
	if !authCtx.Authenticated {
		t.Fatal("expected local owner to be authenticated")
	}
	if authCtx.Mode != ModeLocalOwner || authCtx.Principal.Kind != PrincipalLocalOwner {
		t.Fatalf("unexpected context: %#v", authCtx)
	}
	if authCtx.Local == nil || authCtx.Local.HomeID != "home_1" || authCtx.Local.WorkspaceID != "workspace_1" {
		t.Fatalf("unexpected local context: %#v", authCtx.Local)
	}
}

func TestNoAuthProviderIsExplicitlyUnauthenticated(t *testing.T) {
	provider := NewNoAuthProvider("")
	authCtx, err := provider.Authenticate(context.Background(), Request{})
	if err != nil {
		t.Fatalf("Authenticate returned error: %v", err)
	}
	decision, err := provider.Authorize(context.Background(), authCtx, "resource.read", nil)
	if err != nil {
		t.Fatalf("Authorize returned error: %v", err)
	}
	if authCtx.Authenticated || decision.Allowed {
		t.Fatalf("no-auth should not authenticate or authorize: %#v %#v", authCtx, decision)
	}
}

func TestOpaqueKeyProviderCallsAuthServiceIntrospection(t *testing.T) {
	var gotToken string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/auth/introspect" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		var req IntrospectionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		gotToken = req.Token
		_ = json.NewEncoder(w).Encode(IntrospectionResponse{
			Active: true,
			Principal: &wirePrincipal{
				ID:   "agent_1",
				Type: "agent",
			},
			Claims: map[string]string{"scope": "project:read"},
			AuthContext: &wireAuthContext{
				TokenID: "token_1",
			},
		})
	}))
	defer server.Close()

	provider, err := NewOpaqueKeyProvider(server.URL, server.Client())
	if err != nil {
		t.Fatalf("NewOpaqueKeyProvider returned error: %v", err)
	}
	authCtx, err := provider.Authenticate(context.Background(), Request{Token: "sk-test"})
	if err != nil {
		t.Fatalf("Authenticate returned error: %v", err)
	}
	if gotToken != "sk-test" {
		t.Fatalf("token = %q", gotToken)
	}
	if !authCtx.Authenticated || authCtx.Principal.Kind != PrincipalAgent || authCtx.Principal.Subject != "agent_1" {
		t.Fatalf("unexpected context: %#v", authCtx)
	}
	if authCtx.TokenID != "token_1" || authCtx.Claims["scope"] != "project:read" {
		t.Fatalf("unexpected auth metadata: %#v", authCtx)
	}
}

func TestOpaqueKeyProviderIgnoresNonOpaqueTokens(t *testing.T) {
	provider, err := NewOpaqueKeyProvider("http://auth.example", nil)
	if err != nil {
		t.Fatalf("NewOpaqueKeyProvider returned error: %v", err)
	}
	authCtx, err := provider.Authenticate(context.Background(), Request{Token: "mv1.legacy"})
	if err != nil {
		t.Fatalf("Authenticate returned error: %v", err)
	}
	if authCtx.Authenticated || authCtx.Principal.Subject != "missing-token" {
		t.Fatalf("unexpected context: %#v", authCtx)
	}
}
