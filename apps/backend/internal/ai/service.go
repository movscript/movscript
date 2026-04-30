package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"

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
	var cfg model.FeatureConfig
	if err := s.db.Where("feature_key = ?", featureKey).First(&cfg).Error; err != nil {
		return nil, fmt.Errorf("feature %q not found", featureKey)
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

	// Collect all configs that match the required capability.
	type candidate struct {
		cfg      model.AIModelConfig
		def      *ModelDef
		priority int
	}
	var candidates []candidate
	for _, row := range rows {
		def := resolveDefFromConfig(row.AIModelConfig, row.AdapterType)
		for _, cap := range def.Capabilities {
			if cap == fcfg.Capability {
				candidates = append(candidates, candidate{cfg: row.AIModelConfig, def: def, priority: row.Priority})
				break
			}
		}
	}
	if len(candidates) == 0 {
		return 0, "", fmt.Errorf("no available model for feature %q", featureKey)
	}

	// Among candidates with the highest priority, pick one at random.
	chosen := pickByPriority(candidates, func(c candidate) int { return c.priority })
	mid := chosen.cfg.ModelIDOverride
	if mid == "" {
		mid = chosen.def.ModelID
	}
	return chosen.cfg.ID, mid, nil
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

// CallForFeature is the business-layer entry point for text-based features.
// It resolves feature → model config → provider, applies the feature's system prompt
// (with optional DB override), and handles reasoning-model message formatting.
func (s *AIService) CallForFeature(ctx context.Context, userID uint, featureKey string, userMsg string) (TextResponse, error) {
	// 1. Look up FeatureDef for defaults.
	def := GetFeatureDef(featureKey)
	sysPrompt := ""
	maxTokens := 0
	temp := float32(-1)
	if def != nil {
		sysPrompt = def.SystemPrompt
		maxTokens = def.MaxTokens
		temp = def.Temperature
	}

	// 2. Apply DB overrides from FeatureConfig.
	var fcfg model.FeatureConfig
	if err := s.db.Where("feature_key = ?", featureKey).First(&fcfg).Error; err == nil {
		if fcfg.SystemPromptOverride != "" {
			sysPrompt = fcfg.SystemPromptOverride
		}
		if fcfg.MaxTokensOverride > 0 {
			maxTokens = fcfg.MaxTokensOverride
		}
	}

	// 3. Resolve model config ID.
	modelConfigID, _, err := s.GetForFeature(featureKey)
	if err != nil {
		return TextResponse{}, err
	}

	// 4. Determine whether the resolved model is a reasoning model.
	var mcfg model.AIModelConfig
	if err := s.db.First(&mcfg, modelConfigID).Error; err != nil {
		return TextResponse{}, fmt.Errorf("model config %d not found", modelConfigID)
	}
	var cred model.AICredential
	s.db.First(&cred, mcfg.CredentialID)
	mdef := resolveDefFromConfig(mcfg, cred.AdapterType)
	isReasoning := false
	for _, cap := range mdef.Capabilities {
		if cap == CapabilityReasoning {
			isReasoning = true
			break
		}
	}

	// 5. Build messages. Reasoning models don't benefit from a separate system role;
	// merge the system prompt into the user message to save tokens and avoid API quirks.
	var messages []Message
	switch {
	case isReasoning && sysPrompt != "":
		messages = []Message{{Role: "user", Content: sysPrompt + "\n\n" + userMsg}}
	case sysPrompt != "":
		messages = []Message{
			{Role: "system", Content: sysPrompt},
			{Role: "user", Content: userMsg},
		}
	default:
		messages = []Message{{Role: "user", Content: userMsg}}
	}

	// 6. Call and return; usage logging happens inside CallText.
	return s.CallText(ctx, userID, modelConfigID, TextRequest{
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temp,
		IsReasoning: isReasoning,
		JSONMode:    def != nil && def.OutputSchema != "",
	})
}

// CallText calls a text generation model by AIModelConfig DB ID.
func (s *AIService) CallText(ctx context.Context, userID, modelConfigID uint, req TextRequest) (TextResponse, error) {
	return s.CallTextWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallTextWithBilling(ctx context.Context, userID, modelConfigID uint, req TextRequest, billing BillingContext) (TextResponse, error) {
	cfg, provider, def, err := s.loadConfig(modelConfigID, "text")
	if err != nil {
		return TextResponse{}, err
	}
	req.Model = resolveModelID(cfg, def)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(req), maxPositive(req.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return TextResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := provider.TextGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return TextResponse{}, err
	}
	estimate := estimateUsageCost(cfg, def, "text", resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1)
	if err := s.settleUsage(ctx, userID, modelConfigID, estimate, billing); err != nil {
		return TextResponse{}, err
	}
	return resp, nil
}

// CallTextStream calls a text model through a provider streaming API.
// Usage is logged after the provider closes the stream. If the provider does
// not report usage in the stream, the gateway still emits chunks but records
// zero token usage.
func (s *AIService) CallTextStream(ctx context.Context, userID, modelConfigID uint, req TextRequest) (<-chan TextStreamEvent, error) {
	return s.CallTextStreamWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallTextStreamWithBilling(ctx context.Context, userID, modelConfigID uint, req TextRequest, billing BillingContext) (<-chan TextStreamEvent, error) {
	cfg, provider, def, err := s.loadConfig(modelConfigID, "text")
	if err != nil {
		return nil, err
	}
	streamer, ok := provider.(TextStreamProvider)
	if !ok {
		return nil, fmt.Errorf("streaming is not supported by provider for model config %d", modelConfigID)
	}
	req.Model = resolveModelID(cfg, def)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "text", estimateTextInputTokens(req), maxPositive(req.MaxTokens, 1024), 0, 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return nil, err
		}
		billing.ReservationID = &reservation.ID
	}
	upstream, err := streamer.TextStream(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return nil, err
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		var usage TokenUsage
		for event := range upstream {
			if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
				usage = event.Usage
			}
			out <- event
		}
		estimate := estimateUsageCost(cfg, def, "text", usage.InputTokens, usage.OutputTokens, 0, 1)
		_ = s.settleUsage(context.Background(), userID, modelConfigID, estimate, billing)
	}()
	return out, nil
}

