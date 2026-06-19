package gateway

import (
	"context"
	"errors"
	"testing"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type emptyCatalogRoutePolicy struct {
	routeRequest providercontract.AIGatewayRouteRequest
}

func (p *emptyCatalogRoutePolicy) ListModels(context.Context, providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	return nil, nil
}

func (p *emptyCatalogRoutePolicy) ResolveModel(context.Context, providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	return providercontract.AIModelBinding{}, errors.New("not implemented")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayModelRoute(_ context.Context, request providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoute, error) {
	p.routeRequest = request
	if request.ModelID == "logical-chat" && request.Capability == ai.CapabilityText {
		return providercontract.AIGatewayModelRoute{
			ModelID:         "logical-chat",
			CatalogEntryID:  19,
			RouteBindingID:  29,
			ProviderModelID: "provider-chat",
			Capability:      ai.CapabilityText,
		}, nil
	}
	return providercontract.AIGatewayModelRoute{}, errors.New("route not found")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayModelRoutePlan(context.Context, providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoutePlan, error) {
	return providercontract.AIGatewayModelRoutePlan{}, errors.New("not implemented")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayTextModelRoute(context.Context, string) (providercontract.AIGatewayModelRoute, error) {
	return providercontract.AIGatewayModelRoute{}, errors.New("not implemented")
}

func (p *emptyCatalogRoutePolicy) ResolveGatewayGenerationModelRoute(context.Context, string, string) (providercontract.AIGatewayModelRoute, error) {
	return providercontract.AIGatewayModelRoute{}, errors.New("not implemented")
}

func TestResolveModelForCapabilityFallsBackToRoutingWhenCatalogIsEmpty(t *testing.T) {
	routes := &emptyCatalogRoutePolicy{}
	service := &Service{catalog: routes, routing: routes}

	id, responseModel, err := service.resolveModelForCapability(context.Background(), "logical-chat", ai.CapabilityText)

	if err != nil {
		t.Fatalf("resolveModelForCapability() error = %v", err)
	}
	if id != 19 || responseModel != "logical-chat" {
		t.Fatalf("resolved model = id %d response %q, want catalog entry id 19 and logical-chat", id, responseModel)
	}
	if routes.routeRequest.ModelID != "logical-chat" || routes.routeRequest.Capability != ai.CapabilityText {
		t.Fatalf("routing request = %#v, want logical-chat text lookup", routes.routeRequest)
	}
}

func TestListChatModelsFiltersGatewayKeyAllowedCatalogEntries(t *testing.T) {
	catalog := &fakeGatewayModelCatalog{
		models: []providercontract.AIModelDescriptor{
			{ModelID: "public-a", CatalogEntryID: 1, Capabilities: []string{ai.CapabilityText}},
			{ModelID: "public-b", CatalogEntryID: 2, Capabilities: []string{ai.CapabilityText}},
		},
	}
	service := &Service{catalog: catalog, policy: &PolicyService{}}
	key := &domaingateway.APIKey{
		AllowedScopes:          `["model:chat"]`,
		AllowedCatalogEntryIDs: `[2]`,
	}

	models, err := service.ListChatModels(context.Background(), Principal{Key: key})
	if err != nil {
		t.Fatalf("ListChatModels() error = %v", err)
	}
	if len(models) != 1 || models[0].CatalogEntryID != 2 || models[0].ModelID != "public-b" {
		t.Fatalf("models = %#v, want only allowed catalog entry 2", models)
	}
	if !containsString(catalog.lastFilter.APIKinds, ai.ModelAPIKindAnthropicMessages) {
		t.Fatalf("ListChatModels APIKinds = %#v, want Anthropic Messages included", catalog.lastFilter.APIKinds)
	}
}

func TestChatModelFromDescriptorUsesCatalogEntryIDAsVisibleID(t *testing.T) {
	model := chatModelFromDescriptor(providercontract.AIModelDescriptor{
		ModelID:        "public-chat",
		CatalogEntryID: 202,
	})

	if model.ID != 202 || model.CatalogEntryID != 202 {
		t.Fatalf("chat model = %#v, want visible id from catalog entry", model)
	}
}

type fakeGatewayModelCatalog struct {
	models     []providercontract.AIModelDescriptor
	lastFilter providercontract.AIModelListFilter
}

func (f *fakeGatewayModelCatalog) ListModels(_ context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	f.lastFilter = filter
	return f.models, nil
}

func (f *fakeGatewayModelCatalog) ResolveModel(context.Context, providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	return providercontract.AIModelBinding{}, errors.New("not implemented")
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
