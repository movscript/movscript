package auth

import (
	"errors"
	"testing"
	"time"
)

const testSecret = "0123456789abcdef0123456789abcdef"

func TestManagerRejectsForgedUserBearerTokens(t *testing.T) {
	m, err := NewManager(testSecret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	for _, raw := range []string{"user_1", "1"} {
		if _, err := m.Verify(raw); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("Verify(%q) err = %v, want ErrInvalidToken", raw, err)
		}
	}
}

func TestManagerIssuesAndVerifiesSignedToken(t *testing.T) {
	m, err := NewManager(testSecret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	m.now = func() time.Time { return now }

	token, expiresAt, err := m.Issue(Subject{
		UserID:     7,
		Username:   "alice",
		SystemRole: "super_admin",
	})
	if err != nil {
		t.Fatal(err)
	}
	if token == "" || !LooksSigned(token) {
		t.Fatalf("token = %q, want signed mv1 token", token)
	}
	if !expiresAt.After(now) {
		t.Fatalf("expiresAt = %s, want future", expiresAt)
	}

	claims, err := m.Verify(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != 7 || claims.Username != "alice" || claims.SystemRole != "super_admin" {
		t.Fatalf("claims = %#v", claims)
	}
}

func TestManagerRejectsExpiredToken(t *testing.T) {
	m, err := NewManager(testSecret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	m.now = func() time.Time { return now }
	token, _, err := m.Issue(Subject{UserID: 1})
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Hour)
	if _, err := m.Verify(token); !errors.Is(err, ErrExpiredToken) {
		t.Fatalf("Verify expired token err = %v, want ErrExpiredToken", err)
	}
}
