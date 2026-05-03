package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	featureapp "github.com/movscript/movscript/internal/app/feature"
	"gorm.io/gorm"
)

type FeatureHandler struct {
	service *featureapp.Service
}

func NewFeatureHandler(db *gorm.DB, svc *ai.AIService) *FeatureHandler {
	return &FeatureHandler{service: featureapp.NewService(db)}
}

// List returns all feature configs enriched with FeatureDef metadata.
func (h *FeatureHandler) List(c *gin.Context) {
	out, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

// ListDefs returns the hardcoded FeatureDef catalog.
func (h *FeatureHandler) ListDefs(c *gin.Context) {
	c.JSON(http.StatusOK, ai.FeatureCatalog)
}

// Update sets is_enabled, allowed_model_ids, default_model_id, and/or allowed_roles for a feature.
func (h *FeatureHandler) Update(c *gin.Context) {
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
	resp, err := h.service.Update(c.Request.Context(), c.Param("key"), featureapp.UpdateInput{
		IsEnabled:       req.IsEnabled,
		AllowedModelIDs: req.AllowedModelIDs,
		DefaultModelID:  req.DefaultModelID,
		AllowedRoles:    req.AllowedRoles,
	})
	respondFeature(c, resp, err)
}

// UpdatePrompt sets the system prompt override and/or max tokens override for a feature.
func (h *FeatureHandler) UpdatePrompt(c *gin.Context) {
	var req struct {
		SystemPromptOverride *string `json:"system_prompt_override"`
		MaxTokensOverride    *int    `json:"max_tokens_override"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.service.UpdatePrompt(c.Request.Context(), c.Param("key"), featureapp.PromptInput{
		SystemPromptOverride: req.SystemPromptOverride,
		MaxTokensOverride:    req.MaxTokensOverride,
	})
	respondFeature(c, resp, err)
}

// GetPublic returns the feature def + config for a single feature key.
// This is a public endpoint (no auth required) used by tool pages to load input slot definitions.
func (h *FeatureHandler) GetPublic(c *gin.Context) {
	resp, err := h.service.GetPublic(c.Request.Context(), c.Param("key"))
	respondFeature(c, resp, err)
}

func respondFeature(c *gin.Context, resp featureapp.Response, err error) {
	if err != nil {
		if errors.Is(err, featureapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "feature not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}
