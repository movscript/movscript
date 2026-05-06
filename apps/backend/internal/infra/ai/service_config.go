package ai

import (
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/movscript/movscript/internal/domain/model"
)

var priorityRoundRobinCounters sync.Map

func (s *AIService) loadConfig(modelConfigID uint, requiredCap string) (model.AIModelConfig, Provider, *ModelDef, error) {
	var cfg model.AIModelConfig
	if err := s.db.First(&cfg, modelConfigID).Error; err != nil {
		return cfg, nil, nil, fmt.Errorf("model config id=%d not found", modelConfigID)
	}
	if !cfg.IsEnabled {
		return cfg, nil, nil, fmt.Errorf("model config id=%d is disabled", modelConfigID)
	}
	provider, def, err := s.registry.BuildForConfig(cfg)
	if err != nil {
		return cfg, nil, nil, err
	}
	found := false
	for _, cap := range def.Capabilities {
		if cap == requiredCap {
			found = true
			break
		}
	}
	if !found {
		return cfg, nil, nil, fmt.Errorf("model %q does not support %s", def.DisplayName, requiredCap)
	}
	return cfg, provider, def, nil
}

// resolveModelID returns the effective model ID for an API call.
func resolveModelID(cfg model.AIModelConfig, def *ModelDef) string {
	if cfg.ModelIDOverride != "" {
		return cfg.ModelIDOverride
	}
	return def.ModelID
}

// resolveDefFromConfig calls ResolveModelDef with all Custom* fields from a model config.
func resolveDefFromConfig(cfg model.AIModelConfig, adapterType string) *ModelDef {
	return ResolveModelDef(
		cfg.ModelDefID, adapterType,
		cfg.CustomDisplayName, cfg.CustomCapabilities, cfg.CustomBillingMode,
		cfg.CustomAcceptsImage, cfg.CustomMaxInputImages, cfg.CustomMaxInputVideos,
		cfg.CustomImageEditField, cfg.CustomSupportedParams,
	)
}

// calcCost computes the credit cost for a call.
// durationSec is used for per_second; imageCount for per_image.
func calcCost(cfg model.AIModelConfig, def *ModelDef, inputTokens, outputTokens, durationSec, imageCount int) float64 {
	switch def.BillingMode {
	case BillingPerToken:
		return float64(inputTokens)/1_000_000*cfg.CreditsInputPer1M +
			float64(outputTokens)/1_000_000*cfg.CreditsOutputPer1M
	case BillingPerImage:
		if imageCount <= 0 {
			imageCount = 1
		}
		return float64(imageCount) * cfg.CreditsPerImage
	case BillingPerSecond:
		return float64(durationSec) * cfg.CreditsPerSecond
	case BillingPerCall:
		return cfg.CreditsPerCall
	default:
		return 0
	}
}

// pickByPriority selects one item from a slice by priority.
// All items with the maximum priority value are collected, then one is chosen in round-robin order.
func pickByPriority[T any](key string, items []T, priority func(T) int) T {
	if len(items) == 0 {
		var zero T
		return zero
	}
	maxP := priority(items[0])
	for _, item := range items[1:] {
		if p := priority(item); p > maxP {
			maxP = p
		}
	}
	var top []T
	for _, item := range items {
		if priority(item) == maxP {
			top = append(top, item)
		}
	}
	if len(top) == 1 {
		return top[0]
	}
	counterAny, _ := priorityRoundRobinCounters.LoadOrStore(key, new(uint64))
	counter := counterAny.(*uint64)
	index := atomic.AddUint64(counter, 1) - 1
	return top[int(index%uint64(len(top)))]
}
