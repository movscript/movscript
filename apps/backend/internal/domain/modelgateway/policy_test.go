package modelgateway

import (
	"testing"

	"github.com/movscript/movscript/internal/infra/ai"
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

func TestBillingContextIncludesAPIKeyAndProject(t *testing.T) {
	orgID := uint(5)
	projectID := uint(11)
	key := &APIKey{ID: 3, OrgID: &orgID}

	ctx := BillingContext(key, &projectID)

	if ctx.OrgID == nil || *ctx.OrgID != 5 {
		t.Fatalf("expected org id 5, got %#v", ctx.OrgID)
	}
	if ctx.GatewayAPIKeyID == nil || *ctx.GatewayAPIKeyID != 3 {
		t.Fatalf("expected gateway api key id 3, got %#v", ctx.GatewayAPIKeyID)
	}
	if ctx.ProjectID == nil || *ctx.ProjectID != 11 {
		t.Fatalf("expected project id 11, got %#v", ctx.ProjectID)
	}
}

func TestResolveTextModelSupportsDefaultAndAliases(t *testing.T) {
	models := []ai.PublicModel{
		{ID: 4, ModelDefID: "gpt-like", ModelIDOverride: "public-name"},
		{ID: 5, ModelDefID: "provider-hidden", LogicalModelID: "logical-name"},
	}

	id, name, err := ResolveTextModel(models, "", 4, nil)
	if err != nil || id != 4 || name != DefaultChatModel {
		t.Fatalf("expected default model, got id=%d name=%q err=%v", id, name, err)
	}

	id, name, err = ResolveTextModel(models, "public-name", 0, nil)
	if err != nil || id != 4 || name != "public-name" {
		t.Fatalf("expected override model, got id=%d name=%q err=%v", id, name, err)
	}

	id, name, err = ResolveTextModel(models, "model_config:4", 0, nil)
	if err != nil || id != 4 || name != "model_config:4" {
		t.Fatalf("expected model_config model, got id=%d name=%q err=%v", id, name, err)
	}

	id, name, err = ResolveTextModel(models, "logical-name", 0, nil)
	if err != nil || id != 5 || name != "logical-name" {
		t.Fatalf("expected logical model, got id=%d name=%q err=%v", id, name, err)
	}
}
