package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

// CallForFeature is the business-layer entry point for text-based features.
// It resolves feature -> model config -> provider, applies the feature's system
// prompt (with optional DB override), and handles reasoning-model formatting.
func (s *AIService) CallForFeature(ctx context.Context, userID uint, featureKey string, userMsg string) (TextResponse, error) {
	def := GetFeatureDef(featureKey)
	sysPrompt := ""
	maxTokens := 0
	temp := float32(-1)
	if def != nil {
		sysPrompt = def.SystemPrompt
		maxTokens = def.MaxTokens
		temp = def.Temperature
	}

	var fcfg persistencemodel.FeatureConfig
	if err := s.db.Where("feature_key = ?", featureKey).First(&fcfg).Error; err == nil {
		if fcfg.SystemPromptOverride != "" {
			sysPrompt = fcfg.SystemPromptOverride
		}
		if fcfg.MaxTokensOverride > 0 {
			maxTokens = fcfg.MaxTokensOverride
		}
	}

	modelConfigID, _, err := s.GetForFeature(featureKey)
	if err != nil {
		return TextResponse{}, err
	}

	var mcfg persistencemodel.AIModelConfig
	if err := s.db.First(&mcfg, modelConfigID).Error; err != nil {
		return TextResponse{}, fmt.Errorf("model config %d not found", modelConfigID)
	}
	var cred persistencemodel.AICredential
	s.db.First(&cred, mcfg.CredentialID)
	mdef := resolveDefFromConfig(mcfg, cred.AdapterType)
	isReasoning := false
	for _, cap := range mdef.Capabilities {
		if cap == CapabilityReasoning {
			isReasoning = true
			break
		}
	}

	prompt := BuildFeaturePrompt(featureKey, sysPrompt, userMsg, def != nil && def.OutputSchema != "", maxTokens, temp, isReasoning)
	return s.CallText(ctx, userID, modelConfigID, TextRequest{
		PromptName:  prompt.Name,
		Messages:    prompt.Messages,
		MaxTokens:   prompt.MaxTokens,
		Temperature: prompt.Temperature,
		IsReasoning: isReasoning,
		JSONMode:    prompt.JSONMode,
	})
}

// CallText calls a text generation model by AIModelConfig DB ID.
func (s *AIService) CallText(ctx context.Context, userID, modelConfigID uint, req TextRequest) (TextResponse, error) {
	return s.CallTextWithUsage(ctx, userID, modelConfigID, req, UsageContext{})
}

func (s *AIService) CallTextWithUsage(ctx context.Context, userID, modelConfigID uint, req TextRequest, usage UsageContext) (TextResponse, error) {
	candidates, err := s.runtimeModelCandidates(modelConfigID, CapabilityText)
	if err != nil {
		return TextResponse{}, err
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, CapabilityText), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, CapabilityText)
		if err != nil {
			lastErr = err
			continue
		}
		attemptReq := req
		attemptReq.Model = resolveModelID(cfg, def)
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
		estimate := estimateUsageCost(cfg, def, "text", resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return TextResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return TextResponse{}, lastErr
	}
	return TextResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityText)
}

func (s *AIService) CallResponsesWithUsage(ctx context.Context, userID, modelConfigID uint, req ResponsesRequest, usage UsageContext) (TextResponse, error) {
	candidates, err := s.runtimeModelCandidates(modelConfigID, CapabilityText)
	if err != nil {
		return TextResponse{}, err
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, CapabilityText), candidates)
	var lastErr error
	for _, attempt := range attempts {
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, CapabilityText)
		if err != nil {
			lastErr = err
			continue
		}
		attemptReq := req
		attemptReq.Text.Model = resolveModelID(cfg, def)
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
		if ok {
			resp, err = responder.ResponsesGenerate(ctx, attemptReq)
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
		estimate := estimateUsageCost(cfg, def, "text", resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1)
		if err := s.settleUsage(ctx, userID, attempt.cfg.ID, estimate, usage); err != nil {
			return TextResponse{}, err
		}
		return resp, nil
	}
	if lastErr != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), lastErr.Error())
		return TextResponse{}, lastErr
	}
	return TextResponse{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityText)
}

// CallTextStream calls a text model through a provider streaming API.
// Usage is logged after the provider closes the stream. If the provider does
// not report usage in the stream, the gateway still emits chunks but records
// zero token usage.
func (s *AIService) CallTextStream(ctx context.Context, userID, modelConfigID uint, req TextRequest) (<-chan TextStreamEvent, error) {
	return s.CallTextStreamWithUsage(ctx, userID, modelConfigID, req, UsageContext{})
}

func (s *AIService) CallTextStreamWithUsage(ctx context.Context, userID, modelConfigID uint, req TextRequest, usage UsageContext) (<-chan TextStreamEvent, error) {
	candidates, err := s.runtimeModelCandidates(modelConfigID, CapabilityText)
	if err != nil {
		return nil, err
	}
	attempts := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, CapabilityText), candidates)
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
		cfg, provider, def, err := s.loadConfig(attempt.cfg.ID, CapabilityText)
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
		return nil, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, CapabilityText)
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		var tokenUsage TokenUsage
		var streamErr error
		var content strings.Builder
		finishReason := ""
		for event := range upstream {
			if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
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
		estimate := estimateUsageCost(attemptConfig, attemptDef, "text", tokenUsage.InputTokens, tokenUsage.OutputTokens, 0, 1)
		_ = s.settleUsage(context.Background(), userID, attemptConfig.ID, estimate, usage)
	}()
	return out, nil
}
