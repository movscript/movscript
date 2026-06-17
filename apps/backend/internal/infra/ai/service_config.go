package ai

import (
	"context"
	"errors"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"strings"
	"sync"
	"time"
)

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

func (s *AIService) loadTextConfig(modelConfigID uint) (persistencemodel.AIModelConfig, Provider, *ModelDef, string, error) {
	var lastErr error
	for _, cap := range textRuntimeCapabilities() {
		cfg, provider, def, err := s.loadConfig(modelConfigID, cap)
		if err == nil {
			return cfg, provider, def, cap, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return persistencemodel.AIModelConfig{}, nil, nil, "", lastErr
	}
	return persistencemodel.AIModelConfig{}, nil, nil, "", fmt.Errorf("no text runtime capability requested")
}

// ResolveRuntimeModelConfig expands a public logical model ID into the concrete
// provider-backed model config to use for this request.
func (s *AIService) ResolveRuntimeModelConfig(modelConfigID uint, requiredCap string) (uint, error) {
	chosen, _, err := s.resolveRuntimeModelCandidate(modelConfigID, requiredCap, nil)
	if err != nil {
		return 0, err
	}
	return chosen.cfg.ID, nil
}

func (s *AIService) resolveRuntimeModelCandidate(modelConfigID uint, requiredCap string, preferredAdapterTypes []string) (runtimeModelCandidate, bool, error) {
	candidates, err := s.runtimeModelCandidates(modelConfigID, requiredCap)
	if err != nil {
		return runtimeModelCandidate{}, false, err
	}
	if len(candidates) == 0 {
		return runtimeModelCandidate{}, false, fmt.Errorf("no available provider variant for model config id=%d and capability %s", modelConfigID, requiredCap)
	}
	candidates, preferred := filterPreferredRuntimeCandidates(candidates, preferredAdapterTypes)
	ordered := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, requiredCap), candidates)
	return ordered[0], preferred, nil
}

func (s *AIService) ResolveRuntimeTextModel(modelConfigID uint) (uint, error) {
	return s.resolveRuntimeModelAnyCapability(modelConfigID, textRuntimeCapabilities())
}

