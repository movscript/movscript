package statickeys

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/movscript/auth-service/internal/app/introspection"
	domainauth "github.com/movscript/auth-service/internal/domain/auth"
)

type ConfigRecord struct {
	Key         string            `json:"key"`
	TokenID     string            `json:"token_id,omitempty"`
	PrincipalID string            `json:"principal_id"`
	Type        string            `json:"type,omitempty"`
	DisplayName string            `json:"display_name,omitempty"`
	Claims      map[string]string `json:"claims,omitempty"`
}

type Store struct {
	mu            sync.RWMutex
	recordsByHash map[string]introspection.KeyRecord
	hashByTokenID map[string]string
}

func New(records []ConfigRecord) (*Store, error) {
	store := &Store{
		recordsByHash: map[string]introspection.KeyRecord{},
		hashByTokenID: map[string]string{},
	}
	for index, record := range records {
		if err := store.addRecord(record.Key, record.TokenID, record.PrincipalID, record.Type, record.DisplayName, record.Claims); err != nil {
			return nil, fmt.Errorf("static auth key %d: %w", index, err)
		}
	}
	return store, nil
}

func FromJSON(value string) (*Store, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return New(nil)
	}
	var records []ConfigRecord
	if err := json.Unmarshal([]byte(value), &records); err != nil {
		return nil, err
	}
	return New(records)
}

func (s *Store) Lookup(_ context.Context, token string) (introspection.KeyRecord, bool, error) {
	if s == nil {
		return introspection.KeyRecord{}, false, nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.recordsByHash[keyHash(token)]
	return record, ok, nil
}

func (s *Store) Issue(ctx context.Context, request domainauth.IssueKeyRequest) (domainauth.IssueKeyResponse, error) {
	if s == nil {
		return domainauth.IssueKeyResponse{}, introspection.ErrKeyManagementUnavailable
	}
	principalID := strings.TrimSpace(request.PrincipalID)
	if principalID == "" {
		return domainauth.IssueKeyResponse{}, fmt.Errorf("%w: principal_id is required", introspection.ErrInvalidKeyRequest)
	}
	prefix := strings.TrimSpace(request.Prefix)
	if prefix == "" {
		prefix = "sk-auth"
	}
	if !strings.HasPrefix(prefix, "sk-") {
		return domainauth.IssueKeyResponse{}, fmt.Errorf("%w: prefix must start with sk-", introspection.ErrInvalidKeyRequest)
	}
	token, err := newOpaqueKey(prefix)
	if err != nil {
		return domainauth.IssueKeyResponse{}, err
	}

	if err := s.addRecord(token, request.TokenID, principalID, request.Type, request.DisplayName, request.Claims); err != nil {
		return domainauth.IssueKeyResponse{}, err
	}

	record, _, err := s.Lookup(ctx, token)
	if err != nil {
		return domainauth.IssueKeyResponse{}, err
	}
	return domainauth.IssueKeyResponse{
		Token:     token,
		TokenID:   record.TokenID,
		TokenType: "opaque",
		Principal: record.Principal,
		Claims:    cloneClaims(record.Claims),
	}, nil
}

func (s *Store) Revoke(_ context.Context, request domainauth.RevokeKeyRequest) (domainauth.RevokeKeyResponse, error) {
	if s == nil {
		return domainauth.RevokeKeyResponse{}, introspection.ErrKeyManagementUnavailable
	}
	tokenHash := ""
	tokenID := strings.TrimSpace(request.TokenID)
	if token := strings.TrimSpace(request.Token); token != "" {
		tokenHash = keyHash(token)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if tokenHash == "" && tokenID != "" {
		tokenHash = s.hashByTokenID[tokenID]
	}
	if tokenHash == "" {
		return domainauth.RevokeKeyResponse{}, fmt.Errorf("%w: token or token_id is required", introspection.ErrInvalidKeyRequest)
	}
	record, ok := s.recordsByHash[tokenHash]
	if !ok {
		return domainauth.RevokeKeyResponse{Revoked: false, TokenID: tokenID}, nil
	}
	delete(s.recordsByHash, tokenHash)
	delete(s.hashByTokenID, record.TokenID)
	return domainauth.RevokeKeyResponse{Revoked: true, TokenID: record.TokenID}, nil
}

func (s *Store) addRecord(token string, tokenID string, principalID string, principalType string, displayName string, claims map[string]string) error {
	key := strings.TrimSpace(token)
	if !strings.HasPrefix(key, "sk-") {
		return fmt.Errorf("%w: key must use sk- prefix", introspection.ErrInvalidKeyRequest)
	}
	principalID = strings.TrimSpace(principalID)
	if principalID == "" {
		return fmt.Errorf("%w: principal_id is required", introspection.ErrInvalidKeyRequest)
	}
	principalType = strings.TrimSpace(principalType)
	if principalType == "" {
		principalType = "user"
	}
	tokenID = strings.TrimSpace(tokenID)
	if tokenID == "" {
		tokenID = keyHash(key)
	}
	hash := keyHash(key)

	s.mu.Lock()
	defer s.mu.Unlock()
	if existingHash, ok := s.hashByTokenID[tokenID]; ok && existingHash != hash {
		return fmt.Errorf("%w: token_id already exists", introspection.ErrInvalidKeyRequest)
	}
	s.recordsByHash[hash] = introspection.KeyRecord{
		TokenID: tokenID,
		Principal: domainauth.Principal{
			ID:          principalID,
			Type:        principalType,
			DisplayName: strings.TrimSpace(displayName),
		},
		Claims: cloneClaims(claims),
	}
	s.hashByTokenID[tokenID] = hash
	return nil
}

func keyHash(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])
}

func newOpaqueKey(prefix string) (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return strings.TrimRight(prefix, "_-.") + "_" + base64.RawURLEncoding.EncodeToString(raw[:]), nil
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
