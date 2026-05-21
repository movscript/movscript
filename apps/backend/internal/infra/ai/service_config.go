package ai

import (
	"errors"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var priorityRoundRobinCounters sync.Map
var runtimeProviderHealth sync.Map

const runtimeProviderFailureCooldown = 30 * time.Second

func (s *AIService) loadConfig(modelConfigID uint, requiredCap string) (persistencemodel.AIModelConfig, Provider, *ModelDef, error) {
	var cfg persistencemodel.AIModelConfig
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
	ordered := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, requiredCap), candidates)
	chosen := ordered[0]
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
	cfg         persistencemodel.AIModelConfig
	adapterType string
	logicalID   string
	priority    int
}

type ModelRouteRequest struct {
	ModelID       string
	ModelConfigID uint
	Capability    string
}

type ModelRoute struct {
	ModelID         string
	ModelConfigID   uint
	ProviderModelID string
	SelectionReason string
}

type OpenAIProxyTarget struct {
	ModelConfigID   uint
	ProviderModelID string
	BaseURL         string
	APIKey          string
}

func (s *AIService) OpenAIProxyTarget(modelConfigID uint) (OpenAIProxyTarget, error) {
	cfg, provider, def, err := s.loadConfig(modelConfigID, CapabilityText)
	if err != nil {
		return OpenAIProxyTarget{}, err
	}
	adapter, ok := provider.(*OpenAIAdapter)
	if !ok {
		return OpenAIProxyTarget{}, fmt.Errorf("model config id=%d is not backed by an OpenAI-compatible provider", modelConfigID)
	}
	return OpenAIProxyTarget{
		ModelConfigID:   cfg.ID,
		ProviderModelID: resolveModelID(cfg, def),
		BaseURL:         adapter.BaseURL,
		APIKey:          adapter.APIKey,
	}, nil
}

func (s *AIService) ResolveModelRoute(req ModelRouteRequest) (ModelRoute, error) {
	capability := strings.TrimSpace(req.Capability)
	if capability == "" {
		return ModelRoute{}, fmt.Errorf("model capability is required")
	}
	modelID := strings.TrimSpace(req.ModelID)
	if modelID != "" {
		candidates, err := s.runtimeModelCandidatesByModelID(modelID, capability)
		if err != nil {
			return ModelRoute{}, err
		}
		if len(candidates) == 0 {
			return ModelRoute{}, fmt.Errorf("model %q not found for capability %s", modelID, capability)
		}
		ordered := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, capability), candidates)
		chosen := ordered[0]
		def := resolveDefFromConfig(chosen.cfg, chosen.adapterType)
		return ModelRoute{
			ModelID:         candidates[0].logicalID,
			ModelConfigID:   chosen.cfg.ID,
			ProviderModelID: resolveModelID(chosen.cfg, def),
			SelectionReason: "model_id_capacity_round_robin",
		}, nil
	}
	if req.ModelConfigID == 0 {
		return ModelRoute{}, fmt.Errorf("model_id is required")
	}
	runtimeID, err := s.ResolveRuntimeModelConfig(req.ModelConfigID, capability)
	if err != nil {
		return ModelRoute{}, err
	}
	cfg, _, def, err := s.loadConfig(runtimeID, capability)
	if err != nil {
		return ModelRoute{}, err
	}
	return ModelRoute{
		ModelID:         logicalModelID(cfg, def),
		ModelConfigID:   runtimeID,
		ProviderModelID: resolveModelID(cfg, def),
		SelectionReason: "legacy_model_config_id",
	}, nil
}

func (s *AIService) ResolveTextModelRoute(modelID string) (ModelRoute, error) {
	return s.ResolveModelRoute(ModelRouteRequest{ModelID: modelID, Capability: CapabilityText})
}

func (s *AIService) ResolveGenerationModelRoute(modelID string, outputType string) (ModelRoute, error) {
	switch outputType {
	case CapabilityImage, CapabilityImageEdit, CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
		return s.ResolveModelRoute(ModelRouteRequest{ModelID: modelID, Capability: outputType})
	default:
		return ModelRoute{}, fmt.Errorf("unsupported runtime output type %q", outputType)
	}
}

