package catalog

import (
	"context"
	"strings"
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

func (s *Service) ListByCapability(ctx context.Context, capability string, providerVariants ...bool) ([]ai.PublicModel, error) {
	variants := len(providerVariants) > 0 && providerVariants[0]
	key := "models:capability:" + capability + modelsCacheVariantSuffix(variants)
	var cached []ai.PublicModel
	if ok, err := s.cache.GetJSON(ctx, key, &cached); err == nil && ok {
		return cached, nil
	}
	var models []ai.PublicModel
	var err error
	capabilities := splitCapabilityQuery(capability)
	if len(capabilities) == 1 {
		capability = capabilities[0]
	}
	if variants {
		if len(capabilities) > 1 {
			models, err = s.ai.GetProviderModelsByAnyCapability(capabilities)
		} else {
			models, err = s.ai.GetProviderModelsByCapability(capability)
		}
	} else {
		if len(capabilities) > 1 {
			models, err = s.ai.GetModelsByAnyCapability(capabilities)
		} else {
			models, err = s.ai.GetModelsByCapability(capability)
		}
	}
	if err != nil {
		return nil, err
	}
	_ = s.cache.SetJSON(ctx, key, models, modelsCacheTTL)
	return models, nil
}

func splitCapabilityQuery(capability string) []string {
	parts := strings.Split(capability, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func modelsCacheVariantSuffix(providerVariants bool) string {
	if providerVariants {
		return ":provider_variants"
	}
	return ":logical"
}
