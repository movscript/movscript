package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type FeatureHandler struct {
	db  *gorm.DB
	svc *ai.AIService
}

func NewFeatureHandler(db *gorm.DB, svc *ai.AIService) *FeatureHandler {
	return &FeatureHandler{db: db, svc: svc}
}

// featureResp is the JSON shape returned to the admin UI.
type featureResp struct {
	ID                   uint           `json:"ID"`
	FeatureKey           string         `json:"feature_key"`
	DisplayName          string         `json:"display_name"`
	Description          string         `json:"description"`
	Capability           string         `json:"capability"`
	IsEnabled            bool           `json:"is_enabled"`
	IsInternal           bool           `json:"is_internal"`
	IsToolFeature        bool           `json:"is_tool_feature"`
	InputSlots           []ai.InputSlot `json:"input_slots"`
	AllowedModelIDs      []uint         `json:"allowed_model_ids"`
	DefaultModelID       *uint          `json:"default_model_id"`
	AllowedRoles         []string       `json:"allowed_roles"`
	DefaultSystemPrompt  string         `json:"default_system_prompt"`
	SystemPromptOverride string         `json:"system_prompt_override"`
	OutputSchema         string         `json:"output_schema"`
	MaxTokens            int            `json:"max_tokens"`
	MaxTokensOverride    int            `json:"max_tokens_override"`
	CreatedAt            time.Time      `json:"CreatedAt"`
	UpdatedAt            time.Time      `json:"UpdatedAt"`
}

// toResp converts a FeatureConfig DB row to the API response shape.
// It filters AllowedModelIDs to only include IDs that still exist in the DB.
func (h *FeatureHandler) toResp(f model.FeatureConfig) featureResp {
	var rawIDs []uint
	if f.AllowedModelIDs != "" && f.AllowedModelIDs != "[]" {
		_ = json.Unmarshal([]byte(f.AllowedModelIDs), &rawIDs)
	}

	// Filter out stale IDs — model configs that were deleted after being assigned.
	ids := h.filterExistingModelIDs(rawIDs)

	var allowedRoles []string
	if f.AllowedRoles != "" && f.AllowedRoles != "[]" {
		_ = json.Unmarshal([]byte(f.AllowedRoles), &allowedRoles)
	}
	if allowedRoles == nil {
		allowedRoles = []string{}
	}

	def := ai.GetFeatureDef(f.FeatureKey)
	defaultPrompt, outputSchema := "", ""
	maxTokens := f.MaxTokensOverride
	isInternal, isToolFeature := false, false
	var inputSlots []ai.InputSlot
	if def != nil {
		defaultPrompt = def.SystemPrompt
		outputSchema = def.OutputSchema
		isInternal = def.IsInternal
		isToolFeature = def.IsToolFeature
		inputSlots = def.InputSlots
		if maxTokens == 0 {
			maxTokens = def.MaxTokens
		}
	}
	if inputSlots == nil {
		inputSlots = []ai.InputSlot{}
	}

	return featureResp{
		ID:                   f.ID,
		FeatureKey:           f.FeatureKey,
		DisplayName:          f.DisplayName,
		Description:          f.Description,
		Capability:           f.Capability,
		IsEnabled:            f.IsEnabled,
		IsInternal:           isInternal,
		IsToolFeature:        isToolFeature,
		InputSlots:           inputSlots,
		AllowedModelIDs:      ids,
		DefaultModelID:       f.DefaultModelID,
		AllowedRoles:         allowedRoles,
		DefaultSystemPrompt:  defaultPrompt,
		SystemPromptOverride: f.SystemPromptOverride,
		OutputSchema:         outputSchema,
		MaxTokens:            maxTokens,
		MaxTokensOverride:    f.MaxTokensOverride,
		CreatedAt:            f.CreatedAt,
		UpdatedAt:            f.UpdatedAt,
	}
}

// filterExistingModelIDs returns only the IDs that exist in ai_model_configs
// AND whose credential still exists (not soft-deleted). Does NOT filter by is_enabled
// so that temporarily-disabled model selections are preserved.
func (h *FeatureHandler) filterExistingModelIDs(ids []uint) []uint {
	if len(ids) == 0 {
		return []uint{}
	}
	var existing []uint
	h.db.Model(&model.AIModelConfig{}).
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id IN ? AND ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL", ids).
		Pluck("ai_model_configs.id", &existing)
	if existing == nil {
		return []uint{}
	}
	return existing
}

// List returns all feature configs enriched with FeatureDef metadata.
func (h *FeatureHandler) List(c *gin.Context) {
	var features []model.FeatureConfig
	h.db.Order("id").Find(&features)
	out := make([]featureResp, len(features))
	for i, f := range features {
		out[i] = h.toResp(f)
	}
	c.JSON(http.StatusOK, out)
}

// ListDefs returns the hardcoded FeatureDef catalog.
func (h *FeatureHandler) ListDefs(c *gin.Context) {
	c.JSON(http.StatusOK, ai.FeatureCatalog)
}

// Update sets is_enabled, allowed_model_ids, default_model_id, and/or allowed_roles for a feature.
func (h *FeatureHandler) Update(c *gin.Context) {
	key := ai.NormalizeFeatureKey(c.Param("key"))
	var f model.FeatureConfig
	if err := h.db.Where("feature_key = ?", key).First(&f).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "feature not found"})
		return
	}
	var req struct {
		IsEnabled       *bool    `json:"is_enabled"`
		AllowedModelIDs []uint   `json:"allowed_model_ids"`
		DefaultModelID  *uint    `json:"default_model_id"`
		AllowedRoles    []string `json:"allowed_roles"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.IsEnabled != nil {
		f.IsEnabled = *req.IsEnabled
	}
	if req.AllowedModelIDs != nil {
		b, _ := json.Marshal(req.AllowedModelIDs)
		f.AllowedModelIDs = string(b)
	}
	if req.DefaultModelID != nil {
		if *req.DefaultModelID == 0 {
			f.DefaultModelID = nil
		} else {
			f.DefaultModelID = req.DefaultModelID
		}
	}
	if req.AllowedRoles != nil {
		b, _ := json.Marshal(req.AllowedRoles)
		f.AllowedRoles = string(b)
	}
	h.db.Save(&f)
	c.JSON(http.StatusOK, h.toResp(f))
}

// UpdatePrompt sets the system prompt override and/or max tokens override for a feature.
func (h *FeatureHandler) UpdatePrompt(c *gin.Context) {
	key := ai.NormalizeFeatureKey(c.Param("key"))
	var f model.FeatureConfig
	if err := h.db.Where("feature_key = ?", key).First(&f).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "feature not found"})
		return
	}
	var req struct {
		SystemPromptOverride *string `json:"system_prompt_override"`
		MaxTokensOverride    *int    `json:"max_tokens_override"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.SystemPromptOverride != nil {
		f.SystemPromptOverride = *req.SystemPromptOverride
	}
	if req.MaxTokensOverride != nil {
		f.MaxTokensOverride = *req.MaxTokensOverride
	}
	h.db.Save(&f)
	c.JSON(http.StatusOK, h.toResp(f))
}

// GetPublic returns the feature def + config for a single feature key.
// This is a public endpoint (no auth required) used by tool pages to load input slot definitions.
func (h *FeatureHandler) GetPublic(c *gin.Context) {
	key := ai.NormalizeFeatureKey(c.Param("key"))
	var f model.FeatureConfig
	if err := h.db.Where("feature_key = ?", key).First(&f).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "feature not found"})
		return
	}
	c.JSON(http.StatusOK, h.toResp(f))
}