func (s *AIService) runtimeModelCandidates(modelConfigID uint, requiredCap string) ([]runtimeModelCandidate, error) {
	var base modelConfigWithProvider
	if err := s.db.Model(&persistencemodel.AIModelConfig{}).
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
		return []runtimeModelCandidate{{cfg: base.AIModelConfig, adapterType: base.AdapterType, logicalID: fmt.Sprintf("config:%d", base.ID), priority: base.Priority}}, nil
	}

	var rows []modelConfigWithProvider
	if err := s.db.Model(&persistencemodel.AIModelConfig{}).
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
		candidates = append(candidates, runtimeModelCandidate{cfg: row.AIModelConfig, adapterType: row.AdapterType, logicalID: logicalID, priority: row.Priority})
	}
	return candidates, nil
}

func (s *AIService) runtimeModelCandidatesByModelID(modelID, requiredCap string) ([]runtimeModelCandidate, error) {
	requested := strings.TrimSpace(modelID)
	if requested == "" {
		return nil, fmt.Errorf("model_id is required")
	}
	var rows []modelConfigWithProvider
	if err := s.db.Model(&persistencemodel.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.is_enabled = true AND ai_model_configs.deleted_at IS NULL AND ai_credentials.is_enabled = true AND ai_credentials.deleted_at IS NULL").
		Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	type rowDef struct {
		row modelConfigWithProvider
		def *ModelDef
	}
	rowDefs := make([]rowDef, 0, len(rows))
	matchedLogicalIDs := map[string]bool{}
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		rowDefs = append(rowDefs, rowDef{row: row, def: def})
		if !modelHasCapability(def, requiredCap) || !modelIDMatches(row.AIModelConfig, def, requested) {
			continue
		}
		logicalID := logicalModelID(row.AIModelConfig, def)
		if logicalID == "" {
			logicalID = fmt.Sprintf("config:%d", row.ID)
		}
		matchedLogicalIDs[logicalID] = true
	}
	if len(matchedLogicalIDs) == 0 {
		return nil, nil
	}

	candidates := make([]runtimeModelCandidate, 0)
	for _, item := range rowDefs {
		if !modelHasCapability(item.def, requiredCap) {
			continue
		}
		logicalID := logicalModelID(item.row.AIModelConfig, item.def)
		if logicalID == "" {
			logicalID = fmt.Sprintf("config:%d", item.row.ID)
		}
		if matchedLogicalIDs[logicalID] {
			candidates = append(candidates, runtimeModelCandidate{
				cfg:         item.row.AIModelConfig,
				adapterType: item.row.AdapterType,
				logicalID:   logicalID,
				priority:    item.row.Priority,
			})
		}
	}
	return candidates, nil
}

func runtimeModelRoundRobinKey(logicalID, capability string) string {
	return "service.runtime_model:" + capability + ":" + logicalID
}

func runtimeModelAttemptOrder(key string, candidates []runtimeModelCandidate) []runtimeModelCandidate {
	if len(candidates) <= 1 {
		return append([]runtimeModelCandidate(nil), candidates...)
	}
	byPriority := map[int][]runtimeModelCandidate{}
	var priorities []int
	for _, candidate := range candidates {
		if _, ok := byPriority[candidate.priority]; !ok {
			priorities = append(priorities, candidate.priority)
		}
		byPriority[candidate.priority] = append(byPriority[candidate.priority], candidate)
	}
	sort.Slice(priorities, func(i, j int) bool { return priorities[i] > priorities[j] })
	ordered := make([]runtimeModelCandidate, 0, len(candidates))
	for _, priority := range priorities {
		group := byPriority[priority]
		if len(group) > 1 {
			weighted := weightedRuntimeCandidateGroup(group)
			counterAny, _ := priorityRoundRobinCounters.LoadOrStore(key+":attempts:"+fmt.Sprint(priority), new(uint64))
			counter := counterAny.(*uint64)
			offset := int((atomic.AddUint64(counter, 1) - 1) % uint64(len(weighted)))
			group = dedupeRuntimeCandidateGroup(append(append([]runtimeModelCandidate(nil), weighted[offset:]...), weighted[:offset]...))
			sort.SliceStable(group, func(i, j int) bool {
				left := runtimeProviderHealthSnapshot(group[i].cfg.ID)
				right := runtimeProviderHealthSnapshot(group[j].cfg.ID)
				if leftSaturated, rightSaturated := runtimeCandidateSaturated(group[i], left), runtimeCandidateSaturated(group[j], right); leftSaturated != rightSaturated {
					return !leftSaturated
				}
				if left.open != right.open {
					return !left.open
				}
				if left.inFlight != right.inFlight {
					return left.inFlight < right.inFlight
				}
				if left.failureRate != right.failureRate {
					return left.failureRate < right.failureRate
				}
				return false
			})
		}
		ordered = append(ordered, group...)
	}
	return ordered
}

