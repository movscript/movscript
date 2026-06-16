package gateway

import (
	"context"
	"errors"
	"testing"

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
			ModelConfigID:   9,
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
	if id != 9 || responseModel != "logical-chat" {
		t.Fatalf("resolved model = id %d response %q, want routing model id 9 and logical-chat", id, responseModel)
	}
	if routes.routeRequest.ModelID != "logical-chat" || routes.routeRequest.Capability != ai.CapabilityText {
		t.Fatalf("routing request = %#v, want logical-chat text lookup", routes.routeRequest)
	}
}
