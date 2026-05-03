package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
)

func (h *SemanticEntityHandler) ListSegments(c *gin.Context) {
	items, err := h.semantic.ListSegments(c.Request.Context(), semanticapp.SegmentFilter{
		ProjectID:    parseID(c.Param("id")),
		ProductionID: parseID(c.Query("production_id")),
		TextBlockID:  parseID(c.Query("text_block_id")),
		Status:       c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateSegment(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateSegmentInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateSegment(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchSegment(c *gin.Context) {
	var req semanticapp.PatchSegmentInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchSegment(c.Request.Context(), parseID(c.Param("id")), c.Param("segmentId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListProductionTextBlocks(c *gin.Context) {
	items, err := h.semantic.ListProductionTextBlocks(c.Request.Context(), semanticapp.ProductionTextBlockFilter{
		ProjectID:    parseID(c.Param("id")),
		ProductionID: parseID(c.Query("production_id")),
		Status:       c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateProductionTextBlock(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateProductionTextBlockInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateProductionTextBlock(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchProductionTextBlock(c *gin.Context) {
	var req semanticapp.PatchProductionTextBlockInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchProductionTextBlock(c.Request.Context(), parseID(c.Param("id")), c.Param("textBlockId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListSceneMoments(c *gin.Context) {
	items, err := h.semantic.ListSceneMoments(c.Request.Context(), semanticapp.SceneMomentFilter{
		ProjectID: parseID(c.Param("id")),
		SegmentID: parseID(c.Query("segment_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateSceneMoment(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateSceneMomentInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateSceneMoment(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchSceneMoment(c *gin.Context) {
	var req semanticapp.PatchSceneMomentInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchSceneMoment(c.Request.Context(), parseID(c.Param("id")), c.Param("sceneMomentId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}
