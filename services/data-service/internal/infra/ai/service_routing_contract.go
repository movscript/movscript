package ai

import (
	"context"
	"fmt"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func (s *AIService) ResolveGatewayModelRoute(ctx context.Context, request providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoute, error) {
	route, err := s.ResolveModelRoute(ModelRouteRequest{
		ModelID:               request.ModelID,
		CatalogEntryID:        request.CatalogEntryID,
		RouteBindingID:        request.RouteBindingID,
		Capability:            request.Capability,
		Operation:             request.Operation,
		ReferenceAssets:       routeReferenceAssetsFromContract(request.ReferenceAssets),
		APIKind:               request.APIKind,
		APIKinds:              request.APIKinds,
		RouteGroup:            providerRouteGroupFromContext(ctx),
		PreferredAdapterTypes: request.PreferredAdapterTypes,
		EstimatedUsage:        usageEstimateFromContract(request.EstimatedUsage),
	})
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, err
	}
	return modelRouteToContract(route, request.Capability), nil
}

func (s *AIService) ResolveGatewayModelRoutePlan(ctx context.Context, request providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoutePlan, error) {
	plan, err := s.ResolveModelRoutePlan(ModelRouteRequest{
		ModelID:               request.ModelID,
		CatalogEntryID:        request.CatalogEntryID,
		RouteBindingID:        request.RouteBindingID,
		Capability:            request.Capability,
		Operation:             request.Operation,
		ReferenceAssets:       routeReferenceAssetsFromContract(request.ReferenceAssets),
		APIKind:               request.APIKind,
		APIKinds:              request.APIKinds,
		RouteGroup:            providerRouteGroupFromContext(ctx),
		PreferredAdapterTypes: request.PreferredAdapterTypes,
		EstimatedUsage:        usageEstimateFromContract(request.EstimatedUsage),
	})
	if err != nil {
		return providercontract.AIGatewayModelRoutePlan{}, err
	}
	routes := make([]providercontract.AIGatewayModelRoute, 0, len(plan.Routes))
	for _, route := range plan.Routes {
		routes = append(routes, modelRouteToContract(route, plan.Capability))
	}
	return providercontract.AIGatewayModelRoutePlan{
		ModelID:         plan.ModelID,
		Capability:      plan.Capability,
		Routes:          routes,
		FallbackEnabled: len(routes) > 1,
		SelectionReason: plan.SelectionReason,
	}, nil
}

func (s *AIService) ResolveGatewayTextModelRoute(ctx context.Context, modelID string) (providercontract.AIGatewayModelRoute, error) {
	var lastErr error
	for _, capability := range textRuntimeCapabilities() {
		route, err := s.ResolveModelRoute(ModelRouteRequest{
			ModelID:    modelID,
			Capability: capability,
			RouteGroup: providerRouteGroupFromContext(ctx),
		})
		if err == nil {
			return modelRouteToContract(route, capability), nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return providercontract.AIGatewayModelRoute{}, lastErr
	}
	return providercontract.AIGatewayModelRoute{}, fmt.Errorf("no text runtime capability requested")
}

func (s *AIService) ResolveGatewayGenerationModelRoute(ctx context.Context, modelID string, outputType string) (providercontract.AIGatewayModelRoute, error) {
	route, err := s.ResolveModelRoute(ModelRouteRequest{
		ModelID:    modelID,
		Capability: outputType,
		RouteGroup: providerRouteGroupFromContext(ctx),
	})
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, err
	}
	return modelRouteToContract(route, outputType), nil
}

func modelRouteToContract(route ModelRoute, capability string) providercontract.AIGatewayModelRoute {
	return providercontract.AIGatewayModelRoute{
		ModelID:         route.ModelID,
		CatalogEntryID:  route.CatalogEntryID,
		RouteBindingID:  route.RouteBindingID,
		CredentialID:    route.CredentialID,
		SourceType:      route.SourceType,
		RouteGroup:      route.RouteGroup,
		ProviderID:      route.ProviderID,
		ProviderKind:    route.ProviderKind,
		AdapterKey:      route.AdapterKey,
		AdapterType:     route.AdapterType,
		ProviderModelID: route.ProviderModelID,
		ProtocolProfile: route.ProtocolProfile,
		Capability:      capability,
		Operation:       route.Operation,
		APIKind:         route.APIKind,
		APIKinds:        append([]string(nil), route.APIKinds...),
		SelectionReason: route.SelectionReason,
	}
}

func routeReferenceAssetsFromContract(values []providercontract.AIReferenceAssetIntent) []RouteReferenceAssetIntent {
	if len(values) == 0 {
		return nil
	}
	out := make([]RouteReferenceAssetIntent, 0, len(values))
	for _, value := range values {
		out = append(out, RouteReferenceAssetIntent{
			Role:      value.Role,
			MediaType: value.MediaType,
		})
	}
	return out
}
