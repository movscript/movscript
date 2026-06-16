package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	catalogapp "github.com/movscript/movscript/internal/app/catalog"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type ModelsHandler struct {
	service *catalogapp.Service
}

func NewModelsHandler(modelCatalog providercontract.AIGatewayModelCatalog, cacheStore ...cache.Cache) *ModelsHandler {
	return &ModelsHandler{service: catalogapp.NewService(modelCatalog, cacheStore...)}
}

// ListByCapability returns enabled models for one or more runtime capabilities.
// Product use-case selection is intentionally kept out of this API; callers
// choose the capability/model shape they need and may keep source labels for
// audit only.
func (h *ModelsHandler) ListByCapability(c *gin.Context) {
	providerVariants := c.Query("provider_variants") == "true" || c.Query("include_provider_variants") == "true"
	capability := c.Query("capability")
	ctx := c.Request.Context()
	routeGroup, err := modelCatalogRequestedRouteGroup(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if routeGroup != "" {
		ctx = ai.WithProviderRouteGroup(ctx, routeGroup)
	}
	models, err := h.service.ListByCapabilityForRoute(ctx, capability, routeGroup, providerVariants)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, models)
}