func weightedRuntimeCandidateGroup(group []runtimeModelCandidate) []runtimeModelCandidate {
	weighted := make([]runtimeModelCandidate, 0, len(group))
	for _, candidate := range group {
		for range runtimeCandidateCapacityWeight(candidate) {
			weighted = append(weighted, candidate)
		}
	}
	return weighted
}

func dedupeRuntimeCandidateGroup(group []runtimeModelCandidate) []runtimeModelCandidate {
	seen := make(map[uint]bool, len(group))
	out := make([]runtimeModelCandidate, 0, len(group))
	for _, candidate := range group {
		if seen[candidate.cfg.ID] {
			continue
		}
		seen[candidate.cfg.ID] = true
		out = append(out, candidate)
	}
	return out
}

func runtimeCandidateCapacityWeight(candidate runtimeModelCandidate) int {
	if candidate.cfg.CapacityWeight > 0 {
		return candidate.cfg.CapacityWeight
	}
	return 1
}

func runtimeCandidateSaturated(candidate runtimeModelCandidate, view runtimeProviderHealthView) bool {
	return candidate.cfg.MaxConcurrency > 0 && view.inFlight >= candidate.cfg.MaxConcurrency
}

type runtimeProviderHealthState struct {
	mu                  sync.Mutex
	inFlight            int
	successes           uint64
	failures            uint64
	consecutiveFailures uint64
	openUntil           time.Time
}

type runtimeProviderHealthView struct {
	open                bool
	inFlight            int
	successes           uint64
	failures            uint64
	consecutiveFailures uint64
	failureRate         float64
	openUntil           *time.Time
}

func runtimeProviderHealthFor(modelConfigID uint) *runtimeProviderHealthState {
	value, _ := runtimeProviderHealth.LoadOrStore(modelConfigID, &runtimeProviderHealthState{})
	return value.(*runtimeProviderHealthState)
}

func runtimeProviderHealthSnapshot(modelConfigID uint) runtimeProviderHealthView {
	state := runtimeProviderHealthFor(modelConfigID)
	state.mu.Lock()
	defer state.mu.Unlock()
	total := state.successes + state.failures
	failureRate := 0.0
	if total > 0 {
		failureRate = float64(state.failures) / float64(total)
	}
	return runtimeProviderHealthView{
		open:                time.Now().Before(state.openUntil),
		inFlight:            state.inFlight,
		successes:           state.successes,
		failures:            state.failures,
		consecutiveFailures: state.consecutiveFailures,
		failureRate:         failureRate,
		openUntil:           timePtrIfSet(state.openUntil),
	}
}

func beginRuntimeProviderAttempt(modelConfigID uint) func(error) {
	state := runtimeProviderHealthFor(modelConfigID)
	state.mu.Lock()
	state.inFlight++
	state.mu.Unlock()
	return func(err error) {
		state.mu.Lock()
		defer state.mu.Unlock()
		if state.inFlight > 0 {
			state.inFlight--
		}
		if err != nil {
			state.failures++
			state.consecutiveFailures++
			state.openUntil = time.Now().Add(runtimeProviderFailureCooldown)
			return
		}
		state.successes++
		state.consecutiveFailures = 0
		state.openUntil = time.Time{}
	}
}

