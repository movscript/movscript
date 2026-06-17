package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func (s *AIService) EstimateTextGatewayUsage(ctx context.Context, route providercontract.AIGatewayRouteRequest, request providercontract.TextRequest) (providercontract.AIUsageEstimate, error) {
	resolved, err := s.gatewayUsageModelRoute(ctx, route, textRuntimeCapabilities()...)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	estimate, err := s.EstimateTextRouteCost(ctx, 0, resolved, request)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	return usageEstimateToContract(estimate), nil
}

func (s *AIService) EstimateImageGatewayUsage(ctx context.Context, route providercontract.AIGatewayRouteRequest, request providercontract.ImageRequest) (providercontract.AIUsageEstimate, error) {
	resolved, err := s.gatewayUsageModelRoute(ctx, route, CapabilityImage, CapabilityImageEdit)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	estimate, err := s.EstimateImageRouteCost(ctx, 0, resolved, request)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	return usageEstimateToContract(estimate), nil
}

func (s *AIService) EstimateVideoGatewayUsage(ctx context.Context, route providercontract.AIGatewayRouteRequest, request providercontract.VideoRequest) (providercontract.AIUsageEstimate, error) {
	resolved, err := s.gatewayUsageModelRoute(ctx, route, CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	estimate, err := s.EstimateVideoRouteCost(ctx, 0, resolved, request)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	return usageEstimateToContract(estimate), nil
}

func (s *AIService) gatewayUsageModelRoute(ctx context.Context, request providercontract.AIGatewayRouteRequest, fallbackCapabilities ...string) (ModelRoute, error) {
	capabilities := make([]string, 0, len(fallbackCapabilities)+1)
	seen := map[string]bool{}
	for _, capability := range append([]string{request.Capability}, fallbackCapabilities...) {
		capability = strings.TrimSpace(capability)
		if capability == "" || seen[capability] {
			continue
		}
		seen[capability] = true
		capabilities = append(capabilities, capability)
	}
	if len(capabilities) == 0 {
		return ModelRoute{}, fmt.Errorf("model capability is required")
	}
	var lastErr error
	for _, capability := range capabilities {
		req := request
		req.Capability = capability
		route, err := s.ResolveGatewayModelRoute(ctx, req)
		if err == nil {
			return gatewayContractRouteToModelRoute(route), nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return ModelRoute{}, lastErr
	}
	return ModelRoute{}, fmt.Errorf("model route not found")
}

func gatewayContractRouteToModelRoute(route providercontract.AIGatewayModelRoute) ModelRoute {
	return ModelRoute{
		ModelID:         route.ModelID,
		RuntimeModelID:  route.CatalogEntryID,
		CatalogEntryID:  route.CatalogEntryID,
		RouteBindingID:  route.RouteBindingID,
		CredentialID:    route.CredentialID,
		SourceType:      route.SourceType,
		RouteGroup:      route.RouteGroup,
		ProviderModelID: route.ProviderModelID,
		SelectionReason: route.SelectionReason,
		EstimatedCost:   route.EstimatedCost,
	}
}

func (s *AIService) ReserveGatewayUsage(ctx context.Context, request providercontract.AIUsageReserveRequest) (providercontract.AIUsageReservation, error) {
	reservation, err := s.ReserveUsage(
		ctx,
		request.UserID,
		gatewayUsageReserveCompatibilityID(request),
		usageEstimateFromContract(request.Estimate),
		usageContextFromContract(request.Context),
	)
	if err != nil {
		return providercontract.AIUsageReservation{}, err
	}
	return usageReservationToContract(*reservation), nil
}

func (s *AIService) SetGatewayReservationJob(ctx context.Context, request providercontract.AIUsageJobBindingRequest) error {
	return s.SetReservationJob(ctx, request.ReservationID, request.JobID)
}

func (s *AIService) ReleaseGatewayUsageReservation(ctx context.Context, request providercontract.AIUsageReleaseRequest) error {
	return s.ReleaseReservation(ctx, request.ReservationID, request.Reason)
}

func (s *AIService) SettleGatewayUsage(ctx context.Context, request providercontract.AIUsageSettleRequest) error {
	return s.settleUsage(
		ctx,
		request.UserID,
		gatewayUsageSettleCompatibilityID(request),
		usageEstimateFromContract(request.Estimate),
		usageContextFromContract(request.Context),
	)
}

func (s *AIService) EvaluateGatewayGovernance(ctx context.Context, request providercontract.AIGatewayGovernanceRequest) (providercontract.AIGatewayGovernanceDecision, error) {
	plan, err := s.ResolveGatewayModelRoutePlan(ctx, request.Route)
	if err != nil {
		return providercontract.AIGatewayGovernanceDecision{
			Allowed: false,
			Reason:  err.Error(),
		}, nil
	}
	if len(plan.Routes) == 0 {
		return providercontract.AIGatewayGovernanceDecision{
			Allowed: false,
			Reason:  "no provider route available",
		}, nil
	}
	estimate := request.Route.EstimatedUsage
	if estimate.Cost == 0 {
		estimate.Cost = plan.Routes[0].EstimatedCost
	}
	return providercontract.AIGatewayGovernanceDecision{
		Allowed:        true,
		Reason:         "allowed",
		Route:          plan.Routes[0],
		RoutePlan:      plan,
		EstimatedUsage: estimate,
		EstimatedCost:  plan.Routes[0].EstimatedCost,
	}, nil
}

func (s *AIService) ProbeGatewayProvider(ctx context.Context, request providercontract.AIGatewayProviderProbeRequest) (providercontract.AIGatewayProviderProbeResult, error) {
	if s == nil || s.db == nil || s.registry == nil {
		return providercontract.AIGatewayProviderProbeResult{}, fmt.Errorf("ai service is not configured")
	}
	provider, health, err := s.providerForProbe(ctx, request)
	if err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
		return providercontract.AIGatewayProviderProbeResult{
			Health:  health,
			Success: false,
			Message: err.Error(),
		}, nil
	}
	start := time.Now()
	if err := provider.Ping(ctx); err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
		return providercontract.AIGatewayProviderProbeResult{
			Health:    health,
			Success:   false,
			Message:   err.Error(),
			LatencyMs: time.Since(start).Milliseconds(),
		}, nil
	}
	health.Status = providercontract.HealthStatusOK
	health.Message = "provider ping succeeded"
	return providercontract.AIGatewayProviderProbeResult{
		Health:    health,
		Success:   true,
		Message:   health.Message,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}

func (s *AIService) ListGatewayRuntimeHealth(_ context.Context) ([]providercontract.AIGatewayRuntimeHealth, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("ai service is not configured")
	}
	items, err := RuntimeProviderHealthSnapshot(s.db)
	if err != nil {
		return nil, err
	}
	out := make([]providercontract.AIGatewayRuntimeHealth, 0, len(items))
	for _, item := range items {
		out = append(out, providercontract.AIGatewayRuntimeHealth{
			CatalogEntryID:      item.CatalogEntryID,
			RouteBindingID:      item.RouteBindingID,
			ModelID:             item.ModelID,
			ModelDefID:          item.ModelDefID,
			ProviderName:        item.ProviderName,
			AdapterType:         item.AdapterType,
			Priority:            item.Priority,
			CapacityWeight:      item.CapacityWeight,
			MaxConcurrency:      item.MaxConcurrency,
			IsEnabled:           item.IsEnabled,
			InFlight:            item.InFlight,
			Saturated:           item.Saturated,
			Successes:           item.Successes,
			Failures:            item.Failures,
			ConsecutiveFailures: item.ConsecutiveFailures,
			FailureRate:         item.FailureRate,
			CircuitOpen:         item.CircuitOpen,
			OpenUntil:           item.OpenUntil,
			CooldownRemainingMs: item.CooldownRemainingMs,
		})
	}
	return out, nil
}

