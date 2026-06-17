package ai

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/observability"
)

func (s *AIService) CallTextWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req TextRequest, usage UsageContext) (TextResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range textRuntimeCapabilities() {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return TextResponse{}, err
		}
		if handled {
			return s.callCatalogTextRuntime(ctx, userID, route, runtime, capability, req, usage)
		}
	}
	return TextResponse{}, fmt.Errorf("catalog route is required for text generation")
}

func (s *AIService) callCatalogTextRuntime(ctx context.Context, userID uint, route ModelRoute, runtime catalogRouteRuntime, capability string, req TextRequest, usage UsageContext) (TextResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.IsReasoning = attemptReq.IsReasoning || modelHasCapability(runtime.def, CapabilityReasoning)
	attachTextPromptDebug(ctx, attemptReq)
	if usage.ReservationID == nil {
		estimate := estimateUsageCostWithPricing(runtime.model.pricing(), runtime.def, "text", estimateTextInputTokens(attemptReq), maxPositive(attemptReq.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return TextResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	start := time.Now()
	resp, err := runtime.provider.TextGenerate(ctx, attemptReq)
	finishAttempt(err)
	s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
		UserID:         userID,
		Usage:          usage,
		RuntimeModelID: route.RuntimeModelID,
		CredentialID:   route.CredentialID,
		Provider:       runtime.adapterType,
		OperationType:  "text",
		PromptName:     attemptReq.PromptName,
		RequestModel:   attemptReq.Model,
		ResponseModel:  attemptReq.Model,
		RequestPayload: attemptReq,
		Response:       &resp,
		Start:          start,
		Err:            err,
	})
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return TextResponse{}, err
	}
	estimate := estimateUsageCostWithPricingDetails(runtime.model.pricing(), runtime.def, "text", resp.Usage, 0, 1)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return TextResponse{}, err
	}
	_ = capability
	return resp, nil
}

func (s *AIService) CallResponsesWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req ResponsesRequest, usage UsageContext) (TextResponse, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range textRuntimeCapabilities() {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return TextResponse{}, err
		}
		if handled {
			return s.callCatalogResponsesRuntime(ctx, userID, route, runtime, req, usage)
		}
	}
	return TextResponse{}, fmt.Errorf("catalog route is required for responses generation")
}

func (s *AIService) CallResponsesStreamWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req ResponsesRequest, usage UsageContext) (<-chan ResponsesStreamEvent, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range textRuntimeCapabilities() {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return nil, err
		}
		if handled {
			return s.callCatalogResponsesStreamRuntime(ctx, userID, route, runtime, req, usage)
		}
	}
	return nil, fmt.Errorf("catalog route is required for responses stream generation")
}

