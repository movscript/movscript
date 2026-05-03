package ai

import (
	"context"
	"fmt"

	"github.com/movscript/movscript/internal/model"
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

	var fcfg model.FeatureConfig
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

	var mcfg model.AIModelConfig
	if err := s.db.First(&mcfg, modelConfigID).Error; err != nil {
		return TextResponse{}, fmt.Errorf("model config %d not found", modelConfigID)
	}
	var cred model.AICredential
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
	return s.CallTextWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallTextWithBilling(ctx context.Context, userID, modelConfigID uint, req TextRequest, billing BillingContext) (TextResponse, error) {
	cfg, provider, def, err := s.loadConfig(modelConfigID, "text")
	if err != nil {
		return TextResponse{}, err
	}
	req.Model = resolveModelID(cfg, def)
	attachTextPromptDebug(ctx, req)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(req), maxPositive(req.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return TextResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := provider.TextGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return TextResponse{}, err
	}
	estimate := estimateUsageCost(cfg, def, "text", resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1)
	if err := s.settleUsage(ctx, userID, modelConfigID, estimate, billing); err != nil {
		return TextResponse{}, err
	}
	return resp, nil
}

// CallTextStream calls a text model through a provider streaming API.
// Usage is logged after the provider closes the stream. If the provider does
// not report usage in the stream, the gateway still emits chunks but records
// zero token usage.
func (s *AIService) CallTextStream(ctx context.Context, userID, modelConfigID uint, req TextRequest) (<-chan TextStreamEvent, error) {
	return s.CallTextStreamWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallTextStreamWithBilling(ctx context.Context, userID, modelConfigID uint, req TextRequest, billing BillingContext) (<-chan TextStreamEvent, error) {
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
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(req), maxPositive(req.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return nil, err
		}
		billing.ReservationID = &reservation.ID
	}
	upstream, err := streamer.TextStream(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return nil, err
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		var usage TokenUsage
		for event := range upstream {
			if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
				usage = event.Usage
			}
			out <- event
		}
		estimate := estimateUsageCost(cfg, def, "text", usage.InputTokens, usage.OutputTokens, 0, 1)
		_ = s.settleUsage(context.Background(), userID, modelConfigID, estimate, billing)
	}()
	return out, nil
}
