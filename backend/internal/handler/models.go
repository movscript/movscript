package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
)

type ModelsHandler struct {
	svc *ai.AIService
}

func NewModelsHandler(svc *ai.AIService) *ModelsHandler {
	return &ModelsHandler{svc: svc}
}

// ListByCapability returns enabled models for the given capability or feature.
// ?feature=<key>  — returns all models compatible with that feature (may span multiple capabilities)
// ?capability=<c> — returns all enabled models with that single capability
// ?feature takes precedence when both are supplied.
func (h *ModelsHandler) ListByCapability(c *gin.Context) {
	featureKey := c.Query("feature")
	if featureKey != "" {
		models, err := h.svc.GetModelsForFeature(featureKey)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, models)
		return
	}

	capability := c.Query("capability")
	if capability == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "capability or feature query param required"})
		return
	}
	models, err := h.svc.GetModelsByCapability(capability)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, models)
}
