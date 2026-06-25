package staticidentity

import (
	"context"
	"testing"
)

func TestStoreLoadsUsersAndOrgMemberships(t *testing.T) {
	store, err := FromJSON(`{
		"users":[{"id":7,"username":"alice","system_role":"user","status":"active"}],
		"org_memberships":[{"user_id":7,"org_id":3,"org_name":"Studio","org_slug":"studio","role":"owner","plan":"team","status":"active"}]
	}`)
	if err != nil {
		t.Fatalf("FromJSON returned error: %v", err)
	}
	profile, ok, err := store.UserProfile(context.Background(), 7)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	if !ok || profile.Username != "alice" {
		t.Fatalf("profile = %#v ok=%v", profile, ok)
	}
	memberships, ok, err := store.OrgMemberships(context.Background(), 7)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}
	if !ok || len(memberships) != 1 || memberships[0].OrgID != 3 {
		t.Fatalf("memberships = %#v ok=%v", memberships, ok)
	}
}

func TestStoreReturnsMissingForUnknownUser(t *testing.T) {
	store := New(Config{})
	if _, ok, err := store.UserProfile(context.Background(), 1); err != nil || ok {
		t.Fatalf("UserProfile ok=%v err=%v, want missing nil", ok, err)
	}
	if _, ok, err := store.OrgMemberships(context.Background(), 1); err != nil || ok {
		t.Fatalf("OrgMemberships ok=%v err=%v, want missing nil", ok, err)
	}
}