func (s *AIService) callCatalogResponsesStreamRuntime(ctx context.Context, userID uint, route ModelRoute, runtime catalogRouteRuntime, req ResponsesRequest, usage UsageContext) (<-chan ResponsesStreamEvent, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	streamer, ok := runtime.provider.(ResponsesStreamProvider)
	if !ok {
		return nil, fmt.Errorf("responses streaming is not supported by provider for catalog entry %d", route.CatalogEntryID)
	}
	attemptReq := req
	attemptReq.Text.Model = route.ProviderModelID
	attemptReq.Text.IsReasoning = attemptReq.Text.IsReasoning || modelHasCapability(runtime.def, CapabilityReasoning)
	attachTextPromptDebug(ctx, attemptReq.Text)
	if usage.ReservationID == nil {
		estimate := estimateUsageCostWithPricing(runtime.model.pricing(), runtime.def, "text", estimateTextInputTokens(attemptReq.Text), maxPositive(attemptReq.Text.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return nil, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	start := time.Now()
	upstream, err := streamer.ResponsesStream(ctx, attemptReq)
	if err != nil {
		finishAttempt(err)
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			RuntimeModelID: route.RuntimeModelID,
			CredentialID:   route.CredentialID,
			Provider:       runtime.adapterType,
			OperationType:  "responses_stream",
			PromptName:     attemptReq.Text.PromptName,
			RequestModel:   attemptReq.Text.Model,
			ResponseModel:  attemptReq.Text.Model,
			RequestPayload: attemptReq,
			Start:          start,
			Err:            err,
		})
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return nil, err
	}
	return s.wrapResponsesStream(ctx, userID, route.RuntimeModelID, route.CredentialID, runtime.model.pricing(), runtime.def, runtime.adapterType, attemptReq, usage, start, finishAttempt, upstream), nil
}

func (s *AIService) wrapResponsesStream(ctx context.Context, userID uint, billRuntimeModelID uint, credentialID uint, pricing modelPricing, def *ModelDef, provider string, req ResponsesRequest, usage UsageContext, start time.Time, finishAttempt func(error), upstream <-chan ResponsesStreamEvent) <-chan ResponsesStreamEvent {
	out := make(chan ResponsesStreamEvent)
	go func() {
		defer close(out)
		var tokenUsage TokenUsage
		var streamErr error
		for event := range upstream {
			if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 || event.Usage.CachedInputTokens > 0 || event.Usage.ReasoningTokens > 0 {
				tokenUsage = event.Usage
			}
			if event.Error != "" {
				streamErr = fmt.Errorf("%s", event.Error)
			}
			out <- event
		}
		finishAttempt(streamErr)
		resp := TextResponse{FinishReason: "completed", Usage: tokenUsage}
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			RuntimeModelID: billRuntimeModelID,
			CredentialID:   credentialID,
			Provider:       provider,
			OperationType:  "responses_stream",
			PromptName:     req.Text.PromptName,
			RequestModel:   req.Text.Model,
			ResponseModel:  req.Text.Model,
			RequestPayload: req,
			Response:       &resp,
			Start:          start,
			Err:            streamErr,
		})
		if streamErr != nil {
			_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), streamErr.Error())
			return
		}
		estimate := estimateUsageCostWithPricingDetails(pricing, def, "text", tokenUsage, 0, 1)
		if err := s.settleUsage(context.WithoutCancel(ctx), userID, billRuntimeModelID, estimate, usage); err != nil {
			observability.WithRequest(ctx).Warn("usage_settle_failed", slog.String("error", err.Error()))
		}
	}()
	return out
}

func (s *AIService) callCatalogResponsesRuntime(ctx context.Context, userID uint, route ModelRoute, runtime catalogRouteRuntime, req ResponsesRequest, usage UsageContext) (TextResponse, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	attemptReq := req
	attemptReq.Text.Model = route.ProviderModelID
	attemptReq.Text.IsReasoning = attemptReq.Text.IsReasoning || modelHasCapability(runtime.def, CapabilityReasoning)
	attachTextPromptDebug(ctx, attemptReq.Text)
	if usage.ReservationID == nil {
		estimate := estimateUsageCostWithPricing(runtime.model.pricing(), runtime.def, "text", estimateTextInputTokens(attemptReq.Text), maxPositive(attemptReq.Text.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return TextResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	responder, ok := runtime.provider.(ResponsesProvider)
	var resp TextResponse
	var err error
	start := time.Now()
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	if ok {
		resp, err = responder.ResponsesGenerate(ctx, attemptReq)
		if err != nil {
			responsesErr := err
			fallbackResp, fallbackErr := runtime.provider.TextGenerate(ctx, attemptReq.Text)
			if fallbackErr == nil {
				resp = fallbackResp
				err = nil
			} else {
				err = fmt.Errorf("%w; chat fallback: %w", responsesErr, fallbackErr)
			}
		}
	} else {
		resp, err = runtime.provider.TextGenerate(ctx, attemptReq.Text)
	}
	finishAttempt(err)
	s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
		UserID:         userID,
		Usage:          usage,
		RuntimeModelID: route.RuntimeModelID,
		CredentialID:   route.CredentialID,
		Provider:       runtime.adapterType,
		OperationType:  "responses",
		PromptName:     attemptReq.Text.PromptName,
		RequestModel:   attemptReq.Text.Model,
		ResponseModel:  attemptReq.Text.Model,
		RequestPayload: attemptReq,
		Response:       &resp,
		Start:          start,
		Err:            err,
	})
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return TextResponse{}, err
	}
	estimate := estimateUsageCostWithPricingDetails(runtime.model.pricing(), runtime.def, "text", resp.Usage, 0, 1)
	if err := s.settleUsage(ctx, userID, route.RuntimeModelID, estimate, usage); err != nil {
		return TextResponse{}, err
	}
	return resp, nil
}

