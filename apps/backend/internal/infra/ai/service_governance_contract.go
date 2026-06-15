package ai

import (
	"context"
	"fmt"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func (s *AIService) EstimateTextGatewayUsage(_ context.Context, modelConfigID uint, request providercontract.TextRequest) (providercontract.AIUsageEstimate, error) {
	estimate, err := s.EstimateTextCost(modelConfigID, request)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	return usageEstimateToContract(estimate), nil
}

func (s *AIService) EstimateImageGatewayUsage(_ context.Context, modelConfigID uint, request providercontract.ImageRequest) (providercontract.AIUsageEstimate, error) {
	estimate, err := s.EstimateImageCost(modelConfigID, request)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	return usageEstimateToContract(estimate), nil
}

func (s *AIService) EstimateVideoGatewayUsage(_ context.Context, modelConfigID uint, request providercontract.VideoRequest) (providercontract.AIUsageEstimate, error) {
	estimate, err := s.EstimateVideoCost(modelConfigID, request)
	if err != nil {
		return providercontract.AIUsageEstimate{}, err
	}
	return usageEstimateToContract(estimate), nil
}

func (s *AIService) ReserveGatewayUsage(ctx context.Context, request providercontract.AIUsageReserveRequest) (providercontract.AIUsageReservation, error) {
	reservation, err := s.ReserveUsage(
		ctx,
		request.UserID,
		request.ModelConfigID,
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
		request.ModelConfigID,
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
	provider, health, err := s.providerForProbe(request)
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
			ModelConfigID:       item.ModelConfigID,
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

func (s *AIService) providerForProbe(request providercontract.AIGatewayProviderProbeRequest) (Provider, providercontract.ProviderHealth, error) {
	health := providercontract.ProviderHealth{
		Type:     providercontract.TypeAIGateway,
		Assembly: providercontract.AssemblyStartup,
	}
	if request.ModelConfigID != 0 {
		var cfg persistencemodel.AIModelConfig
		if err := s.db.First(&cfg, request.ModelConfigID).Error; err != nil {
			return nil, health, err
		}
		provider, def, err := s.registry.BuildForConfig(cfg)
		if def != nil {
			health.Adapter = def.AdapterType
			health.Capabilities = append([]string(nil), def.Capabilities...)
		}
		return provider, health, err
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
	return nil, health, fmt.Errorf("credential_id or model_config_id is required")
}

func usageContextFromContract(input providercontract.AIUsageContext) UsageContext {
	return UsageContext{
		OrgID:           input.OrgID,
		ProjectID:       input.ProjectID,
		GatewayAPIKeyID: input.GatewayAPIKeyID,
		JobID:           input.JobID,
		ReservationID:   input.ReservationID,
	}
}

func usageContextToContract(input UsageContext) providercontract.AIUsageContext {
	return providercontract.AIUsageContext{
		OrgID:           input.OrgID,
		ProjectID:       input.ProjectID,
		GatewayAPIKeyID: input.GatewayAPIKeyID,
		JobID:           input.JobID,
		ReservationID:   input.ReservationID,
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
		ID:              input.ID,
		UserID:          input.UserID,
		OrgID:           input.OrgID,
		AIModelConfigID: input.AIModelConfigID,
		GatewayAPIKeyID: input.GatewayAPIKeyID,
		ProjectID:       input.ProjectID,
		JobID:           input.JobID,
		OperationType:   input.OperationType,
		EstimatedCost:   input.EstimatedCost,
		ActualCost:      input.ActualCost,
		Status:          input.Status,
		ReleaseReason:   input.ReleaseReason,
		UsageLogID:      input.UsageLogID,
	}
}
