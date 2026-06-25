package handler

import (
	"fmt"
	"net/http"
	"strings"

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
	apiKinds, err := splitModelCatalogAPIKindQuery(c.Query("api_kind"), c.Query("api_kinds"), c.Query("provider_api_kind"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	routeGroup, err := modelCatalogRequestedRouteGroup(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if routeGroup != "" {
		ctx = ai.WithProviderRouteGroup(ctx, routeGroup)
	}
	models, err := h.service.ListByCapabilityWithOptions(ctx, capability, catalogapp.ListOptions{
		ProviderVariants: providerVariants,
		RouteGroup:       routeGroup,
		APIKinds:         apiKinds,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, models)
}

func splitModelCatalogAPIKindQuery(values ...string) ([]string, error) {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			kind := strings.TrimSpace(part)
			if kind == "" || seen[kind] {
				continue
			}
			if !ai.ValidModelAPIKind(kind) {
				return nil, fmt.Errorf("unsupported api_kind %q", kind)
			}
			seen[kind] = true
			out = append(out, kind)
		}
	}
	return out, nil
}
