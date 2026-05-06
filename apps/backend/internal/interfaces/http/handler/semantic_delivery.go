package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
)

func (h *SemanticEntityHandler) ListDeliveryVersions(c *gin.Context) {
	items, err := h.semantic.ListDeliveryVersions(c.Request.Context(), semanticapp.DeliveryVersionFilter{
		ProjectID:    parseID(c.Param("id")),
		ProductionID: parseID(c.Query("production_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateDeliveryVersion(c *gin.Context) {
	var req semanticapp.DeliveryVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateDeliveryVersion(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchDeliveryVersion(c *gin.Context) {
	var req semanticapp.DeliveryVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchDeliveryVersion(c.Request.Context(), parseID(c.Param("id")), c.Param("deliveryVersionId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListDeliveryTimelineItems(c *gin.Context) {
	items, err := h.semantic.ListDeliveryTimelineItems(c.Request.Context(), semanticapp.DeliveryTimelineItemFilter{
		ProjectID:         parseID(c.Param("id")),
		DeliveryVersionID: parseID(c.Query("delivery_version_id")),
		Status:            c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateDeliveryTimelineItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.DeliveryTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateDeliveryTimelineItem(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchDeliveryTimelineItem(c *gin.Context) {
	var req semanticapp.DeliveryTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchDeliveryTimelineItem(c.Request.Context(), parseID(c.Param("id")), c.Param("itemId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListExportRecords(c *gin.Context) {
	items, err := h.semantic.ListExportRecords(c.Request.Context(), semanticapp.ExportRecordFilter{
		ProjectID:         parseID(c.Param("id")),
		DeliveryVersionID: parseID(c.Query("delivery_version_id")),
		Status:            c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateExportRecord(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ExportRecordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateExportRecord(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchExportRecord(c *gin.Context) {
	var req semanticapp.ExportRecordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchExportRecord(c.Request.Context(), parseID(c.Param("id")), c.Param("exportId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCanvasOutputs(c *gin.Context) {
	items, err := h.semantic.ListCanvasOutputs(c.Request.Context(), semanticapp.CanvasOutputFilter{
		ProjectID: parseID(c.Param("id")),
		CanvasID:  parseID(c.Query("canvas_id")),
		OwnerType: c.Query("owner_type"),
		Status:    c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCanvasOutput(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CanvasOutputInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCanvasOutput(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCanvasOutput(c *gin.Context) {
	var req semanticapp.CanvasOutputInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCanvasOutput(c.Request.Context(), parseID(c.Param("id")), c.Param("outputId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}
