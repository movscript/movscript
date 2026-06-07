package ai

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/observability"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

// CallText calls a text generation model by AIModelConfig DB ID.
func (s *AIService) CallText(ctx context.Context, userID, modelConfigID uint, req TextRequest) (TextResponse, error) {
	return s.CallTextWithUsage(ctx, userID, modelConfigID, req, UsageContext{})
}

func (s *AIService) CallTextWithUsage(ctx context.Context, userID, modelConfigID uint, req TextRequest, usage UsageContext) (TextResponse, error) {
	candidates, err := s.runtimeTextModelCandidates(modelConfigID)
	if err != nil {
		return TextResponse{}, err
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, "text_reasoning"), candidates)
	var lastErr error
	for _, attempt := range attempts {
		capability := attempt.capability
		if capability == "" {
			capability = CapabilityText
		}
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, capability)
		if err != nil {
			lastErr = err
			continue
		}
		attemptReq := req
		attemptReq.Model = resolveModelID(cfg, def)
		attemptReq.IsReasoning = attemptReq.IsReasoning || modelHasCapability(def, CapabilityReasoning)
		attachTextPromptDebug(ctx, attemptReq)
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(attemptReq), maxPositive(attemptReq.MaxTokens, 1024), 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return TextResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		start := time.Now()
		resp, err := provider.TextGenerate(ctx, attemptReq)
		finishAttempt(err)
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			Config:         cfg,
			Provider:       attempt.adapterType,
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
			lastErr = err
			continue
		}
		estimate := estimateUsageCostWithDetails(cfg, def, "text", resp.Usage, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return TextResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return TextResponse{}, lastErr
	}
	return TextResponse{}, fmt.Errorf("no available provider variant for model config id=%d and text/reasoning capability", modelConfigID)
}

func (s *AIService) CallResponsesWithUsage(ctx context.Context, userID, modelConfigID uint, req ResponsesRequest, usage UsageContext) (TextResponse, error) {
	candidates, err := s.runtimeTextModelCandidates(modelConfigID)
	if err != nil {
		return TextResponse{}, err
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, "text_reasoning"), candidates)
	var lastErr error
	for _, attempt := range attempts {
		capability := attempt.capability
		if capability == "" {
			capability = CapabilityText
		}
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, capability)
		if err != nil {
			lastErr = err
			continue
		}
		attemptReq := req
		attemptReq.Text.Model = resolveModelID(cfg, def)
		attemptReq.Text.IsReasoning = attemptReq.Text.IsReasoning || modelHasCapability(def, CapabilityReasoning)
		attachTextPromptDebug(ctx, attemptReq.Text)
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(attemptReq.Text), maxPositive(attemptReq.Text.MaxTokens, 1024), 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return TextResponse{}, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		responder, ok := provider.(ResponsesProvider)
		var resp TextResponse
		start := time.Now()
		observability.WithRequest(ctx).Info("ai_responses_provider_attempt",
			slog.Uint64("model_config_id", uint64(attempt.cfg.ID)),
			slog.String("adapter_type", attempt.adapterType),
			slog.String("request_model", attemptReq.Text.Model),
			slog.String("provider_base_url", providerBaseURLForLog(provider)),
			slog.Bool("responses_provider", ok),
			slog.Int("message_count", len(attemptReq.Text.Messages)),
			slog.Bool("has_tools", len(attemptReq.Tools) > 0 || len(attemptReq.Text.Tools) > 0),
		)
		if ok {
			resp, err = responder.ResponsesGenerate(ctx, attemptReq)
			if err != nil {
				responsesErr := err
				observability.WithRequest(ctx).Warn("ai_responses_provider_failed",
					slog.Uint64("model_config_id", uint64(attempt.cfg.ID)),
					slog.String("adapter_type", attempt.adapterType),
					slog.String("request_model", attemptReq.Text.Model),
					slog.String("provider_base_url", providerBaseURLForLog(provider)),
					slog.String("error", responsesErr.Error()),
					slog.String("fallback", "chat_completions"),
				)
				fallbackResp, fallbackErr := provider.TextGenerate(ctx, attemptReq.Text)
				if fallbackErr == nil {
					resp = fallbackResp
					err = nil
					observability.WithRequest(ctx).Info("ai_responses_chat_fallback_succeeded",
						slog.Uint64("model_config_id", uint64(attempt.cfg.ID)),
						slog.String("adapter_type", attempt.adapterType),
						slog.String("request_model", attemptReq.Text.Model),
					)
				} else {
					err = fmt.Errorf("%w; chat fallback: %w", responsesErr, fallbackErr)
					observability.WithRequest(ctx).Warn("ai_responses_chat_fallback_failed",
						slog.Uint64("model_config_id", uint64(attempt.cfg.ID)),
						slog.String("adapter_type", attempt.adapterType),
						slog.String("request_model", attemptReq.Text.Model),
						slog.String("error", fallbackErr.Error()),
					)
				}
			}
		} else {
			resp, err = provider.TextGenerate(ctx, attemptReq.Text)
		}
		finishAttempt(err)
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			Config:         cfg,
			Provider:       attempt.adapterType,
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
			lastErr = err
			continue
		}
		estimate := estimateUsageCostWithDetails(cfg, def, "text", resp.Usage, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return TextResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return TextResponse{}, lastErr
	}
	return TextResponse{}, fmt.Errorf("no available provider variant for model config id=%d and text/reasoning capability", modelConfigID)
}

