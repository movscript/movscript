package authidentity

import (
	"testing"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
)

func TestLocalOwnerManagerDefaultsToUserRole(t *testing.T) {
	manager := NewLocalOwnerManager(LocalOwnerOptions{})
	profile, err := manager.UserProfile(t.Context(), LocalOwnerUserID)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	if profile.SystemRole != domainidentity.SystemRoleUser {
		t.Fatalf("system role = %q, want %q", profile.SystemRole, domainidentity.SystemRoleUser)
	}
}

func TestLocalOwnerManagerCanUseSuperAdminRole(t *testing.T) {
	manager := NewLocalOwnerManager(LocalOwnerOptions{
		SystemRole: domainidentity.SystemRoleSuperAdmin,
	})
	profile, err := manager.UserProfile(t.Context(), LocalOwnerUserID)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	if profile.SystemRole != domainidentity.SystemRoleSuperAdmin {
		t.Fatalf("system role = %q, want %q", profile.SystemRole, domainidentity.SystemRoleSuperAdmin)
	}
}
