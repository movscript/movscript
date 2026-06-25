package statickeys

import (
	"context"
	"testing"

	auth "github.com/movscript/auth-service/internal/domain/auth"
)

func TestStoreRejectsNonOpaqueKeys(t *testing.T) {
	if _, err := New([]ConfigRecord{{Key: "mv1.token", PrincipalID: "user_1"}}); err == nil {
		t.Fatal("expected non sk- key to be rejected")
	}
}

func TestStoreLooksUpConfiguredKeyByHash(t *testing.T) {
	store, err := FromJSON(`[{"key":"sk-test","principal_id":"user_1","type":"service","claims":{"scope":"admin"}}]`)
	if err != nil {
		t.Fatalf("FromJSON returned error: %v", err)
	}

	record, ok, err := store.Lookup(context.Background(), "sk-test")
	if err != nil {
		t.Fatalf("Lookup returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected key to be found")
	}
	if record.Principal.ID != "user_1" || record.Principal.Type != "service" {
		t.Fatalf("unexpected principal: %#v", record.Principal)
	}
	if record.Claims["scope"] != "admin" {
		t.Fatalf("unexpected claims: %#v", record.Claims)
	}
}

func TestStoreIssuesAndRevokesOpaqueKeys(t *testing.T) {
	store, err := New(nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}

	issued, err := store.Issue(context.Background(), auth.IssueKeyRequest{
		PrincipalID: "agent_1",
		Type:        "agent",
		DisplayName: "Agent One",
		Claims:      map[string]string{"scope": "project:read"},
		Prefix:      "sk-test",
		TokenID:     "token_agent_1",
	})
	if err != nil {
		t.Fatalf("Issue returned error: %v", err)
	}
	if issued.Token == "" || issued.TokenID != "token_agent_1" || issued.TokenType != "opaque" {
		t.Fatalf("unexpected issued key response: %#v", issued)
	}

	record, ok, err := store.Lookup(context.Background(), issued.Token)
	if err != nil {
		t.Fatalf("Lookup returned error: %v", err)
	}
	if !ok || record.Principal.ID != "agent_1" || record.Claims["scope"] != "project:read" {
		t.Fatalf("unexpected issued key record: %#v ok=%v", record, ok)
	}

	revoked, err := store.Revoke(context.Background(), auth.RevokeKeyRequest{TokenID: issued.TokenID})
	if err != nil {
		t.Fatalf("Revoke returned error: %v", err)
	}
	if !revoked.Revoked || revoked.TokenID != issued.TokenID {
		t.Fatalf("unexpected revoke response: %#v", revoked)
	}
	_, ok, err = store.Lookup(context.Background(), issued.Token)
	if err != nil {
		t.Fatalf("Lookup after revoke returned error: %v", err)
	}
	if ok {
		t.Fatal("expected revoked token to be inactive")
	}
}
