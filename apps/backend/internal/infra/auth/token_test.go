package auth

import (
	"errors"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
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

	token, expiresAt, err := m.Issue(model.User{
		Model:      gorm.Model{ID: 7},
		Username:   "alice",
		SystemRole: "super_admin",
	})
	if err != nil {
		t.Fatal(err)
	}
	if token == "" || !LooksSigned(token) {
		t.Fatalf("token = %q, want signed mv1 token", token)
	}
	if !expiresAt.After(time.Now()) {
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
	m, err := NewManager(testSecret, time.Nanosecond)
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := m.Issue(model.User{Model: gorm.Model{ID: 1}})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(2 * time.Millisecond)
	if _, err := m.Verify(token); !errors.Is(err, ErrExpiredToken) {
		t.Fatalf("Verify expired token err = %v, want ErrExpiredToken", err)
	}
}
