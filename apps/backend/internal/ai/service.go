package ai

import (
	"encoding/json"
	"fmt"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

// PublicModel is the user-facing model representation.
type PublicModel struct {
	ID                uint       `json:"id"`            // AIModelConfig primary key
	CredentialID      uint       `json:"credential_id"` // parent AICredential ID (for admin edit)
	DisplayName       string     `json:"display_name"`
	ShortName         string     `json:"short_name,omitempty"`
	ProviderName      string     `json:"provider_name"`        // credential display_name (e.g. "我的 OpenAI")
	Capabilities      []string   `json:"capabilities"`         // e.g. ["text"], ["image"], ["video_i2v"]
	AcceptsImageInput bool       `json:"accepts_image_input"`  // true for image_edit and i2v models
	IsDefault         bool       `json:"is_default,omitempty"` // true when this is the admin-pinned default for a feature
	ModelDefID        string     `json:"model_def_id"`
	ModelIDOverride   string     `json:"model_id_override,omitempty"` // actual model ID sent to API if overridden
	SupportedParams   []ParamDef `json:"supported_params,omitempty"`
}

// AIService is the unified entry point for all AI calls.
// It routes by AIModelConfig DB ID, logs usage, and deducts user credits.
type AIService struct {
	registry *Registry
	db       *gorm.DB
}

func NewAIService(db *gorm.DB, registry *Registry) *AIService {
	return &AIService{db: db, registry: registry}
}

type modelConfigWithProvider struct {
	model.AIModelConfig
	ProviderName string
	AdapterType  string
}

type GenerationPreflightRequest struct {
	ModelConfigID uint
	OutputType    string
	ExtraParams   string
	AspectRatio   string
	Duration      int
	ImageCount    int
	VideoCount    int
}

type GenerationPreflightResult struct {
	Config           model.AIModelConfig
	Def              *ModelDef
	NormalizedParams map[string]any
}

type TextPreflightResult struct {
	Config *model.AIModelConfig
	Def    *ModelDef
}

// PreflightGeneration validates model capability, input media limits, and
// generation params before a caller constructs provider-specific requests.
func (s *AIService) PreflightGeneration(req GenerationPreflightRequest) (GenerationPreflightResult, error) {
	var cfg model.AIModelConfig
	if err := s.db.First(&cfg, req.ModelConfigID).Error; err != nil {
		return GenerationPreflightResult{}, fmt.Errorf("model config not found")
	}
	if !cfg.IsEnabled {
		return GenerationPreflightResult{}, fmt.Errorf("model config id=%d is disabled", req.ModelConfigID)
	}
	var cred model.AICredential
	if err := s.db.First(&cred, cfg.CredentialID).Error; err != nil {
		return GenerationPreflightResult{}, fmt.Errorf("credential not found")
	}
	if !cred.IsEnabled {
		return GenerationPreflightResult{}, fmt.Errorf("credential for model config id=%d is disabled", req.ModelConfigID)
	}
	def := resolveDefFromConfig(cfg, cred.AdapterType)
	if err := ValidateGenRequest(def, GenRequest{
		ModelConfigID: req.ModelConfigID,
		OutputType:    req.OutputType,
		ImageCount:    req.ImageCount,
		VideoCount:    req.VideoCount,
	}); err != nil {
		return GenerationPreflightResult{}, err
	}
	params, err := ValidateAndNormalizeGenerationParams(def, req.OutputType, req.ExtraParams, req.AspectRatio, req.Duration)
	if err != nil {
		return GenerationPreflightResult{}, err
	}
	return GenerationPreflightResult{
		Config:           cfg,
		Def:              def,
		NormalizedParams: params,
	}, nil
}

// PreflightText validates text model capability and text request parameters.
// It also normalizes validated params back into req so callers can pass the
// same TextRequest to CallText/CallTextStream.
func (s *AIService) PreflightText(modelConfigID uint, req *TextRequest) (TextPreflightResult, error) {
	if req == nil {
		return TextPreflightResult{}, fmt.Errorf("text request is required")
	}
	cfg, _, def, err := s.loadConfig(modelConfigID, CapabilityText)
	if err != nil {
		return TextPreflightResult{}, err
	}
	rawParams := textRequestParamsForValidation(*req)
	params, err := ValidateAndNormalizeGenerationParams(def, CapabilityText, marshalParamsForValidation(rawParams), "", 0)
	if err != nil {
		return TextPreflightResult{}, err
	}
	applyTextPreflightParams(req, params)
	return TextPreflightResult{Config: &cfg, Def: def}, nil
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

// GetModelsByCapability returns enabled model configs whose resolved definition includes capability.
func (s *AIService) GetModelsByCapability(capability string) ([]PublicModel, error) {
	var rows []modelConfigWithProvider
	s.db.Model(&model.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.is_enabled = true AND ai_model_configs.deleted_at IS NULL AND ai_credentials.is_enabled = true AND ai_credentials.deleted_at IS NULL").
		Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").
		Scan(&rows)

	result := make([]PublicModel, 0)
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		found := false
		for _, cap := range def.Capabilities {
			if cap == capability {
				found = true
				break
			}
		}
		if !found {
			continue
		}
		result = append(result, PublicModel{
			ID:                row.ID,
			CredentialID:      row.CredentialID,
			DisplayName:       def.DisplayName,
			ShortName:         row.ShortName,
			ProviderName:      row.ProviderName,
			Capabilities:      def.Capabilities,
			AcceptsImageInput: def.AcceptsImageInput,
			ModelDefID:        def.ID,
			ModelIDOverride:   row.ModelIDOverride,
			SupportedParams:   def.SupportedParams,
		})
	}
	return result, nil
}

// GetModelsForFeature returns enabled models allowed for a feature key.
// It uses the FeatureDef's CompatibleCaps to query all applicable capabilities,
// so a feature like ref_image_gen can surface both image and image_edit models.
// If the feature has AllowedModelIDs configured, results are filtered to those IDs.
// If the feature is disabled or not found, an empty list is returned without error.
func (s *AIService) GetModelsForFeature(featureKey string) ([]PublicModel, error) {
	featureKey = NormalizeFeatureKey(featureKey)
	var cfg model.FeatureConfig
	if err := s.db.Where("feature_key = ?", featureKey).First(&cfg).Error; err != nil {
		// Feature not in DB — fall back to catalog so features seeded after initial
		// migration still work without requiring a DB re-seed.
		def := GetFeatureDef(featureKey)
		if def == nil {
			return nil, fmt.Errorf("feature %q not found", featureKey)
		}
		return s.GetModelsByCapability(def.RequiredCap)
	}
	if !cfg.IsEnabled {
		return []PublicModel{}, nil
	}

	// Determine which capabilities to query from the feature definition.
	caps := []string{cfg.Capability}
	if def := GetFeatureDef(featureKey); def != nil {
		caps = def.Caps()
	}

	// Collect models across all compatible capabilities, deduplicating by ID.
	seen := make(map[uint]bool)
	all := make([]PublicModel, 0)
	for _, cap := range caps {
		models, err := s.GetModelsByCapability(cap)
		if err != nil {
			return nil, err
		}
		for _, m := range models {
			if !seen[m.ID] {
				seen[m.ID] = true
				all = append(all, m)
			}
		}
	}

	ids := parseIDArray(cfg.AllowedModelIDs)
	if len(ids) == 0 {
		markDefault(all, cfg.DefaultModelID)
		return all, nil
	}
	// Filter to only the allowed IDs.
	idSet := make(map[uint]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}
	out := make([]PublicModel, 0, len(all))
	for _, m := range all {
		if idSet[m.ID] {
			out = append(out, m)
		}
	}
	markDefault(out, cfg.DefaultModelID)
	return out, nil
}

// GetForFeature returns the first allowed model config for a named feature.
// Falls back to any text model when the feature is unconfigured.
// When multiple configs share the highest priority, one is chosen randomly.
func (s *AIService) GetForFeature(featureKey string) (modelConfigID uint, modelID string, err error) {
	featureKey = NormalizeFeatureKey(featureKey)
	var fcfg model.FeatureConfig
	if err := s.db.Where("feature_key = ?", featureKey).First(&fcfg).Error; err != nil {
		return s.GetAnyTextModel()
	}
	if !fcfg.IsEnabled {
		return 0, "", fmt.Errorf("feature %q is disabled", featureKey)
	}
	ids := parseIDArray(fcfg.AllowedModelIDs)

	var rows []modelConfigWithProvider
	base := s.db.Model(&model.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.is_enabled = true AND ai_credentials.is_enabled = true AND ai_credentials.deleted_at IS NULL")
	if len(ids) > 0 {
		base = base.Where("ai_model_configs.id IN ?", ids)
	}
	base.Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").Scan(&rows)

	var candidates []featureModelCandidate
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		for _, cap := range def.Capabilities {
			if cap == fcfg.Capability {
				candidates = append(candidates, featureModelCandidate{cfg: row.AIModelConfig, def: def, priority: row.Priority})
				break
			}
		}
	}
	if len(candidates) == 0 {
		return 0, "", fmt.Errorf("no available model for feature %q", featureKey)
	}

	chosen, mid, ok := selectFeatureModel(candidates, fcfg.DefaultModelID)
	if !ok {
		return 0, "", fmt.Errorf("no available model for feature %q", featureKey)
	}
	return chosen.cfg.ID, mid, nil
}

type featureModelCandidate struct {
	cfg      model.AIModelConfig
	def      *ModelDef
	priority int
}

func selectFeatureModel(candidates []featureModelCandidate, defaultModelID *uint) (featureModelCandidate, string, bool) {
	if len(candidates) == 0 {
		return featureModelCandidate{}, "", false
	}
	if defaultModelID != nil {
		for _, candidate := range candidates {
			if candidate.cfg.ID == *defaultModelID {
				return candidate, resolveModelID(candidate.cfg, candidate.def), true
			}
		}
	}
	chosen := pickByPriority(candidates, func(c featureModelCandidate) int { return c.priority })
	return chosen, resolveModelID(chosen.cfg, chosen.def), true
}

// markDefault sets IsDefault=true on the model whose ID matches defaultID.
// If defaultID is nil or no match is found, the first model is marked as default.
func markDefault(models []PublicModel, defaultID *uint) {
	if len(models) == 0 {
		return
	}
	if defaultID != nil {
		for i := range models {
			if models[i].ID == *defaultID {
				models[i].IsDefault = true
				return
			}
		}
	}
	models[0].IsDefault = true
}

func parseIDArray(s string) []uint {
	var ids []uint
	if s == "" || s == "[]" {
		return ids
	}
	_ = json.Unmarshal([]byte(s), &ids)
	return ids
}

// GetAnyTextModel returns the first available text-capable model config for internal use.
// When multiple configs share the highest priority, one is chosen randomly.
func (s *AIService) GetAnyTextModel() (modelConfigID uint, modelID string, err error) {
	var rows []modelConfigWithProvider
	s.db.Model(&model.AIModelConfig{}).
		Select("ai_model_configs.*, ai_credentials.display_name AS provider_name, ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.is_enabled = true AND ai_credentials.is_enabled = true").
		Order("ai_model_configs.priority DESC, ai_model_configs.id ASC").
		Scan(&rows)

	type candidate struct {
		cfg      model.AIModelConfig
		def      *ModelDef
		priority int
	}
	var candidates []candidate
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		for _, cap := range def.Capabilities {
			if cap == CapabilityText {
				candidates = append(candidates, candidate{cfg: row.AIModelConfig, def: def, priority: row.Priority})
				break
			}
		}
	}
	if len(candidates) == 0 {
		return 0, "", fmt.Errorf("no text-capable model configured and enabled")
	}

	chosen := pickByPriority(candidates, func(c candidate) int { return c.priority })
	mid := chosen.cfg.ModelIDOverride
	if mid == "" {
		mid = chosen.def.ModelID
	}
	return chosen.cfg.ID, mid, nil
}