// CallImage calls an image generation model by AIModelConfig DB ID.
// It accepts models with either "image" (text-to-image) or "image_edit" (image-to-image) capability.
// When the model has only "image_edit" capability, req.EditOnly is set automatically.
func (s *AIService) CallImage(ctx context.Context, userID, modelConfigID uint, req ImageRequest) (ImageResponse, error) {
	return s.CallImageWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallImageWithBilling(ctx context.Context, userID, modelConfigID uint, req ImageRequest, billing BillingContext) (ImageResponse, error) {
	// Try "image" first, then "image_edit" — both are valid for this call.
	cfg, provider, def, err := s.loadConfig(modelConfigID, "image")
	if err != nil {
		// Fall back to image_edit capability.
		var err2 error
		cfg, provider, def, err2 = s.loadConfig(modelConfigID, "image_edit")
		if err2 != nil {
			return ImageResponse{}, err // return original error
		}
		// Mark as edit-only so the adapter enforces input image requirement.
		req.EditOnly = true
	}
	req.Model = resolveModelID(cfg, def)
	if def.ImageEditField != "" {
		req.ImageFieldName = def.ImageEditField
	}
	n := req.N
	if n <= 0 {
		n = 1
	}
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "image", 0, 0, 0, n)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return ImageResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := provider.ImageGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return ImageResponse{}, err
	}
	estimate := estimateUsageCost(cfg, def, "image", 0, 0, 0, n)
	if err := s.settleUsage(ctx, userID, modelConfigID, estimate, billing); err != nil {
		return ImageResponse{}, err
	}
	return resp, nil
}