func (s *AIService) ResolveRuntimeGenerationModel(modelConfigID uint, outputType string) (uint, error) {
	switch outputType {
	case CapabilityImage, CapabilityImageEdit:
		return s.resolveRuntimeModelAnyCapability(modelConfigID, []string{outputType})
	case CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
		return s.resolveRuntimeModelAnyCapability(modelConfigID, []string{outputType})
	case CapabilityAudioTTS, CapabilityAudioSTT, CapabilityAudioMusic, CapabilityAudioSFX, CapabilitySubAlign, CapabilitySubTranslate:
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
	capability  string
}

type ModelRouteRequest struct {
	ModelID               string
	ModelConfigID         uint
	CatalogEntryID        uint
	Capability            string
	RouteGroup            string
	PreferredAdapterTypes []string
	EstimatedUsage        UsageEstimate
	MaxEstimatedCost      float64
}

type ModelRoute struct {
	ModelID         string
	ModelConfigID   uint // resolved compatibility route id for legacy clients
	CatalogEntryID  uint
	CredentialID    uint
	SourceType      string
	RouteGroup      string
	ProviderModelID string
	SelectionReason string
	EstimatedCost   float64
}

type ModelRoutePlan struct {
	ModelID         string
	Capability      string
	Routes          []ModelRoute
	SelectionReason string
}

type OpenAIProxyTarget struct {
	ModelConfigID   uint
	ProviderModelID string
	BaseURL         string
	APIKey          string
}

func (s *AIService) OpenAIProxyTarget(ctx context.Context, userID uint, modelConfigID uint) (OpenAIProxyTarget, error) {
	var lastErr error
	for _, capability := range textRuntimeCapabilities() {
		target, err := s.OpenAIProxyTargetForCapability(ctx, userID, modelConfigID, capability)
		if err == nil {
			return target, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return OpenAIProxyTarget{}, lastErr
	}
	return OpenAIProxyTarget{}, fmt.Errorf("no text runtime capability requested")
}

func (s *AIService) OpenAIProxyTargetForCapability(ctx context.Context, userID uint, modelConfigID uint, requiredCap string) (OpenAIProxyTarget, error) {
	ctx = withProviderUserID(ctx, userID)
	cfg, provider, def, err := s.loadConfig(modelConfigID, requiredCap)
	if err != nil {
		return OpenAIProxyTarget{}, err
	}
	baseURL := ""
	apiKey := ""
	switch adapter := provider.(type) {
	case *OpenAIAdapter:
		baseURL = adapter.BaseURL
		apiKey = adapter.APIKey
	case interface {
		ProxyTarget(context.Context) (string, string, error)
	}:
		baseURL, apiKey, err = adapter.ProxyTarget(ctx)
		if err != nil {
			return OpenAIProxyTarget{}, err
		}
	default:
		return OpenAIProxyTarget{}, fmt.Errorf("model config id=%d is not backed by an OpenAI-compatible provider", modelConfigID)
	}
	return OpenAIProxyTarget{
		ModelConfigID:   cfg.ID,
		ProviderModelID: resolveModelID(cfg, def),
		BaseURL:         baseURL,
		APIKey:          apiKey,
	}, nil
}

func (s *AIService) OpenAIProxyTargetForRoute(ctx context.Context, userID uint, route ModelRoute, requiredCap string) (OpenAIProxyTarget, error) {
	if strings.TrimSpace(route.RouteGroup) != "" {
		ctx = WithProviderRouteGroup(ctx, strings.TrimSpace(route.RouteGroup))
	}
	if target, handled, err := s.editionOpenAIProxyTargetForCatalogRoute(ctx, userID, route, requiredCap); handled || err != nil {
		if err != nil {
			return OpenAIProxyTarget{}, err
		}
		return target, nil
	}
	return s.OpenAIProxyTargetForCapability(ctx, userID, route.ModelConfigID, requiredCap)
}

func (s *AIService) ResolveModelRoute(req ModelRouteRequest) (ModelRoute, error) {
	plan, err := s.ResolveModelRoutePlan(req)
	if err != nil {
		return ModelRoute{}, err
	}
	if len(plan.Routes) == 0 {
		return ModelRoute{}, fmt.Errorf("no available provider route for capability %s", plan.Capability)
	}
	return plan.Routes[0], nil
}

func (s *AIService) ResolveModelRoutePlan(req ModelRouteRequest) (ModelRoutePlan, error) {
	capability := strings.TrimSpace(req.Capability)
	if capability == "" {
		return ModelRoutePlan{}, fmt.Errorf("model capability is required")
	}
	modelID := strings.TrimSpace(req.ModelID)
	if modelID != "" {
		if plan, handled, err := s.resolveCatalogModelRoutePlan(req, capability, modelID); handled || err != nil {
			if err != nil {
				return ModelRoutePlan{}, err
			}
			return plan, nil
		}
		if s.editionModelCatalogOnly() {
			return ModelRoutePlan{}, fmt.Errorf("catalog model %q not found for capability %s", modelID, capability)
		}
		candidates, err := s.runtimeModelCandidatesByModelID(modelID, capability)
		if err != nil {
			return ModelRoutePlan{}, err
		}
		if len(candidates) == 0 {
			return ModelRoutePlan{}, fmt.Errorf("model %q not found for capability %s", modelID, capability)
		}
		candidates, preferred := filterPreferredRuntimeCandidates(candidates, req.PreferredAdapterTypes)
		candidates, budgetAware, err := filterBudgetRuntimeCandidates(candidates, capability, req.EstimatedUsage, req.MaxEstimatedCost)
		if err != nil {
			return ModelRoutePlan{}, err
		}
		ordered := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, capability), candidates)
		selectionReason := modelIDRouteSelectionReason(preferred, budgetAware)
		return ModelRoutePlan{
			ModelID:         ordered[0].logicalID,
			Capability:      capability,
			Routes:          modelRoutesFromCandidates(ordered, capability, req.EstimatedUsage, selectionReason),
			SelectionReason: selectionReason,
		}, nil
	}
	if req.ModelConfigID == 0 && req.CatalogEntryID == 0 {
		return ModelRoutePlan{}, fmt.Errorf("model_id is required")
	}
	if plan, handled, err := s.resolveCatalogModelRoutePlan(req, capability, ""); handled || err != nil {
		if err != nil {
			return ModelRoutePlan{}, err
		}
		return plan, nil
	}
	if req.CatalogEntryID != 0 {
		return ModelRoutePlan{}, fmt.Errorf("catalog entry id=%d not found for capability %s", req.CatalogEntryID, capability)
	}
	if s.editionModelCatalogOnly() {
		return ModelRoutePlan{}, fmt.Errorf("catalog_entry_id is required for catalog-only routing")
	}
	candidates, err := s.runtimeModelCandidates(req.ModelConfigID, capability)
	if err != nil {
		return ModelRoutePlan{}, err
	}
	if len(candidates) == 0 {
		return ModelRoutePlan{}, fmt.Errorf("no available provider variant for model config id=%d and capability %s", req.ModelConfigID, capability)
	}
	candidates, preferred := filterPreferredRuntimeCandidates(candidates, req.PreferredAdapterTypes)
	candidates, budgetAware, err := filterBudgetRuntimeCandidates(candidates, capability, req.EstimatedUsage, req.MaxEstimatedCost)
	if err != nil {
		return ModelRoutePlan{}, err
	}
	ordered := runtimeModelAttemptOrder(runtimeModelRoundRobinKey(candidates[0].logicalID, capability), candidates)
	selectionReason := localProviderRouteSelectionReason(preferred, budgetAware)
	return ModelRoutePlan{
		ModelID:         ordered[0].logicalID,
		Capability:      capability,
		Routes:          modelRoutesFromCandidates(ordered, capability, req.EstimatedUsage, selectionReason),
		SelectionReason: selectionReason,
	}, nil
}