func providerBaseURLForLog(provider Provider) string {
	switch p := provider.(type) {
	case *OpenAIAdapter:
		return redactProviderBaseURL(p.BaseURL)
	default:
		return ""
	}
}

func redactProviderBaseURL(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

// CallTextStream calls a text model through a provider streaming API.
// Usage is logged after the provider closes the stream. If the provider does
// not report usage in the stream, the gateway still emits chunks but records
// zero token usage.
func (s *AIService) CallTextStream(ctx context.Context, userID, modelConfigID uint, req TextRequest) (<-chan TextStreamEvent, error) {
	return s.CallTextStreamWithUsage(ctx, userID, modelConfigID, req, UsageContext{})
}

func (s *AIService) CallTextStreamWithUsage(ctx context.Context, userID, modelConfigID uint, req TextRequest, usage UsageContext) (<-chan TextStreamEvent, error) {
	candidates, err := s.runtimeTextModelCandidates(modelConfigID)
	if err != nil {
		return nil, err
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, "text_reasoning"), candidates)
	var (
		upstream        <-chan TextStreamEvent
		attemptConfig   persistencemodel.AIModelConfig
		attemptDef      *ModelDef
		attemptFinish   func(error)
		attemptReq      TextRequest
		attemptStart    time.Time
		attemptProvider string
		lastErr         error
	)
	for _, attempt := range attempts {
		capability := attempt.capability
		if capability == "" {
			capability = CapabilityText
		}
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, capability)
		if err != nil {
			lastErr = err
			continue
		}
		streamer, ok := provider.(TextStreamProvider)
		if !ok {
			lastErr = fmt.Errorf("streaming is not supported by provider for model config %d", attempt.cfg.ID)
			continue
		}
		attemptReq = req
		attemptReq.Model = resolveModelID(cfg, def)
		attemptReq.IsReasoning = attemptReq.IsReasoning || modelHasCapability(def, CapabilityReasoning)
		attachTextPromptDebug(ctx, attemptReq)
		if usage.ReservationID == nil {
			estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(attemptReq), maxPositive(attemptReq.MaxTokens, 1024), 0, 1)
			reservation, err := s.ReserveUsage(ctx, userID, attempt.cfg.ID, estimate, usage)
			if err != nil {
				return nil, err
			}
			usage.ReservationID = &reservation.ID
		}
		finishAttempt := beginRuntimeProviderAttempt(attempt.cfg.ID)
		start := time.Now()
		upstream, err = streamer.TextStream(ctx, attemptReq)
		if err != nil {
			finishAttempt(err)
			s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
				UserID:         userID,
				Usage:          usage,
				Config:         cfg,
				Provider:       attempt.adapterType,
				OperationType:  "text_stream",
				PromptName:     attemptReq.PromptName,
				RequestModel:   attemptReq.Model,
				ResponseModel:  attemptReq.Model,
				RequestPayload: attemptReq,
				Start:          start,
				Err:            err,
			})
			lastErr = err
			continue
		}
		attemptConfig = cfg
		attemptDef = def
		attemptFinish = finishAttempt
		attemptStart = start
		attemptProvider = attempt.adapterType
		break
	}
	if upstream == nil {
		if lastErr != nil {
			_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
			return nil, lastErr
		}
		return nil, fmt.Errorf("no available provider variant for model config id=%d and text/reasoning capability", modelConfigID)
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
		attemptFinish(streamErr)
		resp := TextResponse{Content: content.String(), FinishReason: finishReason, Usage: tokenUsage}
		s.logLLMCall(context.WithoutCancel(ctx), llmCallLogInput{
			UserID:         userID,
			Usage:          usage,
			Config:         attemptConfig,
			Provider:       attemptProvider,
			OperationType:  "text_stream",
			PromptName:     attemptReq.PromptName,
			RequestModel:   attemptReq.Model,
			ResponseModel:  attemptReq.Model,
			RequestPayload: attemptReq,
			Response:       &resp,
			Start:          attemptStart,
			Err:            streamErr,
		})
		estimate := estimateUsageCostWithDetails(attemptConfig, attemptDef, "text", tokenUsage, 0, 1)
		_ = s.settleUsage(context.Background(), userID, attemptConfig.ID, estimate, usage)
	}()
	return out, nil
}
