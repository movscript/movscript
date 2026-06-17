package catalog

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/infra/cache"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestServiceListByCapabilityUsesGatewayModelCatalogContract(t *testing.T) {
	fake := &fakeModelCatalog{
		models: []providercontract.AIModelDescriptor{{
			ModelID:           "gpt-5.2",
			ModelConfigID:     9,
			CatalogEntryID:    42,
			CredentialID:      7,
			ModelDefID:        "gpt-5.2",
			ModelIDOverride:   "provider-gpt-5.2",
			DisplayName:       "GPT 5.2",
			ProviderName:      "Primary provider",
			AdapterType:       "openai_compat",
			Capabilities:      []string{"text", "reasoning"},
			PricingMode:       "per_token",
			AcceptsImageInput: true,
			ProviderVariants:  2,
			Priority:          10,
			CapacityWeight:    3,
			MaxConcurrency:    4,
			SupportedParams:   []map[string]any{{"key": "temperature", "type": "number"}},
			InputRequirements: providercontract.AIModelInputRequirements{
				Image: providercontract.AIModelInputRequirement{Min: 0, Max: 1},
			},
			ParamsSchema: map[string]any{"type": "object"},
		}},
	}
	service := NewService(fake)

	models, err := service.ListByCapability(context.Background(), "text,reasoning", true)
	if err != nil {
		t.Fatalf("ListByCapability() error = %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("models count = %d, want 1", len(models))
	}
	if len(fake.filters) != 1 {
		t.Fatalf("contract calls = %d, want 1", len(fake.filters))
	}
	filter := fake.filters[0]
	if !filter.ProviderVariants || len(filter.Capabilities) != 2 || filter.Capabilities[0] != "text" || filter.Capabilities[1] != "reasoning" {
		t.Fatalf("filter = %#v, want provider variants text+reasoning", filter)
	}
	model := models[0]
	if model.ID != 42 || model.CatalogEntryID != 42 || model.CredentialID != 7 || model.ModelDefID != "gpt-5.2" || model.ModelIDOverride != "" || model.ProviderName != "Primary provider" {
		t.Fatalf("model = %#v, want public catalog model fields without provider override", model)
	}
	if len(model.SupportedParams) != 1 || model.InputRequirements.Image.Max != 1 || model.ParamsSchema["type"] != "object" {
		t.Fatalf("model contract fields = %#v, want params/input/schema preserved", model)
	}
}

func TestServiceListByCapabilityForRoutePassesRouteGroupAndSkipsCache(t *testing.T) {
	fake := &fakeModelCatalog{
		models: []providercontract.AIModelDescriptor{{ModelID: "gpt-5.2", DisplayName: "GPT 5.2"}},
	}
	cache := cache.NewMemory()
	service := NewService(fake, cache)

	for range 2 {
		models, err := service.ListByCapabilityForRoute(context.Background(), "text", "priority", false)
		if err != nil {
			t.Fatalf("ListByCapabilityForRoute() error = %v", err)
		}
		if len(models) != 1 {
			t.Fatalf("models count = %d, want 1", len(models))
		}
	}
	if len(fake.filters) != 2 {
		t.Fatalf("contract calls = %d, want 2", len(fake.filters))
	}
	for _, filter := range fake.filters {
		if filter.RouteGroup != "priority" {
			t.Fatalf("filter route group = %q, want priority", filter.RouteGroup)
		}
	}
}

type fakeModelCatalog struct {
	models  []providercontract.AIModelDescriptor
	filters []providercontract.AIModelListFilter
}

func (f *fakeModelCatalog) ListModels(_ context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	f.filters = append(f.filters, filter)
	return f.models, nil
}

func (f *fakeModelCatalog) ResolveModel(context.Context, providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	return providercontract.AIModelBinding{}, nil
}