func modelRoutesFromCandidates(candidates []runtimeModelCandidate, capability string, estimate UsageEstimate, selectionReason string) []ModelRoute {
	routes := make([]ModelRoute, 0, len(candidates))
	for i, candidate := range candidates {
		def := resolveDefFromConfig(candidate.cfg, candidate.adapterType)
		reason := selectionReason
		if i > 0 {
			reason = "fallback_candidate"
		}
		routes = append(routes, ModelRoute{
			ModelID:         candidate.logicalID,
			ModelConfigID:   candidate.cfg.ID,
			SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
			ProviderModelID: resolveModelID(candidate.cfg, def),
			SelectionReason: reason,
			EstimatedCost:   estimatedRuntimeCandidateCost(candidate, capability, estimate),
		})
	}
	return routes
}

func (s *AIService) ResolveTextModelRoute(modelID string) (ModelRoute, error) {
	var lastErr error
	for _, cap := range textRuntimeCapabilities() {
		route, err := s.ResolveModelRoute(ModelRouteRequest{ModelID: modelID, Capability: cap})
		if err == nil {
			return route, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return ModelRoute{}, lastErr
	}
	return ModelRoute{}, fmt.Errorf("no text runtime capability requested")
}

func (s *AIService) ResolveGenerationModelRoute(modelID string, outputType string) (ModelRoute, error) {
	switch outputType {
	case CapabilityImage, CapabilityImageEdit, CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V,
		CapabilityAudioTTS, CapabilityAudioSTT, CapabilityAudioMusic, CapabilityAudioSFX,
		CapabilitySubAlign, CapabilitySubTranslate:
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
		return []runtimeModelCandidate{{cfg: base.AIModelConfig, adapterType: base.AdapterType, logicalID: fmt.Sprintf("config:%d", base.ID), priority: base.Priority, capability: requiredCap}}, nil
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
		candidates = append(candidates, runtimeModelCandidate{cfg: row.AIModelConfig, adapterType: row.AdapterType, logicalID: logicalID, priority: row.Priority, capability: requiredCap})
	}
	return candidates, nil
}

func (s *AIService) runtimeTextModelCandidates(modelConfigID uint) ([]runtimeModelCandidate, error) {
	var (
		out     []runtimeModelCandidate
		lastErr error
	)
	seen := map[uint]bool{}
	for _, cap := range textRuntimeCapabilities() {
		candidates, err := s.runtimeModelCandidates(modelConfigID, cap)
		if err != nil {
			lastErr = err
			continue
		}
		for _, candidate := range candidates {
			if seen[candidate.cfg.ID] {
				continue
			}
			seen[candidate.cfg.ID] = true
			candidate.capability = cap
			out = append(out, candidate)
		}
	}
	if len(out) > 0 {
		return out, nil
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no available provider variant for model config id=%d and text/reasoning capability", modelConfigID)
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
				capability:  requiredCap,
			})
		}
	}
	return candidates, nil
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
	ModelConfigID       uint       `json:"-"`
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
