package introspection

import (
	"context"
	"errors"
	"testing"

	domainauth "github.com/movscript/auth-service/internal/domain/auth"
)

type memoryKeyStore map[string]KeyRecord

func (s memoryKeyStore) Lookup(_ context.Context, token string) (KeyRecord, bool, error) {
	record, ok := s[token]
	return record, ok, nil
}

type memoryKeyManager struct {
	memoryKeyStore
	issued  domainauth.IssueKeyRequest
	revoked domainauth.RevokeKeyRequest
}

func (s *memoryKeyManager) Issue(_ context.Context, request domainauth.IssueKeyRequest) (domainauth.IssueKeyResponse, error) {
	s.issued = request
	return domainauth.IssueKeyResponse{
		Token:     "sk-issued",
		TokenID:   "token_issued",
		TokenType: "opaque",
		Principal: domainauth.Principal{ID: request.PrincipalID, Type: request.Type},
		Claims:    request.Claims,
	}, nil
}

func (s *memoryKeyManager) Revoke(_ context.Context, request domainauth.RevokeKeyRequest) (domainauth.RevokeKeyResponse, error) {
	s.revoked = request
	return domainauth.RevokeKeyResponse{Revoked: true, TokenID: request.TokenID}, nil
}

func TestIntrospectReturnsInactiveForMissingOrNonOpaqueKeys(t *testing.T) {
	service := NewService(memoryKeyStore{})

	for _, token := range []string{"", "mv1.signed.jwt", "user_1", "sk-missing"} {
		response, err := service.Introspect(context.Background(), domainauth.IntrospectRequest{Token: token})
		if err != nil {
			t.Fatalf("Introspect returned error: %v", err)
		}
		if response.Active {
			t.Fatalf("expected %q to be inactive", token)
		}
	}
}

func TestIntrospectReturnsAuthContextForConfiguredOpaqueKey(t *testing.T) {
	service := NewService(memoryKeyStore{
		"sk-test": {
			TokenID: "token_test",
			Principal: domainauth.Principal{
				ID:          "user_1",
				Type:        "user",
				DisplayName: "Test User",
			},
			Claims: map[string]string{"role": "admin"},
		},
	})

	response, err := service.Introspect(context.Background(), domainauth.IntrospectRequest{Token: "sk-test"})
	if err != nil {
		t.Fatalf("Introspect returned error: %v", err)
	}
	if !response.Active {
		t.Fatal("expected key to be active")
	}
	if response.TokenType != "opaque" {
		t.Fatalf("unexpected token type: %q", response.TokenType)
	}
	if response.Principal == nil || response.Principal.ID != "user_1" {
		t.Fatalf("unexpected principal: %#v", response.Principal)
	}
	if response.AuthContext == nil || response.AuthContext.TokenID != "token_test" {
		t.Fatalf("unexpected auth context: %#v", response.AuthContext)
	}
	if response.Claims["role"] != "admin" {
		t.Fatalf("unexpected claims: %#v", response.Claims)
	}
}

func TestIssueAndRevokeDelegateToKeyManager(t *testing.T) {
	manager := &memoryKeyManager{memoryKeyStore: memoryKeyStore{}}
	service := NewService(manager)

	issued, err := service.IssueKey(context.Background(), domainauth.IssueKeyRequest{
		PrincipalID: "agent_1",
		Type:        "agent",
		Claims:      map[string]string{"scope": "project:read"},
	})
	if err != nil {
		t.Fatalf("IssueKey returned error: %v", err)
	}
	if issued.Token != "sk-issued" || manager.issued.PrincipalID != "agent_1" {
		t.Fatalf("unexpected issue result=%#v request=%#v", issued, manager.issued)
	}

	revoked, err := service.RevokeKey(context.Background(), domainauth.RevokeKeyRequest{TokenID: "token_issued"})
	if err != nil {
		t.Fatalf("RevokeKey returned error: %v", err)
	}
	if !revoked.Revoked || manager.revoked.TokenID != "token_issued" {
		t.Fatalf("unexpected revoke result=%#v request=%#v", revoked, manager.revoked)
	}
}

func TestIssueAndRevokeRequireKeyManager(t *testing.T) {
	service := NewService(memoryKeyStore{})
	if _, err := service.IssueKey(context.Background(), domainauth.IssueKeyRequest{PrincipalID: "agent_1"}); !errors.Is(err, ErrKeyManagementUnavailable) {
		t.Fatalf("IssueKey error = %v, want ErrKeyManagementUnavailable", err)
	}
	if _, err := service.RevokeKey(context.Background(), domainauth.RevokeKeyRequest{TokenID: "token_1"}); !errors.Is(err, ErrKeyManagementUnavailable) {
		t.Fatalf("RevokeKey error = %v, want ErrKeyManagementUnavailable", err)
	}
}
