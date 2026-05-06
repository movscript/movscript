package models

import (
	"context"
	"time"

	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
)

type Service struct {
	ai    *ai.AIService
	cache cache.Cache
}

const modelsCacheTTL = 5 * time.Minute

func NewService(aiService *ai.AIService, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{ai: aiService, cache: c}
}

func (s *Service) ListForFeature(ctx context.Context, featureKey string) ([]ai.PublicModel, error) {
	key := "models:feature:" + featureKey
	var cached []ai.PublicModel
	if ok, err := s.cache.GetJSON(ctx, key, &cached); err == nil && ok {
		return cached, nil
	}
	models, err := s.ai.GetModelsForFeature(featureKey)
	if err != nil {
		return nil, err
	}
	_ = s.cache.SetJSON(ctx, key, models, modelsCacheTTL)
	return models, nil
}

func (s *Service) ListByCapability(ctx context.Context, capability string) ([]ai.PublicModel, error) {
	key := "models:capability:" + capability
	var cached []ai.PublicModel
	if ok, err := s.cache.GetJSON(ctx, key, &cached); err == nil && ok {
		return cached, nil
	}
	models, err := s.ai.GetModelsByCapability(capability)
	if err != nil {
		return nil, err
	}
	_ = s.cache.SetJSON(ctx, key, models, modelsCacheTTL)
	return models, nil
}
