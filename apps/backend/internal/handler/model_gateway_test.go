package handler

import (
	"testing"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func TestGatewayKeyAllowsProjectRequiresMatchingRequestProject(t *testing.T) {
	projectID := uint(7)
	otherID := uint(8)
	key := &model.GatewayAPIKey{ProjectID: &projectID}

	if gatewayKeyAllowsProject(key, nil) {
		t.Fatal("expected project-scoped key to reject requests without project_id")
	}
	if gatewayKeyAllowsProject(key, &otherID) {
		t.Fatal("expected project-scoped key to reject another project")
	}
	if !gatewayKeyAllowsProject(key, &projectID) {
		t.Fatal("expected project-scoped key to allow matching project")
	}
}

func TestGatewayBillingContextIncludesAPIKeyAndProject(t *testing.T) {
	projectID := uint(11)
	key := &model.GatewayAPIKey{Model: gorm.Model{ID: 3}}

	ctx := gatewayBillingContext(key, &projectID)

	if ctx.GatewayAPIKeyID == nil || *ctx.GatewayAPIKeyID != 3 {
		t.Fatalf("expected gateway api key id 3, got %#v", ctx.GatewayAPIKeyID)
	}
	if ctx.ProjectID == nil || *ctx.ProjectID != 11 {
		t.Fatalf("expected project id 11, got %#v", ctx.ProjectID)
	}
}

func TestGatewayMonthlyBudgetErrorIsDistinct(t *testing.T) {
	err := errGatewayMonthlyBudgetExceeded
	if err == nil || err.Error() == "" {
		t.Fatal("expected monthly budget sentinel error")
	}
}