type RuntimeProviderHealth struct {
	ModelConfigID       uint       `json:"model_config_id"`
	ModelID             string     `json:"model_id"`
	ModelDefID          string     `json:"model_def_id"`
	ProviderName        string     `json:"provider_name"`
	AdapterType         string     `json:"adapter_type"`
	Priority            int        `json:"priority"`
	CapacityWeight      int        `json:"capacity_weight"`
	MaxConcurrency      int        `json:"max_concurrency"`
	IsEnabled           bool       `json:"is_enabled"`
	InFlight            int        `json:"in_flight"`
	Saturated           bool       `json:"saturated"`
	Successes           uint64     `json:"successes"`
	Failures            uint64     `json:"failures"`
	ConsecutiveFailures uint64     `json:"consecutive_failures"`
	FailureRate         float64    `json:"failure_rate"`
	CircuitOpen         bool       `json:"circuit_open"`
	OpenUntil           *time.Time `json:"open_until,omitempty"`
	CooldownRemainingMs int64      `json:"cooldown_remaining_ms"`
}

func RuntimeProviderHealthSnapshot(db *gorm.DB) ([]RuntimeProviderHealth, error) {
	var rows []modelConfigWithProvider
	if err := db.Model(&persistencemodel.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL").
		Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]RuntimeProviderHealth, 0, len(rows))
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		view := runtimeProviderHealthSnapshot(row.ID)
		remaining := int64(0)
		if view.openUntil != nil && view.openUntil.After(now) {
			remaining = view.openUntil.Sub(now).Milliseconds()
		}
		out = append(out, RuntimeProviderHealth{
			ModelConfigID:       row.ID,
			ModelID:             logicalModelID(row.AIModelConfig, def),
			ModelDefID:          row.ModelDefID,
			ProviderName:        row.ProviderName,
			AdapterType:         row.AdapterType,
			Priority:            row.Priority,
			CapacityWeight:      runtimeCandidateCapacityWeight(runtimeModelCandidate{cfg: row.AIModelConfig}),
			MaxConcurrency:      row.MaxConcurrency,
			IsEnabled:           row.IsEnabled,
			InFlight:            view.inFlight,
			Saturated:           runtimeCandidateSaturated(runtimeModelCandidate{cfg: row.AIModelConfig}, view),
			Successes:           view.successes,
			Failures:            view.failures,
			ConsecutiveFailures: view.consecutiveFailures,
			FailureRate:         view.failureRate,
			CircuitOpen:         view.open,
			OpenUntil:           view.openUntil,
			CooldownRemainingMs: remaining,
		})
	}
	return out, nil
}

func timePtrIfSet(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

// resolveModelID returns the effective model ID for an API call.
func resolveModelID(cfg persistencemodel.AIModelConfig, def *ModelDef) string {
	if cfg.ModelIDOverride != "" {
		return cfg.ModelIDOverride
	}
	return def.ModelID
}

// resolveDefFromConfig calls ResolveModelDef with all Custom* fields from a model config.
func resolveDefFromConfig(cfg persistencemodel.AIModelConfig, adapterType string) *ModelDef {
	return ResolveModelDef(
		cfg.ModelDefID, adapterType,
		cfg.CustomDisplayName, cfg.CustomCapabilities, cfg.CustomPricingMode,
		cfg.CustomAcceptsImage, cfg.CustomMaxInputImages, cfg.CustomMaxInputVideos,
		cfg.CustomImageEditField, cfg.CustomSupportedParams,
	)
}

// calcCost computes the credit cost for a call.
// durationSec is used for per_second; imageCount for per_image.
func calcCost(cfg persistencemodel.AIModelConfig, def *ModelDef, inputTokens, outputTokens, durationSec, imageCount int) float64 {
	switch def.PricingMode {
	case PricingPerToken:
		return float64(inputTokens)/1_000_000*cfg.CreditsInputPer1M +
			float64(outputTokens)/1_000_000*cfg.CreditsOutputPer1M
	case PricingPerImage:
		if imageCount <= 0 {
			imageCount = 1
		}
		return float64(imageCount) * cfg.CreditsPerImage
	case PricingPerSecond:
		return float64(durationSec) * cfg.CreditsPerSecond
	case PricingPerCall:
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
