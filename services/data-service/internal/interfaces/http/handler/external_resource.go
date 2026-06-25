package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	appexternalresource "github.com/movscript/movscript/internal/app/externalresource"
	"gorm.io/gorm"
)

type ExternalResourceHandler struct {
	service *appexternalresource.Service
}

func NewExternalResourceHandler(db *gorm.DB, encryptionKeyHex string) *ExternalResourceHandler {
	return &ExternalResourceHandler{service: appexternalresource.NewService(db, encryptionKeyHex)}
}

func (h *ExternalResourceHandler) ListSources(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	sources, err := h.service.ListSources(c.Request.Context(), user.ID, currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sources)
}

func (h *ExternalResourceHandler) CreateSource(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name        string            `json:"name"`
		ProviderKey string            `json:"provider_key"`
		Config      map[string]string `json:"config"`
		Priority    int               `json:"priority"`
		IsEnabled   *bool             `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	isEnabled := true
	if req.IsEnabled != nil {
		isEnabled = *req.IsEnabled
	}
	source, err := h.service.CreateSource(c.Request.Context(), appexternalresource.CreateSourceInput{
		UserID:      user.ID,
		OrgID:       currentOrgID(c),
		Name:        req.Name,
		ProviderKey: req.ProviderKey,
		Config:      req.Config,
		Priority:    req.Priority,
		IsEnabled:   isEnabled,
	})
	if err != nil {
		writeExternalResourceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, source)
}

func (h *ExternalResourceHandler) UpdateSource(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		Name      *string           `json:"name"`
		Config    map[string]string `json:"config"`
		Priority  *int              `json:"priority"`
		IsEnabled *bool             `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	source, err := h.service.UpdateSource(c.Request.Context(), appexternalresource.UpdateSourceInput{
		UserID:    user.ID,
		OrgID:     currentOrgID(c),
		ID:        parseID(c.Param("id")),
		Name:      req.Name,
		Config:    req.Config,
		Priority:  req.Priority,
		IsEnabled: req.IsEnabled,
	})
	if err != nil {
		writeExternalResourceError(c, err)
		return
	}
	c.JSON(http.StatusOK, source)
}

func (h *ExternalResourceHandler) Search(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	result, err := h.service.Search(c.Request.Context(), appexternalresource.SearchInput{
		UserID:      user.ID,
		OrgID:       currentOrgID(c),
		SourceID:    parseID(c.Query("source_id")),
		Query:       c.Query("q"),
		MediaType:   c.Query("media_type"),
		Orientation: c.Query("orientation"),
		Page:        parseInt(c.DefaultQuery("page", "1")),
		PageSize:    parseInt(c.DefaultQuery("page_size", "24")),
	})
	if err != nil {
		writeExternalResourceError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func writeExternalResourceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appexternalresource.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, appexternalresource.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, appexternalresource.ErrInvalidConfig):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider config"})
	case errors.Is(err, appexternalresource.ErrInvalidQuery):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid search query"})
	case errors.Is(err, appexternalresource.ErrProviderFailed):
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
