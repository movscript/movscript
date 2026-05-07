package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	modelsapp "github.com/movscript/movscript/internal/app/models"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
)

type ModelsHandler struct {
	service *modelsapp.Service
}

func NewModelsHandler(svc *ai.AIService, cacheStore ...cache.Cache) *ModelsHandler {
	return &ModelsHandler{service: modelsapp.NewService(svc, cacheStore...)}
}

// ListByCapability returns enabled models for the given capability or feature.
// ?feature=<key>  — returns all models compatible with that feature (may span multiple capabilities)
// ?capability=<c> — returns all enabled models with that single capability
// ?feature takes precedence when both are supplied.
func (h *ModelsHandler) ListByCapability(c *gin.Context) {
	featureKey := c.Query("feature")
	providerVariants := c.Query("provider_variants") == "true" || c.Query("include_provider_variants") == "true"
	if featureKey != "" {
		models, err := h.service.ListForFeature(c.Request.Context(), featureKey, providerVariants)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, models)
		return
	}

	capability := c.Query("capability")
	models, err := h.service.ListByCapability(c.Request.Context(), capability, providerVariants)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, models)
}