func (s *AIService) providerForProbe(ctx context.Context, request providercontract.AIGatewayProviderProbeRequest) (Provider, providercontract.ProviderHealth, error) {
	health := providercontract.ProviderHealth{
		Type:     providercontract.TypeAIGateway,
		Assembly: providercontract.AssemblyStartup,
	}
	if gatewayProbeRouteRequestSet(request.Route) {
		route, err := s.ResolveGatewayModelRoute(ctx, request.Route)
		if err != nil {
			return nil, health, err
		}
		resolved := gatewayContractRouteToModelRoute(route)
		if resolved.CatalogEntryID != 0 {
			runtime, handled, err := s.catalogRouteRuntime(ctx, 0, resolved, route.Capability)
			if err != nil {
				return nil, health, err
			}
			if handled {
				health.Adapter = runtime.adapterType
				health.Capabilities = append([]string(nil), runtime.def.Capabilities...)
				return runtime.provider, health, nil
			}
		}
		return nil, health, fmt.Errorf("catalog route is required for provider probe")
	}
	if request.CredentialID != 0 {
		var cred persistencemodel.AICredential
		if err := s.db.Where("id = ? AND is_enabled = true", request.CredentialID).First(&cred).Error; err != nil {
			return nil, health, err
		}
		health.Adapter = cred.AdapterType
		provider, err := s.registry.BuildForCredential(cred)
		return provider, health, err
	}
	return nil, health, fmt.Errorf("credential_id is required")
}

