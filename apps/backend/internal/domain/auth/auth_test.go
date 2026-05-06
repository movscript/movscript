package auth

import "testing"

func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail(" USER@Example.COM "); got != "user@example.com" {
		t.Fatalf("email = %q", got)
	}
	if got := NormalizeEmail("invalid"); got != "" {
		t.Fatalf("invalid email = %q, want empty", got)
	}
}

func TestNewRegisteredUserMakesFirstUserSuperAdmin(t *testing.T) {
	verifiedAt := int64(10)
	user := NewRegisteredUser(" alice ", "hash", "a@example.com", 0, &verifiedAt)
	if user.Username != "alice" || user.SystemRole != "super_admin" || user.Status != "active" || user.PrimaryEmail == nil {
		t.Fatalf("unexpected user: %+v", user)
	}
}

func TestProfileUpdatesTrimValues(t *testing.T) {
	name := " Alice "
	updates := ProfileUpdates(ProfileInput{DisplayName: &name})
	if updates["display_name"] != "Alice" {
		t.Fatalf("updates = %#v", updates)
	}
}
