package ai

import (
	"context"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func (s *AIService) ResolveGatewayModelRoute(_ context.Context, request providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoute, error) {
	route, err := s.ResolveModelRoute(ModelRouteRequest{
		ModelID:               request.ModelID,
		ModelConfigID:         request.ModelConfigID,
		Capability:            request.Capability,
		PreferredAdapterTypes: request.PreferredAdapterTypes,
		EstimatedUsage:        usageEstimateFromContract(request.EstimatedUsage),
		MaxEstimatedCost:      request.MaxEstimatedCost,
	})
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, err
	}
	return modelRouteToContract(route, request.Capability), nil
}

func (s *AIService) ResolveGatewayModelRoutePlan(_ context.Context, request providercontract.AIGatewayRouteRequest) (providercontract.AIGatewayModelRoutePlan, error) {
	plan, err := s.ResolveModelRoutePlan(ModelRouteRequest{
		ModelID:               request.ModelID,
		ModelConfigID:         request.ModelConfigID,
		Capability:            request.Capability,
		PreferredAdapterTypes: request.PreferredAdapterTypes,
		EstimatedUsage:        usageEstimateFromContract(request.EstimatedUsage),
		MaxEstimatedCost:      request.MaxEstimatedCost,
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

func (s *AIService) ResolveGatewayTextModelRoute(_ context.Context, modelID string) (providercontract.AIGatewayModelRoute, error) {
	route, err := s.ResolveTextModelRoute(modelID)
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, err
	}
	return modelRouteToContract(route, CapabilityText), nil
}

func (s *AIService) ResolveGatewayGenerationModelRoute(_ context.Context, modelID string, outputType string) (providercontract.AIGatewayModelRoute, error) {
	route, err := s.ResolveGenerationModelRoute(modelID, outputType)
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, err
	}
	return modelRouteToContract(route, outputType), nil
}

func modelRouteToContract(route ModelRoute, capability string) providercontract.AIGatewayModelRoute {
	return providercontract.AIGatewayModelRoute{
		ModelID:         route.ModelID,
		ModelConfigID:   route.ModelConfigID,
		ProviderModelID: route.ProviderModelID,
		Capability:      capability,
		SelectionReason: route.SelectionReason,
		EstimatedCost:   route.EstimatedCost,
	}
}
