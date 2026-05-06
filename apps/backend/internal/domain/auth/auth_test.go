package auth

import (
	"testing"
	"time"
)

func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail(" USER@Example.COM "); got != "user@example.com" {
		t.Fatalf("email = %q", got)
	}
	if got := NormalizeEmail("invalid"); got != "" {
		t.Fatalf("invalid email = %q, want empty", got)
	}
}

func TestNewRegisteredUserCanBootstrapSystemAdmin(t *testing.T) {
	verifiedAt := int64(10)
	user := NewRegisteredUser(" alice ", "hash", "a@example.com", true, &verifiedAt)
	if user.Username != "alice" || user.SystemRole != SystemRoleSuperAdmin || user.Status != UserStatusActive || user.PrimaryEmail == nil {
		t.Fatalf("unexpected user: %+v", user)
	}
}

func TestNewRegisteredUserDefaultsToUser(t *testing.T) {
	user := NewRegisteredUser(" alice ", "hash", "", false, nil)
	if user.SystemRole != SystemRoleUser {
		t.Fatalf("system role = %q, want %s", user.SystemRole, SystemRoleUser)
	}
}

func TestNewAuthChallengeAppliesDefaults(t *testing.T) {
	now := time.Unix(100, 0).UTC()
	challenge := NewAuthChallenge("", " USER@Example.COM ", "hash", now)
	if challenge.Channel != ChallengeChannelEmail || challenge.Target != "user@example.com" || challenge.CodeHash != "hash" {
		t.Fatalf("unexpected challenge: %+v", challenge)
	}
	if challenge.ExpiresAt.Sub(now) != time.Duration(ChallengeExpiresInSec)*time.Second {
		t.Fatalf("expires at = %s, want %ds after now", challenge.ExpiresAt, ChallengeExpiresInSec)
	}
}

func TestChallengeValidForVerification(t *testing.T) {
	now := time.Unix(100, 0).UTC()
	challenge := NewAuthChallenge(ChallengeChannelEmail, "u@example.com", "hash", now)
	if !ChallengeValidForVerification(challenge, now) {
		t.Fatal("expected challenge to be valid")
	}
	challenge.Attempts = ChallengeMaxAttempts
	if ChallengeValidForVerification(challenge, now) {
		t.Fatal("expected challenge with max attempts to be invalid")
	}
}

func TestNewAuthSessionTruncatesClientMetadata(t *testing.T) {
	expiresAt := time.Unix(100, 0).UTC()
	session := NewAuthSession(1, "hash", expiresAt, stringsOf("a", UserAgentMaxLength+1), stringsOf("b", IPAddressMaxLength+1))
	if session.UserID != 1 || session.TokenHash != "hash" || !session.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("unexpected session: %+v", session)
	}
	if len(session.UserAgent) != UserAgentMaxLength || len(session.IPAddress) != IPAddressMaxLength {
		t.Fatalf("metadata lengths = %d/%d", len(session.UserAgent), len(session.IPAddress))
	}
}

func TestProfileUpdatesTrimValues(t *testing.T) {
	name := " Alice "
	updates := ProfileUpdates(ProfileInput{DisplayName: &name})
	if updates["display_name"] != "Alice" {
		t.Fatalf("updates = %#v", updates)
	}
}

func stringsOf(value string, count int) string {
	out := ""
	for i := 0; i < count; i++ {
		out += value
	}
	return out
}
