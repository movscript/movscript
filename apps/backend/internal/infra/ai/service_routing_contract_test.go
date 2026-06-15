package ai

import (
	"context"
	"strings"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAIServiceRoutingPolicyContractResolvesProviderBackedRoute(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-policy-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createTextProviderVariant(t, db, 1, "Primary provider")
	createTextProviderVariant(t, db, 2, "Secondary provider")
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayModelRoute(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.ModelID != "gpt-5.2" || route.ModelConfigID == 0 || route.ProviderModelID != "gpt-5.2" || route.Capability != CapabilityText {
		t.Fatalf("route = %#v, want provider-backed text route", route)
	}
	if route.SelectionReason != "model_id_capacity_round_robin" {
		t.Fatalf("selection reason = %q, want model_id_capacity_round_robin", route.SelectionReason)
	}
}

func TestAIServiceRoutingPolicyContractResolvesGenerationRoute(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-generation-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariant(t, db, 1, "Image provider", "gpt-image-1", 10, CapabilityImage)
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayGenerationModelRoute(context.Background(), "gpt-image-1", CapabilityImage)
	if err != nil {
		t.Fatalf("ResolveGatewayGenerationModelRoute() error = %v", err)
	}
	if route.ModelID != "gpt-image-1" || route.ModelConfigID != 1 || route.Capability != CapabilityImage {
		t.Fatalf("route = %#v, want image route through model config 1", route)
	}
}

func TestAIServiceRoutingPolicyContractExposesFallbackRoutePlan(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-fallback-plan-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariantWithAdapter(t, db, 30, "Primary provider", AdapterOpenAICompat, "gpt-5.2", 20, CapabilityText)
	createProviderVariantWithAdapter(t, db, 31, "Fallback provider", AdapterOpenAICompat, "gpt-5.2", 10, CapabilityText)
	service := NewAIService(db, NewRegistry(db, nil))

	plan, err := service.ResolveGatewayModelRoutePlan(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityText,
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoutePlan() error = %v", err)
	}
	if !plan.FallbackEnabled || len(plan.Routes) != 2 {
		t.Fatalf("plan = %#v, want two fallback routes", plan)
	}
	if plan.ModelID != "gpt-5.2" || plan.Capability != CapabilityText || plan.SelectionReason != "model_id_capacity_round_robin" {
		t.Fatalf("plan metadata = %#v, want text route plan", plan)
	}
	if plan.Routes[0].ModelConfigID != 30 || plan.Routes[0].SelectionReason != "model_id_capacity_round_robin" {
		t.Fatalf("first route = %#v, want primary route", plan.Routes[0])
	}
	if plan.Routes[1].ModelConfigID != 31 || plan.Routes[1].SelectionReason != "fallback_candidate" {
		t.Fatalf("fallback route = %#v, want fallback route", plan.Routes[1])
	}
}

func TestAIServiceRoutingPolicyContractPrefersRequestedAdapter(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-preferred-adapter-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariantWithAdapter(t, db, 10, "OpenAI-compatible provider", AdapterOpenAICompat, "gpt-5.2", 20, CapabilityText)
	createProviderVariantWithAdapter(t, db, 11, "Local provider", AdapterLocal, "gpt-5.2", 1, CapabilityText)
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayModelRoute(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:               "gpt-5.2",
		Capability:            CapabilityText,
		PreferredAdapterTypes: []string{AdapterLocal},
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.ModelConfigID != 11 || route.SelectionReason != "model_id_preferred_adapter" {
		t.Fatalf("route = %#v, want local provider preference", route)
	}
}

func TestAIServiceRoutingPolicyContractFiltersRoutesByEstimatedBudget(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-budget-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariantWithAdapterAndCost(t, db, 40, "Expensive provider", AdapterOpenAICompat, "gpt-5.2", 20, 10, 0, CapabilityText)
	createProviderVariantWithAdapterAndCost(t, db, 41, "Budget provider", AdapterOpenAICompat, "gpt-5.2", 1, 1, 0, CapabilityText)
	service := NewAIService(db, NewRegistry(db, nil))

	plan, err := service.ResolveGatewayModelRoutePlan(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "gpt-5.2",
		Capability: CapabilityText,
		EstimatedUsage: providercontract.AIUsageEstimate{
			OperationType: CapabilityText,
			InputTokens:   1_000_000,
		},
		MaxEstimatedCost: 2,
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoutePlan() error = %v", err)
	}
	if plan.FallbackEnabled || len(plan.Routes) != 1 {
		t.Fatalf("plan = %#v, want one budget-matched route", plan)
	}
	if plan.Routes[0].ModelConfigID != 41 || plan.Routes[0].SelectionReason != "model_id_budget_aware" || plan.Routes[0].EstimatedCost != 1 {
		t.Fatalf("route = %#v, want budget provider route", plan.Routes[0])
	}
}

func TestAIServiceRoutingPolicyContractPrefersRequestedAdapterForLegacyConfigRoute(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-routing-legacy-preferred-adapter-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariantWithAdapter(t, db, 20, "OpenAI-compatible provider", AdapterOpenAICompat, "gpt-5.2", 20, CapabilityText)
	createProviderVariantWithAdapter(t, db, 21, "Local provider", AdapterLocal, "gpt-5.2", 1, CapabilityText)
	service := NewAIService(db, NewRegistry(db, nil))

	route, err := service.ResolveGatewayModelRoute(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelConfigID:         20,
		Capability:            CapabilityText,
		PreferredAdapterTypes: []string{AdapterLocal},
	})
	if err != nil {
		t.Fatalf("ResolveGatewayModelRoute() error = %v", err)
	}
	if route.ModelConfigID != 21 || route.SelectionReason != "legacy_model_config_id_preferred_adapter" {
		t.Fatalf("route = %#v, want local provider preference from legacy config route", route)
	}
}

func createProviderVariantWithAdapter(t *testing.T, db *gorm.DB, id uint, providerName string, adapterType string, modelDefID string, priority int, capabilities ...string) {
	createProviderVariantWithAdapterAndCost(t, db, id, providerName, adapterType, modelDefID, priority, 0, 0, capabilities...)
}

func createProviderVariantWithAdapterAndCost(t *testing.T, db *gorm.DB, id uint, providerName string, adapterType string, modelDefID string, priority int, creditsInputPer1M float64, creditsOutputPer1M float64, capabilities ...string) {
	t.Helper()
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: id},
		AdapterType: adapterType,
		DisplayName: providerName,
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{
		Model:              gorm.Model{ID: id},
		CredentialID:       cred.ID,
		ModelDefID:         modelDefID,
		IsEnabled:          true,
		Priority:           priority,
		CreditsInputPer1M:  creditsInputPer1M,
		CreditsOutputPer1M: creditsOutputPer1M,
		CustomDisplayName:  modelDefID,
		CustomCapabilities: strings.Join(capabilities, ","),
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
}
