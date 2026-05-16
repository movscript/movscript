package catalog

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

func (s *Service) ListForFeature(ctx context.Context, featureKey string, providerVariants ...bool) ([]ai.PublicModel, error) {
	variants := len(providerVariants) > 0 && providerVariants[0]
	key := "models:feature:" + featureKey + modelsCacheVariantSuffix(variants)
	var cached []ai.PublicModel
	if ok, err := s.cache.GetJSON(ctx, key, &cached); err == nil && ok {
		return cached, nil
	}
	var models []ai.PublicModel
	var err error
	if variants {
		models, err = s.ai.GetProviderModelsForFeature(featureKey)
	} else {
		models, err = s.ai.GetModelsForFeature(featureKey)
	}
	if err != nil {
		return nil, err
	}
	_ = s.cache.SetJSON(ctx, key, models, modelsCacheTTL)
	return models, nil
}

func (s *Service) ListByCapability(ctx context.Context, capability string, providerVariants ...bool) ([]ai.PublicModel, error) {
	variants := len(providerVariants) > 0 && providerVariants[0]
	key := "models:capability:" + capability + modelsCacheVariantSuffix(variants)
	var cached []ai.PublicModel
	if ok, err := s.cache.GetJSON(ctx, key, &cached); err == nil && ok {
		return cached, nil
	}
	var models []ai.PublicModel
	var err error
	if variants {
		models, err = s.ai.GetProviderModelsByCapability(capability)
	} else {
		models, err = s.ai.GetModelsByCapability(capability)
	}
	if err != nil {
		return nil, err
	}
	_ = s.cache.SetJSON(ctx, key, models, modelsCacheTTL)
	return models, nil
}

func modelsCacheVariantSuffix(providerVariants bool) string {
	if providerVariants {
		return ":provider_variants"
	}
	return ":logical"
}
