package catalog

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/cache"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestServiceListByCapabilityUsesGatewayModelCatalogContract(t *testing.T) {
	fake := &fakeModelCatalog{
		models: []providercontract.AIModelDescriptor{{
			ModelID:            "gpt-5.2",
			CatalogEntryID:     42,
			ProviderID:         "local_provider:7",
			ModelDefID:         "gpt-5.2",
			ModelIDOverride:    "provider-gpt-5.2",
			DisplayName:        "GPT 5.2",
			ProviderName:       "Primary provider",
			AdapterType:        "openai_compat",
			Capabilities:       []string{"text", "reasoning"},
			SupportedAPIKinds:  []string{"openai_responses", "openai_chat_completions"},
			AcceptsImageInput:  true,
			InferredOperation:  "prompt_to_video",
			ResolverOperations: []string{"prompt_to_video"},
			ProviderVariants:   2,
			Priority:           10,
			CapacityWeight:     3,
			MaxConcurrency:     4,
			SupportedParamsByOperation: map[string][]map[string]any{
				"chat": {{"key": "temperature", "type": "number"}},
			},
			InputRequirements: providercontract.AIModelInputRequirements{
				Image: providercontract.AIModelInputRequirement{Min: 0, Max: 1},
			},
			ParamsSchemaByOperation: map[string]map[string]any{"chat": {"type": "object"}},
		}},
	}
	service := NewService(fake)

	models, err := service.ListByCapabilityWithOptions(context.Background(), "text,reasoning", ListOptions{
		ProviderVariants: true,
		APIKinds:         []string{"openai_responses"},
		TargetOutput:     "video",
		ResolveIntent:    true,
	})
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
	if !filter.ProviderVariants || !filter.ResolveIntent || filter.TargetOutput != "video" || len(filter.Capabilities) != 2 || filter.Capabilities[0] != "text" || filter.Capabilities[1] != "reasoning" || len(filter.APIKinds) != 1 || filter.APIKinds[0] != "openai_responses" {
		t.Fatalf("filter = %#v, want provider variants text+reasoning", filter)
	}
	model := models[0]
	if model.ID != 42 || model.CatalogEntryID != 42 || model.ModelID != "gpt-5.2" || model.LogicalModelID != "" {
		t.Fatalf("model = %#v, want public catalog model fields without provider override", model)
	}
	if len(model.SupportedParamsByOperation["chat"]) != 1 || model.InputRequirements.Image.Max != 1 || model.ParamsSchemaByOperation["chat"]["type"] != "object" {
		t.Fatalf("model contract fields = %#v, want params/input/schema preserved", model)
	}
	if model.InferredOperation != "prompt_to_video" || len(model.ResolverOperations) != 1 || model.ResolverOperations[0] != "prompt_to_video" {
		t.Fatalf("resolver fields = %#v/%#v, want inferred operation preserved", model.InferredOperation, model.ResolverOperations)
	}
	if len(model.SupportedAPIKinds) != 2 || model.SupportedAPIKinds[0] != "openai_responses" || model.SupportedAPIKinds[1] != "openai_chat_completions" {
		t.Fatalf("model supported api kinds = %#v, want descriptor values preserved", model.SupportedAPIKinds)
	}
	body, err := json.Marshal(model)
	if err != nil {
		t.Fatalf("marshal public model: %v", err)
	}
	payload := string(body)
	for _, forbidden := range []string{
		"provider_id",
		"adapter_type",
		"provider_model_id",
		"provider_name",
		"model_id_override",
		"route_binding_id",
		"route_bindings",
		"credential_id",
		"endpoint_base_url",
		"endpoint_path_prefix",
		"endpoint_mode",
		"operation_profile",
		"route_capabilities_json",
		"priority",
		"capacity_weight",
		"max_concurrency",
	} {
		if strings.Contains(payload, forbidden) {
			t.Fatalf("public model json = %s, want no %s", payload, forbidden)
		}
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

func TestServiceListByCapabilityReflectsCatalogChangesImmediately(t *testing.T) {
	fake := &fakeModelCatalog{}
	cache := cache.NewMemory()
	service := NewService(fake, cache)

	models, err := service.ListByCapability(context.Background(), "image_generation")
	if err != nil {
		t.Fatalf("ListByCapability() error = %v", err)
	}
	if len(models) != 0 {
		t.Fatalf("models count = %d, want 0 before catalog update", len(models))
	}

	fake.models = []providercontract.AIModelDescriptor{{
		ModelID:      "gpt-image-2",
		DisplayName:  "GPT Image 2",
		Capabilities: []string{"image_generation"},
	}}
	models, err = service.ListByCapability(context.Background(), "image_generation")
	if err != nil {
		t.Fatalf("ListByCapability() error = %v", err)
	}
	if len(models) != 1 || models[0].ModelID != "gpt-image-2" {
		t.Fatalf("models = %#v, want newly added image model", models)
	}
	if len(fake.filters) != 2 {
		t.Fatalf("contract calls = %d, want 2 fresh catalog reads", len(fake.filters))
	}
}

func TestPublicModelFromDescriptorDoesNotExposeLegacyModelConfigID(t *testing.T) {
	model := publicModelFromDescriptor(providercontract.AIModelDescriptor{
		ModelID:     "gpt-5.2",
		DisplayName: "GPT 5.2",
	})

	if model.ID != 0 || model.CatalogEntryID != 0 {
		t.Fatalf("model = %#v, want no visible id without catalog entry", model)
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
