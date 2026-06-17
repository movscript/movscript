package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	adminai "github.com/movscript/movscript/internal/app/admin/ai"
)

func (h *AIHandler) ListModelCatalogEntries(c *gin.Context) {
	entries, err := h.service.ListModelCatalogEntries(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entries)
}

func (h *AIHandler) CreateModelCatalogEntry(c *gin.Context) {
	var req adminai.ModelCatalogEntryInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	entry, err := h.service.CreateModelCatalogEntry(c.Request.Context(), req)
	if err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.JSON(http.StatusCreated, entry)
}

func (h *AIHandler) UpdateModelCatalogEntry(c *gin.Context) {
	var req adminai.ModelCatalogEntryInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	entry, err := h.service.UpdateModelCatalogEntry(c.Request.Context(), c.Param("id"), req)
	if err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.JSON(http.StatusOK, entry)
}

func (h *AIHandler) DeleteModelCatalogEntry(c *gin.Context) {
	if err := h.service.DeleteModelCatalogEntry(c.Request.Context(), c.Param("id")); err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AIHandler) CreateModelRouteBinding(c *gin.Context) {
	var req adminai.ModelRouteBindingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	binding, err := h.service.CreateModelRouteBinding(c.Request.Context(), c.Param("id"), req)
	if err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.JSON(http.StatusCreated, binding)
}

func (h *AIHandler) UpdateModelRouteBinding(c *gin.Context) {
	var req adminai.ModelRouteBindingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	binding, err := h.service.UpdateModelRouteBinding(c.Request.Context(), c.Param("bindingId"), req)
	if err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.JSON(http.StatusOK, binding)
}

func (h *AIHandler) DeleteModelRouteBinding(c *gin.Context) {
	if err := h.service.DeleteModelRouteBinding(c.Request.Context(), c.Param("bindingId")); err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func writeModelCatalogError(c *gin.Context, err error) {
	if errors.Is(err, adminai.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if errors.Is(err, adminai.ErrInvalidModelCatalog) {
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_MODEL_CATALOG", "error": err.Error()})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}
