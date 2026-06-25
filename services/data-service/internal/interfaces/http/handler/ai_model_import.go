package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	adminai "github.com/movscript/movscript/internal/app/admin/ai"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
)

func (h *AIHandler) PreviewModelImport(c *gin.Context) {
	var req adminai.ModelImportPreviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	result, err := h.service.PreviewModelImport(ctx, req)
	if err != nil {
		writeModelImportError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_import.admin_previewed",
		TargetType: "ai_model_import",
		TargetID:   result.ProviderKind,
		Metadata: map[string]any{
			"provider_kind": result.ProviderKind,
			"display_name":  result.DisplayName,
			"base_url":      redactAuditURL(result.BaseURL),
			"route_group":   result.RouteGroup,
			"model_count":   result.Summary.Total,
			"recommended":   result.Summary.Recommended,
		},
	})
	c.JSON(http.StatusOK, result)
}

func (h *AIHandler) ApplyModelImport(c *gin.Context) {
	var req adminai.ModelImportApplyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	result, err := h.service.ApplyModelImport(ctx, req)
	if err != nil {
		writeModelImportError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_import.admin_applied",
		TargetType: "ai_provider",
		TargetID:   result.Provider.ProviderID,
		Metadata: map[string]any{
			"provider_id":             result.Provider.ProviderID,
			"provider_kind":           result.Provider.ProviderKind,
			"display_name":            result.Provider.DisplayName,
			"base_url":                redactAuditURL(result.Provider.BaseURLPrefix),
			"route_group":             result.RouteGroup,
			"model_count":             result.Summary.Total,
			"created_catalog_entries": result.Summary.CreatedCatalogEntries,
			"reused_catalog_entries":  result.Summary.ReusedCatalogEntries,
			"created_route_bindings":  result.Summary.CreatedRouteBindings,
			"skipped_route_bindings":  result.Summary.SkippedRouteBindings,
		},
	})
	c.JSON(http.StatusCreated, result)
}

func writeModelImportError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, adminai.ErrInvalidModelCatalog):
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_MODEL_IMPORT", "error": err.Error()})
	case errors.Is(err, adminai.ErrInvalidProviderConfig):
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_PROVIDER_CONFIG", "error": err.Error()})
	case errors.Is(err, adminai.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	default:
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
	}
}
