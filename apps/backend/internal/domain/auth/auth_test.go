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
	modelUser := user.ToModel()
	modelUser.ID = 20
	roundTrip := RegisteredUserFromModel(modelUser)
	if roundTrip.ID != 20 || roundTrip.Username != "alice" || roundTrip.SystemRole != SystemRoleSuperAdmin {
		t.Fatalf("unexpected user round-trip: %+v", roundTrip)
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
	modelChallenge := challenge.ToModel()
	modelChallenge.ID = 21
	roundTrip := AuthChallengeFromModel(modelChallenge)
	if roundTrip.ID != 21 || roundTrip.Target != "user@example.com" || roundTrip.CodeHash != "hash" {
		t.Fatalf("unexpected challenge round-trip: %+v", roundTrip)
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
	modelSession := session.ToModel()
	modelSession.ID = 22
	roundTrip := AuthSessionFromModel(modelSession)
	if roundTrip.ID != 22 || roundTrip.UserID != 1 || roundTrip.TokenHash != "hash" {
		t.Fatalf("unexpected session round-trip: %+v", roundTrip)
	}
}

func TestProfileUpdateSpecTrimValues(t *testing.T) {
	name := " Alice "
	spec := ProfileUpdateSpec(ProfileInput{DisplayName: &name})
	if spec.DisplayName == nil || *spec.DisplayName != "Alice" {
		t.Fatalf("spec = %#v", spec)
	}
}

func stringsOf(value string, count int) string {
	out := ""
	for i := 0; i < count; i++ {
		out += value
	}
	return out
}