func (s *AIService) CallTextStreamWithRouteUsage(ctx context.Context, userID uint, route ModelRoute, req TextRequest, usage UsageContext) (<-chan TextStreamEvent, error) {
	usage = usageWithRoute(usage, route)
	for _, capability := range textRuntimeCapabilities() {
		runtime, handled, err := s.catalogRouteRuntime(ctx, userID, route, capability)
		if err != nil {
			return nil, err
		}
		if handled {
			return s.callCatalogTextStreamRuntime(ctx, userID, route, runtime, req, usage)
		}
	}
	return nil, fmt.Errorf("catalog route is required for text stream generation")
}

func (s *AIService) callCatalogTextStreamRuntime(ctx context.Context, userID uint, route ModelRoute, runtime catalogRouteRuntime, req TextRequest, usage UsageContext) (<-chan TextStreamEvent, error) {
	ctx = withProviderSubject(ctx, userID, usage.OrgID)
	streamer, ok := runtime.provider.(TextStreamProvider)
	if !ok {
		return nil, fmt.Errorf("streaming is not supported by provider for catalog entry %d", route.CatalogEntryID)
	}
	attemptReq := req
	attemptReq.Model = route.ProviderModelID
	attemptReq.IsReasoning = attemptReq.IsReasoning || modelHasCapability(runtime.def, CapabilityReasoning)
	attachTextPromptDebug(ctx, attemptReq)
	if usage.ReservationID == nil {
		estimate := estimateUsageCostWithPricing(runtime.model.pricing(), runtime.def, "text", estimateTextInputTokens(attemptReq), maxPositive(attemptReq.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, route.RuntimeModelID, estimate, usage)
		if err != nil {
			return nil, err
		}
		usage.ReservationID = &reservation.ID
	}
	finishAttempt := beginRuntimeProviderAttempt(route.RuntimeModelID)
	start := time.Now()
	upstream, err := streamer.TextStream(ctx, attemptReq)
	if err != nil {
		finishAttempt(err)
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			RuntimeModelID: route.RuntimeModelID,
			CredentialID:   route.CredentialID,
			Provider:       runtime.adapterType,
			OperationType:  "text_stream",
			PromptName:     attemptReq.PromptName,
			RequestModel:   attemptReq.Model,
			ResponseModel:  attemptReq.Model,
			RequestPayload: attemptReq,
			Start:          start,
			Err:            err,
		})
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return nil, err
	}
	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		var tokenUsage TokenUsage
		var streamErr error
		var content strings.Builder
		finishReason := ""
		for event := range upstream {
			if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 || event.Usage.CachedInputTokens > 0 || event.Usage.ReasoningTokens > 0 {
				tokenUsage = event.Usage
			}
			if event.Error != "" {
				streamErr = fmt.Errorf("%s", event.Error)
			}
			if event.ContentDelta != "" {
				content.WriteString(event.ContentDelta)
			}
			if event.FinishReason != "" {
				finishReason = event.FinishReason
			}
			out <- event
		}
		finishAttempt(streamErr)
		resp := TextResponse{Content: content.String(), FinishReason: finishReason, Usage: tokenUsage}
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			RuntimeModelID: route.RuntimeModelID,
			CredentialID:   route.CredentialID,
			Provider:       runtime.adapterType,
			OperationType:  "text_stream",
			PromptName:     attemptReq.PromptName,
			RequestModel:   attemptReq.Model,
			ResponseModel:  attemptReq.Model,
			RequestPayload: attemptReq,
			Response:       &resp,
			Start:          start,
			Err:            streamErr,
		})
		if streamErr != nil {
			_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), streamErr.Error())
			return
		}
		estimate := estimateUsageCostWithPricingDetails(runtime.model.pricing(), runtime.def, "text", tokenUsage, 0, 1)
		if err := s.settleUsage(context.WithoutCancel(ctx), userID, route.RuntimeModelID, estimate, usage); err != nil {
			observability.WithRequest(ctx).Warn("usage_settle_failed", slog.String("error", err.Error()))
		}
	}()
	return out, nil
}
