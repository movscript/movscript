package ai

import (
	"context"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"strings"
	"sync"
	"time"
)

var runtimeProviderHealth sync.Map

const runtimeProviderFailureCooldown = 30 * time.Second

type runtimeModelCandidate struct {
	id             uint
	logicalID      string
	priority       int
	capacityWeight int
	maxConcurrency int
	capability     string
}

type ModelRouteRequest struct {
	ModelID               string
	CatalogEntryID        uint
	RouteBindingID        uint
	Capability            string
	RouteGroup            string
	PreferredAdapterTypes []string
	EstimatedUsage        UsageEstimate
	MaxEstimatedCost      float64
}

type ModelRoute struct {
	ModelID         string
	RuntimeModelID  uint
	CatalogEntryID  uint
	RouteBindingID  uint
	CredentialID    uint
	SourceType      string
	RouteGroup      string
	ProviderID      string
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
	RuntimeModelID  uint
	ProviderModelID string
	BaseURL         string
	APIKey          string
}

func (s *AIService) OpenAIProxyTargetForRoute(ctx context.Context, userID uint, route ModelRoute, requiredCap string) (OpenAIProxyTarget, error) {
	if strings.TrimSpace(route.RouteGroup) != "" {
		ctx = WithProviderRouteGroup(ctx, strings.TrimSpace(route.RouteGroup))
	}
	if target, handled, err := s.openAIProxyTargetForCredentialCatalogRoute(ctx, userID, route, requiredCap); handled || err != nil {
		if err != nil {
			return OpenAIProxyTarget{}, err
		}
		return target, nil
	}
	if target, handled, err := s.editionOpenAIProxyTargetForCatalogRoute(ctx, userID, route, requiredCap); handled || err != nil {
		if err != nil {
			return OpenAIProxyTarget{}, err
		}
		return target, nil
	}
	return OpenAIProxyTarget{}, fmt.Errorf("catalog route is required for OpenAI proxy target")
}

