package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
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

func (h *AIHandler) ListModelCatalogTemplates(c *gin.Context) {
	c.JSON(http.StatusOK, h.service.ListModelCatalogTemplates(c.Request.Context(), c.Query("lab")))
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

func (h *AIHandler) EnableComboTemplate(c *gin.Context) {
	var req adminai.EnableComboTemplateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.EnableComboTemplate(c.Request.Context(), c.Param("key"), req)
	if err != nil {
		writeModelCatalogError(c, err)
		return
	}
	c.JSON(http.StatusCreated, result)
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
	req, ok := bindModelRouteBindingInput(c)
	if !ok {
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
	req, ok := bindModelRouteBindingInput(c)
	if !ok {
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

func bindModelRouteBindingInput(c *gin.Context) (adminai.ModelRouteBindingInput, bool) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return adminai.ModelRouteBindingInput{}, false
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(raw))
	var keys map[string]json.RawMessage
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &keys); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return adminai.ModelRouteBindingInput{}, false
		}
	}
	if _, ok := keys["source_type"]; ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_MODEL_CATALOG", "error": "route bindings no longer accept source_type; use provider_id"})
		return adminai.ModelRouteBindingInput{}, false
	}
	if _, ok := keys["credential_id"]; ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_MODEL_CATALOG", "error": "route bindings no longer accept credential_id; use provider_id"})
		return adminai.ModelRouteBindingInput{}, false
	}
	var req adminai.ModelRouteBindingInput
	if err := json.Unmarshal(raw, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return adminai.ModelRouteBindingInput{}, false
	}
	return req, true
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
