package ai

import (
	"context"
	"encoding/json"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"strings"
)

type ModelInputRequirement struct {
	Min int `json:"min"`
	Max int `json:"max"` // -1 means unlimited.
}

type ModelInputs struct {
	Image ModelInputRequirement `json:"image"`
	Video ModelInputRequirement `json:"video"`
}

func textRuntimeCapabilities() []string {
	return []string{CapabilityText, CapabilityReasoning}
}

func modelInputsForDef(def *ModelDef) ModelInputs {
	if def == nil {
		return ModelInputs{}
	}
	return modelInputsForCapabilities(def, def.Capabilities)
}

func modelInputsForCapability(def *ModelDef, capability string) ModelInputs {
	if def == nil {
		return ModelInputs{}
	}
	if strings.TrimSpace(capability) == "" {
		return modelInputsForDef(def)
	}
	return modelInputsForCapabilities(def, []string{capability})
}

func modelInputsForCapabilities(def *ModelDef, capabilities []string) ModelInputs {
	var out ModelInputs
	if def == nil {
		return out
	}
	out.Image.Max = def.MaxInputImages
	out.Video.Max = def.MaxInputVideos
	if out.Image.Max < 0 {
		out.Image.Max = -1
	}
	if out.Video.Max < 0 {
		out.Video.Max = -1
	}
	imageRequired := len(capabilities) > 0
	videoRequired := len(capabilities) > 0
	for _, capability := range capabilities {
		if requiredImageInputMin(capability) == 0 {
			imageRequired = false
		}
		if requiredVideoInputMin(capability) == 0 {
			videoRequired = false
		}
	}
	if imageRequired {
		out.Image.Min = 1
		if out.Image.Max == 0 {
			out.Image.Max = 1
		}
	}
	if videoRequired {
		out.Video.Min = 1
		if out.Video.Max == 0 {
			out.Video.Max = 1
		}
	}
	return out
}

func mergeModelInputs(left, right ModelInputs) ModelInputs {
	return ModelInputs{
		Image: mergeModelInputRequirement(left.Image, right.Image),
		Video: mergeModelInputRequirement(left.Video, right.Video),
	}
}

func mergeModelInputRequirement(left, right ModelInputRequirement) ModelInputRequirement {
	out := ModelInputRequirement{Min: left.Min, Max: left.Max}
	if right.Min < out.Min {
		out.Min = right.Min
	}
	if out.Max == -1 || right.Max == -1 {
		out.Max = -1
	} else if right.Max > out.Max {
		out.Max = right.Max
	}
	return out
}

// AIService is the unified entry point for all AI calls.
// It routes by public model id or compatibility route id, logs usage, and deducts user credits.
type AIService struct {
	registry *Registry
	db       *gorm.DB
}

func NewAIService(db *gorm.DB, registry *Registry) *AIService {
	return &AIService{db: db, registry: registry}
}

type PreflightModelSnapshot struct {
	ID                uint
	CredentialID      uint
	ModelDefID        string
	ModelIDOverride   string
	CustomDisplayName string
}

type GenerationPreflightResult struct {
	CredentialID     uint
	SnapshotModel    PreflightModelSnapshot
	Def              *ModelDef
	NormalizedParams map[string]any
}

type GenerationRoutePreflightRequest struct {
	Route       ModelRoute
	OutputType  string
	ExtraParams string
	AspectRatio string
	Duration    int
	ImageCount  int
	VideoCount  int
}

type TextPreflightResult struct {
	Def *ModelDef
}

func (s *AIService) PreflightGenerationRoute(ctx context.Context, userID uint, req GenerationRoutePreflightRequest) (GenerationPreflightResult, error) {
	_ = userID
	definition, handled, err := s.catalogRouteDefinition(ctx, req.Route, req.OutputType)
	if err != nil {
		return GenerationPreflightResult{}, err
	}
	if !handled {
		return GenerationPreflightResult{}, fmt.Errorf("catalog route is required for generation preflight")
	}
	if err := ValidateGenRequest(definition.def, GenRequest{
		RuntimeModelID: req.Route.RuntimeModelID,
		OutputType:     req.OutputType,
		ImageCount:     req.ImageCount,
		VideoCount:     req.VideoCount,
	}); err != nil {
		return GenerationPreflightResult{}, err
	}
	params, err := ValidateAndNormalizeGenerationParams(definition.def, req.OutputType, req.ExtraParams, req.AspectRatio, req.Duration)
	if err != nil {
		return GenerationPreflightResult{}, err
	}
	return GenerationPreflightResult{
		CredentialID: req.Route.CredentialID,
		SnapshotModel: PreflightModelSnapshot{
			ID:                req.Route.RuntimeModelID,
			CredentialID:      req.Route.CredentialID,
			ModelDefID:        definition.model.ProviderModelID,
			ModelIDOverride:   firstNonEmptyString(req.Route.ModelID, definition.model.ProviderModelID),
			CustomDisplayName: definition.model.DisplayName,
		},
		Def:              definition.def,
		NormalizedParams: params,
	}, nil
}