func gatewayProbeRouteRequestSet(route providercontract.AIGatewayRouteRequest) bool {
	return strings.TrimSpace(route.ModelID) != "" || route.CatalogEntryID != 0 || route.RouteBindingID != 0
}

func usageContextFromContract(input providercontract.AIUsageContext) UsageContext {
	return UsageContext{
		OrgID:                 input.OrgID,
		ProjectID:             input.ProjectID,
		GatewayAPIKeyID:       input.GatewayAPIKeyID,
		JobID:                 input.JobID,
		ReservationID:         input.ReservationID,
		AIModelCatalogEntryID: input.AIModelCatalogEntryID,
		RouteBindingID:        input.RouteBindingID,
	}
}

func usageContextToContract(input UsageContext) providercontract.AIUsageContext {
	return providercontract.AIUsageContext{
		OrgID:                 input.OrgID,
		ProjectID:             input.ProjectID,
		GatewayAPIKeyID:       input.GatewayAPIKeyID,
		JobID:                 input.JobID,
		ReservationID:         input.ReservationID,
		AIModelCatalogEntryID: input.AIModelCatalogEntryID,
		RouteBindingID:        input.RouteBindingID,
	}
}

func usageEstimateFromContract(input providercontract.AIUsageEstimate) UsageEstimate {
	return UsageEstimate{
		OperationType:     input.OperationType,
		InputTokens:       input.InputTokens,
		OutputTokens:      input.OutputTokens,
		CachedInputTokens: input.CachedInputTokens,
		ReasoningTokens:   input.ReasoningTokens,
		DurationSec:       input.DurationSec,
		ImageCount:        input.ImageCount,
		Cost:              input.Cost,
	}
}

func usageEstimateToContract(input UsageEstimate) providercontract.AIUsageEstimate {
	return providercontract.AIUsageEstimate{
		OperationType:     input.OperationType,
		InputTokens:       input.InputTokens,
		OutputTokens:      input.OutputTokens,
		CachedInputTokens: input.CachedInputTokens,
		ReasoningTokens:   input.ReasoningTokens,
		DurationSec:       input.DurationSec,
		ImageCount:        input.ImageCount,
		Cost:              input.Cost,
	}
}

func usageReservationToContract(input persistencemodel.UsageReservation) providercontract.AIUsageReservation {
	return providercontract.AIUsageReservation{
		ID:                    input.ID,
		UserID:                input.UserID,
		OrgID:                 input.OrgID,
		AIModelCatalogEntryID: input.AIModelCatalogEntryID,
		RouteBindingID:        input.RouteBindingID,
		GatewayAPIKeyID:       input.GatewayAPIKeyID,
		ProjectID:             input.ProjectID,
		JobID:                 input.JobID,
		OperationType:         input.OperationType,
		EstimatedCost:         input.EstimatedCost,
		ActualCost:            input.ActualCost,
		Status:                input.Status,
		ReleaseReason:         input.ReleaseReason,
		UsageLogID:            input.UsageLogID,
	}
}

func gatewayUsageReserveCompatibilityID(request providercontract.AIUsageReserveRequest) uint {
	if request.CatalogEntryID != 0 {
		return request.CatalogEntryID
	}
	if request.Context.AIModelCatalogEntryID != nil && *request.Context.AIModelCatalogEntryID != 0 {
		return *request.Context.AIModelCatalogEntryID
	}
	if request.RouteBindingID != 0 {
		return request.RouteBindingID
	}
	if request.Context.RouteBindingID != nil && *request.Context.RouteBindingID != 0 {
		return *request.Context.RouteBindingID
	}
	return 0
}

func gatewayUsageSettleCompatibilityID(request providercontract.AIUsageSettleRequest) uint {
	if request.CatalogEntryID != 0 {
		return request.CatalogEntryID
	}
	if request.Context.AIModelCatalogEntryID != nil && *request.Context.AIModelCatalogEntryID != 0 {
		return *request.Context.AIModelCatalogEntryID
	}
	if request.RouteBindingID != 0 {
		return request.RouteBindingID
	}
	if request.Context.RouteBindingID != nil && *request.Context.RouteBindingID != 0 {
		return *request.Context.RouteBindingID
	}
	return 0
}