// CallVideo calls a video generation model by AIModelConfig DB ID.
// It accepts models with any video capability: "video", "video_i2v", or "video_v2v".
func (s *AIService) CallVideo(ctx context.Context, userID, modelConfigID uint, req VideoRequest) (VideoResponse, error) {
	return s.CallVideoWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallVideoWithBilling(ctx context.Context, userID, modelConfigID uint, req VideoRequest, billing BillingContext) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	prepareVideoRequest(&req, cfg, def)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "video", 0, 0, positiveDuration(req.Duration, def), 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return VideoResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := provider.VideoGenerate(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return VideoResponse{}, err
	}
	if err := s.settleVideoUsage(ctx, userID, modelConfigID, cfg, def, req.Duration, resp.DurationSec, billing); err != nil {
		return VideoResponse{}, err
	}
	return resp, nil
}

// SupportsVideoTasks reports whether this model config can submit and poll
// provider-side async video tasks separately.
func (s *AIService) SupportsVideoTasks(modelConfigID uint) bool {
	_, provider, _, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return false
	}
	_, ok := provider.(VideoTaskProvider)
	return ok
}

// SupportsVideoTaskCancellation reports whether this model config can cancel
// provider-side async video tasks.
func (s *AIService) SupportsVideoTaskCancellation(modelConfigID uint) bool {
	_, provider, _, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return false
	}
	_, ok := provider.(VideoTaskCancelProvider)
	return ok
}

// CallVideoStart submits an async provider video task exactly once.
func (s *AIService) CallVideoStart(ctx context.Context, userID, modelConfigID uint, req VideoRequest) (VideoResponse, error) {
	return s.CallVideoStartWithBilling(ctx, userID, modelConfigID, req, BillingContext{})
}

func (s *AIService) CallVideoStartWithBilling(ctx context.Context, userID, modelConfigID uint, req VideoRequest, billing BillingContext) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	taskProvider, ok := provider.(VideoTaskProvider)
	if !ok {
		return VideoResponse{}, fmt.Errorf("model config id=%d does not support async video task polling", modelConfigID)
	}
	prepareVideoRequest(&req, cfg, def)
	if billing.ReservationID == nil {
		estimate := estimateUsageCost(cfg, def, "video", 0, 0, positiveDuration(req.Duration, def), 1)
		reservation, err := s.ReserveQuota(ctx, userID, modelConfigID, estimate, billing)
		if err != nil {
			return VideoResponse{}, err
		}
		billing.ReservationID = &reservation.ID
	}
	resp, err := taskProvider.VideoStart(ctx, req)
	if err != nil {
		_ = s.ReleaseReservation(ctx, derefUint(billing.ReservationID), err.Error())
		return VideoResponse{}, err
	}
	if resp.URL != "" || len(resp.ContentBytes) > 0 {
		if err := s.settleVideoUsage(ctx, userID, modelConfigID, cfg, def, req.Duration, resp.DurationSec, billing); err != nil {
			return VideoResponse{}, err
		}
	}
	return resp, nil
}

// CallVideoPoll queries an existing async provider video task without creating a
// new provider task. Usage is logged only when the poll returns a finished video.
func (s *AIService) CallVideoPoll(ctx context.Context, userID, modelConfigID uint, taskID, taskKind string, requestedDuration int) (VideoResponse, error) {
	return s.CallVideoPollWithBilling(ctx, userID, modelConfigID, taskID, taskKind, requestedDuration, BillingContext{})
}

func (s *AIService) CallVideoPollWithBilling(ctx context.Context, userID, modelConfigID uint, taskID, taskKind string, requestedDuration int, billing BillingContext) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	taskProvider, ok := provider.(VideoTaskProvider)
	if !ok {
		return VideoResponse{}, fmt.Errorf("model config id=%d does not support async video task polling", modelConfigID)
	}
	req := VideoPollRequest{
		Model:    resolveModelID(cfg, def),
		TaskID:   taskID,
		TaskKind: taskKind,
	}
	resp, err := taskProvider.VideoPoll(ctx, req)
	if err != nil {
		return resp, err
	}
	if resp.Status == VideoStatusSucceeded && (resp.URL != "" || len(resp.ContentBytes) > 0) {
		if err := s.settleVideoUsage(ctx, userID, modelConfigID, cfg, def, requestedDuration, resp.DurationSec, billing); err != nil {
			return resp, err
		}
	}
	return resp, nil
}

