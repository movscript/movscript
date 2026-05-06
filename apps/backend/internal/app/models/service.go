package models

import (
	"context"

	"github.com/movscript/movscript/internal/infra/ai"
)

type Service struct {
	ai *ai.AIService
}

func NewService(aiService *ai.AIService) *Service {
	return &Service{ai: aiService}
}

func (s *Service) ListForFeature(_ context.Context, featureKey string) ([]ai.PublicModel, error) {
	return s.ai.GetModelsForFeature(featureKey)
}

func (s *Service) ListByCapability(_ context.Context, capability string) ([]ai.PublicModel, error) {
	return s.ai.GetModelsByCapability(capability)
}
