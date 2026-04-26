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
	ID               uint       `json:"id"`                          // AIModelConfig primary key
	CredentialID     uint       `json:"credential_id"`               // parent AICredential ID (for admin edit)
	DisplayName      string     `json:"display_name"`
	ProviderName     string     `json:"provider_name"`               // credential display_name (e.g. "我的 OpenAI")
	Capabilities     []string   `json:"capabilities"`                // e.g. ["text"], ["image"], ["video_i2v"]
	AcceptsImageInput bool      `json:"accepts_image_input"`         // true for image_edit and i2v models
	IsDefault        bool       `json:"is_default,omitempty"`        // true when this is the admin-pinned default for a feature
	ModelDefID       string     `json:"model_def_id"`
	ModelIDOverride  string     `json:"model_id_override,omitempty"` // actual model ID sent to API if overridden
	SupportedParams  []ParamDef `json:"supported_params,omitempty"`
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

// GetModelsByCapability returns enabled model configs whose catalog def includes capability.
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

	// Determine which capabilities to query from the FeatureDef catalog.
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
	cfg, provider, def, err := s.loadConfig(modelConfigID, "text")
	if err != nil {
		return TextResponse{}, err
	}
	req.Model = resolveModelID(cfg, def)
	resp, err := provider.TextGenerate(ctx, req)
	if err != nil {
		return TextResponse{}, err
	}
	cost := calcCost(cfg, def, resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1)
	s.logUsage(userID, modelConfigID, "text", resp.Usage.InputTokens, resp.Usage.OutputTokens, 0, 1, cost)
	return resp, nil
}

// CallImage calls an image generation model by AIModelConfig DB ID.
// It accepts models with either "image" (text-to-image) or "image_edit" (image-to-image) capability.
// When the model has only "image_edit" capability, req.EditOnly is set automatically.
func (s *AIService) CallImage(ctx context.Context, userID, modelConfigID uint, req ImageRequest) (ImageResponse, error) {
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
	resp, err := provider.ImageGenerate(ctx, req)
	if err != nil {
		return ImageResponse{}, err
	}
	cost := calcCost(cfg, def, 0, 0, 0, n)
	s.logUsage(userID, modelConfigID, "image", 0, 0, 0, n, cost)
	return resp, nil
}

// CallVideo calls a video generation model by AIModelConfig DB ID.
// It accepts models with any video capability: "video", "video_i2v", or "video_v2v".
func (s *AIService) CallVideo(ctx context.Context, userID, modelConfigID uint, req VideoRequest) (VideoResponse, error) {
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
			lastErr = nil
			break
		}
		lastErr = err
	}
	if lastErr != nil {
		return VideoResponse{}, lastErr
	}
	req.Model = resolveModelID(cfg, def)
	if req.Duration <= 0 && def.DefaultDurSec > 0 {
		req.Duration = def.DefaultDurSec
	}
	resp, err := provider.VideoGenerate(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	durSec := resp.DurationSec
	if durSec <= 0 {
		durSec = req.Duration
	}
	if durSec <= 0 && def.DefaultDurSec > 0 {
		durSec = def.DefaultDurSec
	}
	cost := calcCost(cfg, def, 0, 0, durSec, 1)
	s.logUsage(userID, modelConfigID, "video", 0, 0, durSec, 1, cost)
	return resp, nil
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

func (s *AIService) logUsage(userID, modelConfigID uint, opType string,
	inputTokens, outputTokens, durationSec, imageCount int, cost float64) {
	if imageCount <= 0 {
		imageCount = 1
	}
	entry := model.UsageLog{
		UserID:          userID,
		AIModelConfigID: modelConfigID,
		OperationType:   opType,
		InputTokens:     inputTokens,
		OutputTokens:    outputTokens,
		DurationSec:     durationSec,
		ImageCount:      imageCount,
		Cost:            cost,
	}
	s.db.Create(&entry)
	if cost > 0 {
		s.db.Model(&model.UserQuota{}).
			Where("user_id = ?", userID).
			UpdateColumn("balance", gorm.Expr("balance - ?", cost))
	}
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
