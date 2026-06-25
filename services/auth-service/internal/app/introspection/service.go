package introspection

import (
	"context"
	"strings"

	domainauth "github.com/movscript/auth-service/internal/domain/auth"
)

type KeyRecord struct {
	TokenID   string
	Principal domainauth.Principal
	Claims    map[string]string
}

type KeyStore interface {
	Lookup(ctx context.Context, token string) (KeyRecord, bool, error)
}

type KeyManager interface {
	KeyStore
	Issue(ctx context.Context, request domainauth.IssueKeyRequest) (domainauth.IssueKeyResponse, error)
	Revoke(ctx context.Context, request domainauth.RevokeKeyRequest) (domainauth.RevokeKeyResponse, error)
}

type Service struct {
	keys KeyStore
}

func NewService(keys KeyStore) *Service {
	return &Service{keys: keys}
}

func (s *Service) Introspect(ctx context.Context, request domainauth.IntrospectRequest) (domainauth.IntrospectResponse, error) {
	token := strings.TrimSpace(request.Token)
	if token == "" || !strings.HasPrefix(token, "sk-") || s.keys == nil {
		return domainauth.IntrospectResponse{Active: false}, nil
	}

	record, ok, err := s.keys.Lookup(ctx, token)
	if err != nil {
		return domainauth.IntrospectResponse{}, err
	}
	if !ok {
		return domainauth.IntrospectResponse{Active: false}, nil
	}

	claims := cloneClaims(record.Claims)
	context := domainauth.AuthContext{
		Principal: record.Principal,
		Claims:    claims,
		TokenID:   record.TokenID,
	}
	return domainauth.IntrospectResponse{
		Active:      true,
		TokenType:   "opaque",
		Principal:   &context.Principal,
		Claims:      claims,
		AuthContext: &context,
	}, nil
}

func (s *Service) IssueKey(ctx context.Context, request domainauth.IssueKeyRequest) (domainauth.IssueKeyResponse, error) {
	manager, ok := s.keys.(KeyManager)
	if !ok || manager == nil {
		return domainauth.IssueKeyResponse{}, ErrKeyManagementUnavailable
	}
	return manager.Issue(ctx, request)
}

func (s *Service) RevokeKey(ctx context.Context, request domainauth.RevokeKeyRequest) (domainauth.RevokeKeyResponse, error) {
	manager, ok := s.keys.(KeyManager)
	if !ok || manager == nil {
		return domainauth.RevokeKeyResponse{}, ErrKeyManagementUnavailable
	}
	return manager.Revoke(ctx, request)
}

func cloneClaims(claims map[string]string) map[string]string {
	if len(claims) == 0 {
		return nil
	}
	next := make(map[string]string, len(claims))
	for key, value := range claims {
		next[key] = value
	}
	return next
}
