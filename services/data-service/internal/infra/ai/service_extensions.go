package ai

import (
	"context"
	"fmt"
	"strings"
)

func (s *AIService) CallEmbeddingWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req EmbeddingRequest, usage UsageContext) (EmbeddingResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityFamilyEmbedding)
	if err != nil {
		return EmbeddingResponse{}, err
	}
	if !handled {
		return EmbeddingResponse{}, fmt.Errorf("catalog route is required for embedding")
	}
	provider, ok := runtime.provider.(EmbeddingProvider)
	if !ok {
		return EmbeddingResponse{}, fmt.Errorf("catalog entry id=%d does not support embedding", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.ProtocolProfile = strings.TrimSpace(route.ProtocolProfile)
	estimatedInputTokens := estimateStringSliceTokens(attemptReq.Inputs)
	if usage.ReservationID == nil {
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityFamilyEmbedding, estimatedInputTokens, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return EmbeddingResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := provider.CreateEmbeddings(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return EmbeddingResponse{}, err
	}
	usageDetails := resp.Usage
	if usageDetails.InputTokens <= 0 && usageDetails.OutputTokens <= 0 {
		usageDetails.InputTokens = estimatedInputTokens
	}
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimateUsageDetails(runtime.model.usageProfile(), runtime.def, CapabilityFamilyEmbedding, usageDetails, 0, 1), usage); err != nil {
		return EmbeddingResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallRerankWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req RerankRequest, usage UsageContext) (RerankResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityFamilyRerank)
	if err != nil {
		return RerankResponse{}, err
	}
	if !handled {
		return RerankResponse{}, fmt.Errorf("catalog route is required for rerank")
	}
	provider, ok := runtime.provider.(RerankProvider)
	if !ok {
		return RerankResponse{}, fmt.Errorf("catalog entry id=%d does not support rerank", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.ProtocolProfile = strings.TrimSpace(route.ProtocolProfile)
	inputTokens := estimateRerankInputTokens(attemptReq)
	if usage.ReservationID == nil {
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityFamilyRerank, inputTokens, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return RerankResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := provider.Rerank(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return RerankResponse{}, err
	}
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityFamilyRerank, inputTokens, 0, 0, 1), usage); err != nil {
		return RerankResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallModerationWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req ModerationRequest, usage UsageContext) (ModerationResponse, error) {
	usage = usageWithRoute(usage, route)
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityFamilyModeration)
	if err != nil {
		return ModerationResponse{}, err
	}
	if !handled {
		return ModerationResponse{}, fmt.Errorf("catalog route is required for moderation")
	}
	provider, ok := runtime.provider.(ModerationProvider)
	if !ok {
		return ModerationResponse{}, fmt.Errorf("catalog entry id=%d does not support moderation", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.ProtocolProfile = strings.TrimSpace(route.ProtocolProfile)
	inputTokens := estimateStringSliceTokens(attemptReq.Inputs)
	if usage.ReservationID == nil {
		estimate := estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityFamilyModeration, inputTokens, 0, 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return ModerationResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	resp, err := provider.Moderate(ctx, attemptReq)
	finishAttempt(err)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return ModerationResponse{}, err
	}
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimateUsage(runtime.model.usageProfile(), runtime.def, CapabilityFamilyModeration, inputTokens, 0, 0, 1), usage); err != nil {
		return ModerationResponse{}, err
	}
	return resp, nil
}

func (s *AIService) ConnectRealtimeWithRoute(ctx context.Context, userID uint, route ModelRoute, req RealtimeSessionRequest) (RealtimeSession, error) {
	runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, CapabilityFamilyRealtime)
	if err != nil {
		return nil, err
	}
	if !handled {
		return nil, fmt.Errorf("catalog route is required for realtime")
	}
	provider, ok := runtime.provider.(RealtimeProvider)
	if !ok {
		return nil, fmt.Errorf("catalog entry id=%d does not support realtime", route.CatalogEntryID)
	}
	ctx = withProviderSubject(ctx, userID, nil)
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.ProtocolProfile = strings.TrimSpace(route.ProtocolProfile)
	return provider.ConnectRealtime(ctx, attemptReq)
}

func estimateStringSliceTokens(values []string) int {
	chars := 0
	for _, value := range values {
		chars += len(value)
	}
	if chars <= 0 {
		return 1
	}
	return chars/4 + 1
}

func estimateRerankInputTokens(req RerankRequest) int {
	values := []string{req.Query}
	for _, document := range req.Documents {
		if document.Text != "" {
			values = append(values, document.Text)
			continue
		}
		for _, value := range document.Data {
			if s, ok := value.(string); ok && strings.TrimSpace(s) != "" {
				values = append(values, s)
			}
		}
	}
	return estimateStringSliceTokens(values)
}