// CallVideoCancel requests provider-side cancellation for an async video task.
func (s *AIService) CallVideoCancel(ctx context.Context, modelConfigID uint, taskID, taskKind string) (VideoResponse, error) {
	cfg, provider, def, err := s.loadVideoConfig(modelConfigID)
	if err != nil {
		return VideoResponse{}, err
	}
	cancelProvider, ok := provider.(VideoTaskCancelProvider)
	if !ok {
		return VideoResponse{}, fmt.Errorf("model config id=%d does not support async video task cancellation", modelConfigID)
	}
	req := VideoCancelRequest{
		Model:    resolveModelID(cfg, def),
		TaskID:   taskID,
		TaskKind: taskKind,
	}
	return cancelProvider.VideoCancel(ctx, req)
}

// GetFileUploader returns the provider-side Files API uploader configured for a model.
func (s *AIService) GetFileUploader(modelConfigID uint) FileUploader {
	var cfg model.AIModelConfig
	if err := s.db.First(&cfg, modelConfigID).Error; err != nil {
		return nil
	}
	return s.registry.GetFileUploader(cfg)
}

func (s *AIService) loadVideoConfig(modelConfigID uint) (model.AIModelConfig, Provider, *ModelDef, error) {
	// Try all video capability variants — any one makes the model eligible.
	videoCaps := []string{CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V}
	var cfg model.AIModelConfig
	var provider Provider
	var def *ModelDef
	var lastErr error
	for _, cap := range videoCaps {
		var err error
		cfg, provider, def, err = s.loadConfig(modelConfigID, cap)
		if err == nil {
			return cfg, provider, def, nil
		}
		lastErr = err
	}
	return cfg, provider, def, lastErr
}

func prepareVideoRequest(req *VideoRequest, cfg model.AIModelConfig, def *ModelDef) {
	req.Model = resolveModelID(cfg, def)
	if req.Duration == 0 && def.DefaultDurSec > 0 {
		req.Duration = def.DefaultDurSec
	}
}

func (s *AIService) logVideoUsage(userID, modelConfigID uint, cfg model.AIModelConfig, def *ModelDef, requestedDuration, actualDuration int) {
	durSec := actualDuration
	if durSec <= 0 {
		durSec = requestedDuration
	}
	if durSec <= 0 && def.DefaultDurSec > 0 {
		durSec = def.DefaultDurSec
	}
	cost := calcCost(cfg, def, 0, 0, durSec, 1)
	_ = s.logUsage(context.Background(), userID, modelConfigID, UsageEstimate{OperationType: "video", DurationSec: durSec, ImageCount: 1, Cost: cost}, BillingContext{}, nil)
}

func (s *AIService) settleVideoUsage(ctx context.Context, userID, modelConfigID uint, cfg model.AIModelConfig, def *ModelDef, requestedDuration, actualDuration int, billing BillingContext) error {
	durSec := actualDuration
	if durSec <= 0 {
		durSec = requestedDuration
	}
	if durSec <= 0 && def.DefaultDurSec > 0 {
		durSec = def.DefaultDurSec
	}
	if durSec <= 0 {
		durSec = 1
	}
	estimate := estimateUsageCost(cfg, def, "video", 0, 0, durSec, 1)
	return s.settleUsage(ctx, userID, modelConfigID, estimate, billing)
}

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
// All items with the maximum priority value are collected, then one is chosen at random.
// This gives uniform load distribution across equally-prioritized providers (e.g. multiple
// grop2api nodes at the same priority level) while still respecting higher-priority configs.
func pickByPriority[T any](items []T, priority func(T) int) T {
	if len(items) == 0 {
		var zero T
		return zero
	}
	// Find the maximum priority.
	maxP := priority(items[0])
	for _, item := range items[1:] {
		if p := priority(item); p > maxP {
			maxP = p
		}
	}
	// Collect all items at max priority.
	var top []T
	for _, item := range items {
		if priority(item) == maxP {
			top = append(top, item)
		}
	}
	// Pick one at random.
	return top[rand.Intn(len(top))]
}
