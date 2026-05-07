package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"strconv"
	"strings"
	"time"
)

const tokenVersion = "mv1"

var (
	ErrInvalidToken = errors.New("invalid auth token")
	ErrExpiredToken = errors.New("expired auth token")
)

type Claims struct {
	UserID     uint   `json:"uid"`
	Username   string `json:"username"`
	SystemRole string `json:"system_role"`
	ExpiresAt  int64  `json:"exp"`
	IssuedAt   int64  `json:"iat"`
}

type Manager struct {
	secret []byte
	ttl    time.Duration
}

func NewManager(secret string, ttl time.Duration) (*Manager, error) {
	secret = strings.TrimSpace(secret)
	if len(secret) < 32 {
		return nil, fmt.Errorf("auth token secret must be at least 32 bytes")
	}
	if ttl <= 0 {
		return nil, fmt.Errorf("auth token ttl must be positive")
	}
	return &Manager{secret: []byte(secret), ttl: ttl}, nil
}

func (m *Manager) Issue(user persistencemodel.User) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(m.ttl)
	claims := Claims{
		UserID:     user.ID,
		Username:   user.Username,
		SystemRole: user.SystemRole,
		IssuedAt:   now.Unix(),
		ExpiresAt:  expiresAt.Unix(),
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", time.Time{}, err
	}
	payloadPart := base64.RawURLEncoding.EncodeToString(payload)
	signingInput := tokenVersion + "." + payloadPart
	signature := m.sign(signingInput)
	return signingInput + "." + signature, expiresAt, nil
}

func (m *Manager) Verify(raw string) (Claims, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "user_") || isUnsignedInteger(raw) {
		return Claims{}, ErrInvalidToken
	}

	parts := strings.Split(raw, ".")
	if len(parts) != 3 || parts[0] != tokenVersion {
		return Claims{}, ErrInvalidToken
	}

	signingInput := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(m.sign(signingInput))) {
		return Claims{}, ErrInvalidToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return Claims{}, ErrInvalidToken
	}
	if claims.UserID == 0 || claims.ExpiresAt == 0 {
		return Claims{}, ErrInvalidToken
	}
	if time.Now().UTC().Unix() >= claims.ExpiresAt {
		return Claims{}, ErrExpiredToken
	}
	return claims, nil
}

func LooksSigned(raw string) bool {
	return strings.HasPrefix(strings.TrimSpace(raw), tokenVersion+".")
}

func BearerToken(header string) (string, bool) {
	header = strings.TrimSpace(header)
	if len(header) < len("Bearer ")+1 || !strings.EqualFold(header[:len("Bearer ")], "Bearer ") {
		return "", false
	}
	token := strings.TrimSpace(header[len("Bearer "):])
	return token, token != ""
}

func (m *Manager) sign(input string) string {
	mac := hmac.New(sha256.New, m.secret)
	_, _ = mac.Write([]byte(input))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func isUnsignedInteger(s string) bool {
	if s == "" {
		return false
	}
	_, err := strconv.ParseUint(s, 10, 64)
	return err == nil
}
