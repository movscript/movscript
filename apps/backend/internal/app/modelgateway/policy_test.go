package modelgateway

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

func TestKeyAllowsProjectRequiresMatchingRequestProject(t *testing.T) {
	projectID := uint(7)
	otherID := uint(8)
	key := &model.GatewayAPIKey{ProjectID: &projectID}

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

func TestBillingContextIncludesAPIKeyAndProject(t *testing.T) {
	orgID := uint(5)
	projectID := uint(11)
	key := &model.GatewayAPIKey{Model: gorm.Model{ID: 3}, OrgID: &orgID}

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

func TestMonthlyBudgetErrorIsDistinct(t *testing.T) {
	err := ErrMonthlyBudgetExceeded
	if err == nil || err.Error() == "" {
		t.Fatal("expected monthly budget sentinel error")
	}
}

func TestResolveTextModelSupportsDefaultAndAliases(t *testing.T) {
	models := []ai.PublicModel{
		{ID: 4, ModelDefID: "gpt-like", ModelIDOverride: "public-name"},
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
}