func (s *AIService) openAIProxyTargetForCredentialCatalogRoute(ctx context.Context, userID uint, route ModelRoute, requiredCap string) (OpenAIProxyTarget, bool, error) {
	if route.CatalogEntryID == 0 || strings.TrimSpace(route.SourceType) != persistencemodel.ModelRouteSourceLocalProvider {
		return OpenAIProxyTarget{}, false, nil
	}
	definition, handled, err := s.catalogRouteDefinition(ctx, route, requiredCap)
	if handled || err != nil {
		if err != nil {
			return OpenAIProxyTarget{}, true, err
		}
	} else {
		return OpenAIProxyTarget{}, false, nil
	}
	cred, err := s.localProviderCredentialForRoute(ctx, route)
	if err != nil {
		return OpenAIProxyTarget{}, true, err
	}
	ctx = withProviderUserID(ctx, userID)
	provider, err := s.registry.BuildForModelCredential(cred, definition.def)
	if err != nil {
		return OpenAIProxyTarget{}, true, err
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
			return OpenAIProxyTarget{}, true, err
		}
	default:
		return OpenAIProxyTarget{}, true, fmt.Errorf("catalog route id=%d is not backed by an OpenAI-compatible provider", route.CatalogEntryID)
	}
	return OpenAIProxyTarget{
		RuntimeModelID:  route.CatalogEntryID,
		ProviderModelID: route.ProviderModelID,
		BaseURL:         baseURL,
		APIKey:          apiKey,
	}, true, nil
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
		return ModelRoutePlan{}, fmt.Errorf("catalog model %q not found for capability %s", modelID, capability)
	}
	if req.CatalogEntryID == 0 && req.RouteBindingID == 0 {
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
	if req.RouteBindingID != 0 {
		return ModelRoutePlan{}, fmt.Errorf("route binding id=%d not found for capability %s", req.RouteBindingID, capability)
	}
	if s.editionModelCatalogOnly() {
		return ModelRoutePlan{}, fmt.Errorf("catalog_entry_id is required for catalog-only routing")
	}
	return ModelRoutePlan{}, fmt.Errorf("catalog_entry_id or route_binding_id is required")
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

func runtimeProviderHealthFor(runtimeModelID uint) *runtimeProviderHealthState {
	value, _ := runtimeProviderHealth.LoadOrStore(runtimeModelID, &runtimeProviderHealthState{})
	return value.(*runtimeProviderHealthState)
}

func runtimeProviderHealthSnapshot(runtimeModelID uint) runtimeProviderHealthView {
	state := runtimeProviderHealthFor(runtimeModelID)
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

func beginRuntimeProviderAttempt(runtimeModelID uint) func(error) {
	state := runtimeProviderHealthFor(runtimeModelID)
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
	RuntimeModelID      uint       `json:"-"`
	CatalogEntryID      uint       `json:"catalog_entry_id,omitempty"`
	RouteBindingID      uint       `json:"route_binding_id,omitempty"`
	ModelID             string     `json:"model_id"`
	ModelDefID          string     `json:"model_def_id"`
	ProviderID          string     `json:"provider_id,omitempty"`
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
	if rows, handled, err := runtimeCatalogRouteHealthSnapshot(db); handled || err != nil {
		return rows, err
	}
	return []RuntimeProviderHealth{}, nil
}

func runtimeCatalogRouteHealthSnapshot(db *gorm.DB) ([]RuntimeProviderHealth, bool, error) {
	if db == nil || !db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return nil, false, nil
	}
	var catalogCount int64
	if err := db.Model(&persistencemodel.AIModelCatalogEntry{}).Count(&catalogCount).Error; err != nil {
		return nil, true, err
	}
	if catalogCount == 0 {
		return nil, false, nil
	}
	if !db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return []RuntimeProviderHealth{}, true, nil
	}
	type catalogHealthRow struct {
		RouteBindingID    uint
		CatalogEntryID    uint
		SourceType        string
		RouteGroup        string
		ProviderID        string
		CredentialID      *uint
		BindingEnabled    bool
		Priority          int
		CapacityWeight    int
		MaxConcurrency    int
		PublicModelID     string
		ProviderModelID   string
		DisplayName       string
		ShortName         string
		EntryEnabled      bool
		Capabilities      string
		PricingMode       string
		AcceptsImage      bool
		MaxInputImages    int
		MaxInputVideos    int
		ImageEditField    string
		SupportedParams   string
		ProviderName      string
		AdapterType       string
		CredentialEnabled bool
	}
	var rows []catalogHealthRow
	if err := db.Table("ai_model_route_bindings").
		Select(`
			ai_model_route_bindings.id AS route_binding_id,
			ai_model_route_bindings.catalog_entry_id AS catalog_entry_id,
			ai_model_route_bindings.source_type AS source_type,
			ai_model_route_bindings.route_group AS route_group,
			ai_model_route_bindings.provider_id AS provider_id,
			ai_model_route_bindings.credential_id AS credential_id,
			ai_model_route_bindings.is_enabled AS binding_enabled,
			ai_model_route_bindings.priority AS priority,
			ai_model_route_bindings.capacity_weight AS capacity_weight,
			ai_model_route_bindings.max_concurrency AS max_concurrency,
			ai_model_catalog_entries.public_model_id AS public_model_id,
			ai_model_route_bindings.provider_model_id AS provider_model_id,
			ai_model_catalog_entries.display_name AS display_name,
			ai_model_catalog_entries.short_name AS short_name,
			ai_model_catalog_entries.is_enabled AS entry_enabled,
			ai_model_catalog_entries.capabilities AS capabilities,
			ai_model_catalog_entries.pricing_mode AS pricing_mode,
			ai_model_catalog_entries.accepts_image AS accepts_image,
			ai_model_catalog_entries.max_input_images AS max_input_images,
			ai_model_catalog_entries.max_input_videos AS max_input_videos,
			ai_model_catalog_entries.image_edit_field AS image_edit_field,
			ai_model_catalog_entries.supported_params AS supported_params,
			COALESCE(ai_credentials.display_name, ai_model_route_bindings.route_group) AS provider_name,
			COALESCE(ai_credentials.adapter_type, ai_model_route_bindings.source_type) AS adapter_type,
			CASE WHEN ai_model_route_bindings.credential_id IS NULL THEN true ELSE COALESCE(ai_credentials.is_enabled, false) END AS credential_enabled
		`).
		Joins("JOIN ai_model_catalog_entries ON ai_model_catalog_entries.id = ai_model_route_bindings.catalog_entry_id AND ai_model_catalog_entries.deleted_at IS NULL").
		Joins("LEFT JOIN ai_credentials ON ai_credentials.id = ai_model_route_bindings.credential_id AND ai_credentials.deleted_at IS NULL").
		Where("ai_model_route_bindings.deleted_at IS NULL").
		Order("ai_model_route_bindings.priority DESC, ai_model_route_bindings.id ASC").
		Scan(&rows).Error; err != nil {
		return nil, true, err
	}
	now := time.Now()
	out := make([]RuntimeProviderHealth, 0, len(rows))
	for _, row := range rows {
		runtimeID := row.CatalogEntryID
		candidate := runtimeModelCandidate{
			id:             runtimeID,
			capacityWeight: row.CapacityWeight,
			maxConcurrency: row.MaxConcurrency,
		}
		view := runtimeProviderHealthSnapshot(runtimeID)
		remaining := int64(0)
		if view.openUntil != nil && view.openUntil.After(now) {
			remaining = view.openUntil.Sub(now).Milliseconds()
		}
		out = append(out, RuntimeProviderHealth{
			RuntimeModelID:      runtimeID,
			CatalogEntryID:      row.CatalogEntryID,
			RouteBindingID:      row.RouteBindingID,
			ModelID:             strings.TrimSpace(row.PublicModelID),
			ModelDefID:          strings.TrimSpace(row.ProviderModelID),
			ProviderID:          strings.TrimSpace(row.ProviderID),
			ProviderName:        strings.TrimSpace(row.ProviderName),
			AdapterType:         strings.TrimSpace(row.AdapterType),
			Priority:            row.Priority,
			CapacityWeight:      runtimeCandidateCapacityWeight(candidate),
			MaxConcurrency:      row.MaxConcurrency,
			IsEnabled:           row.BindingEnabled && row.EntryEnabled && row.CredentialEnabled,
			InFlight:            view.inFlight,
			Saturated:           runtimeCandidateSaturated(candidate, view),
			Successes:           view.successes,
			Failures:            view.failures,
			ConsecutiveFailures: view.consecutiveFailures,
			FailureRate:         view.failureRate,
			CircuitOpen:         view.open,
			OpenUntil:           view.openUntil,
			CooldownRemainingMs: remaining,
		})
	}
	return out, true, nil
}

func timePtrIfSet(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

func calcCostForPricing(pricing modelPricing, def *ModelDef, inputTokens, outputTokens, durationSec, imageCount int) float64 {
	switch def.PricingMode {
	case PricingPerToken:
		return float64(inputTokens)/1_000_000*pricing.CreditsInputPer1M +
			float64(outputTokens)/1_000_000*pricing.CreditsOutputPer1M
	case PricingPerImage:
		if imageCount <= 0 {
			imageCount = 1
		}
		return float64(imageCount) * pricing.CreditsPerImage
	case PricingPerSecond:
		return float64(durationSec) * pricing.CreditsPerSecond
	case PricingPerCall:
		return pricing.CreditsPerCall
	default:
		return 0
	}
}
