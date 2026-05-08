package modelgateway

import (
	"testing"
)

func TestKeyAllowsProjectRequiresMatchingRequestProject(t *testing.T) {
	projectID := uint(7)
	otherID := uint(8)
	key := &APIKey{ProjectID: &projectID}

	if KeyAllowsProject(key, nil) {
		t.Fatal("expected project-scoped key to reject requests without project_id")
	}
	if KeyAllowsProject(key, &otherID) {
		t.Fatal("expected project-scoped key to reject another project")
	}
	if !KeyAllowsProject(key, &projectID) {
		t.Fatal("expected project-scoped key to allow matching project")
	}
}

func TestNewAPIKeyAppliesDefaultScope(t *testing.T) {
	key := NewAPIKey(NewAPIKeySpec{
		Name:        " Test Key ",
		KeyPrefix:   "mgw_prefix",
		KeyHash:     "hash",
		OwnerUserID: 1,
	})
	if key.Name != "Test Key" || key.KeyPrefix != "mgw_prefix" || key.KeyHash != "hash" || !key.IsEnabled {
		t.Fatalf("unexpected key: %+v", key)
	}
	modelKey := key.ToModel()
	domainModelKey := APIKeyFromModel(modelKey)
	if !KeyAllowsScope(&domainModelKey, DefaultAPIScopeChat) {
		t.Fatalf("expected default chat scope, got %q", key.AllowedScopes)
	}
	modelKey.ID = 12
	roundTrip := APIKeyFromModel(modelKey)
	if roundTrip.ID != 12 || roundTrip.Name != "Test Key" || roundTrip.AllowedScopes == "" {
		t.Fatalf("unexpected key round-trip: %+v", roundTrip)
	}
}

func TestAPIKeyApplyUpdate(t *testing.T) {
	key := NewAPIKey(NewAPIKeySpec{
		Name:            "Original",
		KeyPrefix:       "mgw_prefix",
		KeyHash:         "hash",
		OwnerUserID:     1,
		AllowedModelIDs: []uint{1},
		AllowedScopes:   []string{"model:chat"},
	})
	name := " Updated "
	enabled := false

	key.ApplyUpdate(APIKeyUpdateSpec{
		Name:            &name,
		AllowedModelIDs: []uint{2, 3},
		AllowedScopes:   []string{"*"},
		IsEnabled:       &enabled,
	})

	if key.Name != "Updated" {
		t.Fatalf("Name = %q, want Updated", key.Name)
	}
	if key.AllowedModelIDs != "[2,3]" {
		t.Fatalf("AllowedModelIDs = %q, want [2,3]", key.AllowedModelIDs)
	}
	if key.AllowedScopes != `["*"]` {
		t.Fatalf("AllowedScopes = %q, want [\"*\"]", key.AllowedScopes)
	}
	if key.IsEnabled {
		t.Fatal("IsEnabled = true, want false")
	}
}
