package ai

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
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

// ResolveRuntimeModelConfig expands a public logical model ID into the concrete
// provider-backed model config to use for this request.
func (s *AIService) ResolveRuntimeModelConfig(modelConfigID uint, requiredCap string) (uint, error) {
	candidates, err := s.runtimeModelCandidates(modelConfigID, requiredCap)
	if err != nil {
		return 0, err
	}
	if len(candidates) == 0 {
		return 0, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, requiredCap)
	}
	chosen := pickByPriority(runtimeModelRoundRobinKey(candidates[0].logicalID, requiredCap), candidates, func(c runtimeModelCandidate) int { return c.priority })
	return chosen.cfg.ID, nil
}

func (s *AIService) ResolveRuntimeTextModel(modelConfigID uint) (uint, error) {
	return s.ResolveRuntimeModelConfig(modelConfigID, CapabilityText)
}

func (s *AIService) ResolveRuntimeGenerationModel(modelConfigID uint, outputType string) (uint, error) {
	switch outputType {
	case CapabilityImage, CapabilityImageEdit:
		return s.resolveRuntimeModelAnyCapability(modelConfigID, []string{outputType})
	case CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
		return s.resolveRuntimeModelAnyCapability(modelConfigID, []string{outputType})
	default:
		return 0, fmt.Errorf("unsupported runtime output type %q", outputType)
	}
}

func (s *AIService) resolveRuntimeModelAnyCapability(modelConfigID uint, caps []string) (uint, error) {
	var lastErr error
	for _, cap := range caps {
		id, err := s.ResolveRuntimeModelConfig(modelConfigID, cap)
		if err == nil {
			return id, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return 0, lastErr
	}
	return 0, fmt.Errorf("no runtime capability requested")
}

type runtimeModelCandidate struct {
	cfg       model.AIModelConfig
	logicalID string
	priority  int
}

func (s *AIService) runtimeModelCandidates(modelConfigID uint, requiredCap string) ([]runtimeModelCandidate, error) {
	var base modelConfigWithProvider
	if err := s.db.Model(&model.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id = ? AND ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL", modelConfigID).
		First(&base).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("model config id=%d not found", modelConfigID)
		}
		return nil, err
	}
	if !base.IsEnabled {
		return nil, fmt.Errorf("model config id=%d is disabled", modelConfigID)
	}
	def := resolveDefFromConfig(base.AIModelConfig, base.AdapterType)
	if !modelHasCapability(def, requiredCap) {
		return nil, fmt.Errorf("model %q does not support %s", def.DisplayName, requiredCap)
	}
	logicalID := logicalModelID(base.AIModelConfig, def)
	if logicalID == "" {
		return []runtimeModelCandidate{{cfg: base.AIModelConfig, logicalID: fmt.Sprintf("config:%d", base.ID), priority: base.Priority}}, nil
	}

	var rows []modelConfigWithProvider
	if err := s.db.Model(&model.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.is_enabled = true AND ai_model_configs.deleted_at IS NULL AND ai_credentials.is_enabled = true AND ai_credentials.deleted_at IS NULL").
		Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	candidates := make([]runtimeModelCandidate, 0)
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		if !modelHasCapability(def, requiredCap) || logicalModelID(row.AIModelConfig, def) != logicalID {
			continue
		}
		candidates = append(candidates, runtimeModelCandidate{cfg: row.AIModelConfig, logicalID: logicalID, priority: row.Priority})
	}
	return candidates, nil
}

func runtimeModelRoundRobinKey(logicalID, capability string) string {
	return "service.runtime_model:" + capability + ":" + logicalID
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
