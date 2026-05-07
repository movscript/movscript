package ai

import (
	"context"
	"fmt"
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
	cfg, provider, def, err := s.loadConfig(modelConfigID, "text")
	if err != nil {
		return TextResponse{}, err
	}
	req.Model = resolveModelID(cfg, def)
	attachTextPromptDebug(ctx, req)
	if usage.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(req), maxPositive(req.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, modelConfigID, estimate, usage)
		if err != nil {
			return TextResponse{}, err
		}
		usage.ReservationID = &reservation.ID
	}
	resp, err := provider.TextGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return TextResponse{}, err
	}
	estimate := estimateUsageCost(cfg, def, "text", resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1)
	if err := s.settleUsage(ctx, userID, modelConfigID, estimate, usage); err != nil {
		return TextResponse{}, err
	}
	return resp, nil
}

// CallTextStream calls a text model through a provider streaming API.
// Usage is logged after the provider closes the stream. If the provider does
// not report usage in the stream, the gateway still emits chunks but records
// zero token usage.
func (s *AIService) CallTextStream(ctx context.Context, userID, modelConfigID uint, req TextRequest) (<-chan TextStreamEvent, error) {
	return s.CallTextStreamWithUsage(ctx, userID, modelConfigID, req, UsageContext{})
}

func (s *AIService) CallTextStreamWithUsage(ctx context.Context, userID, modelConfigID uint, req TextRequest, usage UsageContext) (<-chan TextStreamEvent, error) {
	cfg, provider, def, err := s.loadConfig(modelConfigID, "text")
	if err != nil {
		return nil, err
	}
	streamer, ok := provider.(TextStreamProvider)
	if !ok {
		return nil, fmt.Errorf("streaming is not supported by provider for model config %d", modelConfigID)
	}
	req.Model = resolveModelID(cfg, def)
	attachTextPromptDebug(ctx, req)
	if usage.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(req), maxPositive(req.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveUsage(ctx, userID, modelConfigID, estimate, usage)
		if err != nil {
			return nil, err
		}
		usage.ReservationID = &reservation.ID
	}
	upstream, err := streamer.TextStream(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(usage.ReservationID), err.Error())
		return nil, err
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		var tokenUsage TokenUsage
		for event := range upstream {
			if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
				tokenUsage = event.Usage
			}
			out <- event
		}
		estimate := estimateUsageCost(cfg, def, "text", tokenUsage.InputTokens, tokenUsage.OutputTokens, 0, 1)
		_ = s.settleUsage(context.Background(), userID, modelConfigID, estimate, usage)
	}()
	return out, nil
}