func (s *AIService) PreflightTextRoute(ctx context.Context, userID uint, route ModelRoute, req *TextRequest) (TextPreflightResult, error) {
	_ = userID
	if req == nil {
		return TextPreflightResult{}, fmt.Errorf("text request is required")
	}
	for _, capability := range textRuntimeCapabilities() {
		definition, handled, err := s.catalogRouteDefinition(ctx, route, capability)
		if err != nil {
			return TextPreflightResult{}, err
		}
		if handled {
			if err := preflightTextRequest(definition.def, capability, req); err != nil {
				return TextPreflightResult{}, err
			}
			return TextPreflightResult{Def: definition.def}, nil
		}
	}
	return TextPreflightResult{}, fmt.Errorf("catalog route is required for text preflight")
}

func preflightTextRequest(def *ModelDef, capability string, req *TextRequest) error {
	rawParams := textRequestParamsForValidation(*req)
	params, err := ValidateAndNormalizeGenerationParams(def, capability, marshalParamsForValidation(rawParams), "", 0)
	if err != nil {
		return err
	}
	req.IsReasoning = req.IsReasoning || modelHasCapability(def, CapabilityReasoning)
	applyTextPreflightParams(req, params)
	return nil
}

func textRequestParamsForValidation(req TextRequest) map[string]any {
	params := map[string]any{}
	if req.MaxTokens > 0 {
		params["max_tokens"] = req.MaxTokens
	}
	if req.Temperature >= 0 {
		params["temperature"] = req.Temperature
	}
	if req.JSONMode {
		params["json_mode"] = true
	}
	for k, v := range req.ExtraParams {
		params[k] = v
	}
	return params
}

func applyTextPreflightParams(req *TextRequest, params map[string]any) {
	if n, ok := numberValue(params["max_tokens"]); ok {
		req.MaxTokens = int(n)
	}
	if n, ok := numberValue(params["temperature"]); ok {
		req.Temperature = float32(n)
	}
	if b, ok := boolValue(params["json_mode"]); ok {
		req.JSONMode = b
	}
	extra := make(map[string]any, len(params))
	for k, v := range params {
		switch k {
		case "max_tokens", "temperature", "json_mode":
			continue
		default:
			extra[k] = v
		}
	}
	req.ExtraParams = extra
}

func marshalParamsForValidation(params map[string]any) string {
	if len(params) == 0 {
		return ""
	}
	b, err := json.Marshal(params)
	if err != nil {
		return ""
	}
	return string(b)
}

func modelHasCapability(def *ModelDef, capability string) bool {
	for _, cap := range def.Capabilities {
		if cap == capability {
			return true
		}
	}
	return false
}

func mergeCapabilities(left []string, right []string) []string {
	seen := make(map[string]bool, len(left)+len(right))
	out := make([]string, 0, len(left)+len(right))
	for _, cap := range append(left, right...) {
		if cap == "" || seen[cap] {
			continue
		}
		seen[cap] = true
		out = append(out, cap)
	}
	return out
}

func parseIDArray(s string) []uint {
	var ids []uint
	if s == "" || s == "[]" {
		return ids
	}
	_ = json.Unmarshal([]byte(s), &ids)
	return ids
}

// GetAnyTextModel returns the first available text-capable catalog model for internal use.
func (s *AIService) GetAnyTextModel() (runtimeModelID uint, modelID string, err error) {
	if runtimeModelID, modelID, handled, err := s.getAnyTextModelFromCatalog(); handled || err != nil {
		return runtimeModelID, modelID, err
	}
	return 0, "", fmt.Errorf("no text/reasoning catalog route configured and enabled")
}

func (s *AIService) getAnyTextModelFromCatalog() (runtimeModelID uint, modelID string, handled bool, err error) {
	if s == nil || s.db == nil || !s.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{}) {
		return 0, "", false, nil
	}
	var total int64
	if err := s.db.Model(&persistencemodel.AIModelCatalogEntry{}).Count(&total).Error; err != nil {
		return 0, "", true, err
	}
	if total == 0 {
		return 0, "", false, nil
	}
	if !s.db.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
		return 0, "", true, fmt.Errorf("no text/reasoning catalog route configured and enabled")
	}

	var entries []persistencemodel.AIModelCatalogEntry
	if err := s.db.
		Preload("RouteBindings", "is_enabled = true AND deleted_at IS NULL").
		Where("is_enabled = true AND deleted_at IS NULL").
		Order("public_model_id ASC").
		Find(&entries).Error; err != nil {
		return 0, "", true, err
	}
	type candidate struct {
		runtimeModelID uint
		modelID        string
		priority       int
		routeBindingID uint
	}
	candidates := make([]candidate, 0, len(entries))
	for _, entry := range entries {
		def := catalogEntryDef(entry)
		if !modelDefMatchesAnyCapability(def, textRuntimeCapabilities()) {
			continue
		}
		for _, binding := range catalogEntryBindingsForFilter(entry.RouteBindings, "", nil, nil) {
			publicModelID := strings.TrimSpace(entry.PublicModelID)
			candidates = append(candidates, candidate{
				runtimeModelID: entry.ID,
				modelID:        publicModelID,
				priority:       binding.Priority,
				routeBindingID: binding.ID,
			})
		}
	}
	if len(candidates) == 0 {
		return 0, "", true, fmt.Errorf("no text/reasoning catalog route configured and enabled")
	}
	chosen := pickByPriority("service.get_any_text_model.catalog", candidates, func(c candidate) int { return c.priority })
	return chosen.runtimeModelID, chosen.modelID, true, nil
}
