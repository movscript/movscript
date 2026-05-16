package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *SemanticEntityHandler) ListProductions(c *gin.Context) {
	items, err := h.semantic.ListProductions(c.Request.Context(), semanticapp.ProductionFilter{
		ProjectID:  parseID(c.Param("id")),
		Status:     c.Query("status"),
		SourceType: c.Query("source_type"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateProduction(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ProductionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateProduction(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchProduction(c *gin.Context) {
	var req semanticapp.ProductionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchProduction(c.Request.Context(), parseID(c.Param("id")), c.Param("productionId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListContentUnits(c *gin.Context) {
	items, err := h.semantic.ListContentUnits(c.Request.Context(), semanticapp.ContentUnitFilter{
		ProjectID:     parseID(c.Param("id")),
		ProductionID:  parseID(c.Query("production_id")),
		SegmentID:     parseID(c.Query("segment_id")),
		SceneMomentID: parseID(c.Query("scene_moment_id")),
		ScriptBlockID: parseID(c.Query("script_block_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateContentUnit(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ContentUnitInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateContentUnit(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchContentUnit(c *gin.Context) {
	var req semanticapp.ContentUnitInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchContentUnit(c.Request.Context(), parseID(c.Param("id")), c.Param("contentUnitId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListKeyframes(c *gin.Context) {
	items, err := h.semantic.ListKeyframes(c.Request.Context(), semanticapp.KeyframeFilter{
		ProjectID:     parseID(c.Param("id")),
		ProductionID:  parseID(c.Query("production_id")),
		SceneMomentID: parseID(c.Query("scene_moment_id")),
		ContentUnitID: parseID(c.Query("content_unit_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	populateDomainKeyframeResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func populateDomainKeyframeResourceURLs(c *gin.Context, items []domainsemantic.Keyframe) {
	for i := range items {
		if items[i].Resource != nil {
			items[i].Resource.URL = resourceURL(c, items[i].Resource.ID)
		}
	}
}

func (h *SemanticEntityHandler) CreateKeyframe(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.KeyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateKeyframe(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchKeyframe(c *gin.Context) {
	var req semanticapp.KeyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchKeyframe(c.Request.Context(), parseID(c.Param("id")), c.Param("keyframeId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListPreviewTimelines(c *gin.Context) {
	items, err := h.semantic.ListPreviewTimelines(c.Request.Context(), semanticapp.PreviewTimelineFilter{
		ProjectID:    parseID(c.Param("id")),
		ProductionID: parseID(c.Query("production_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreatePreviewTimeline(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.PreviewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreatePreviewTimeline(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchPreviewTimeline(c *gin.Context) {
	var req semanticapp.PreviewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchPreviewTimeline(c.Request.Context(), parseID(c.Param("id")), c.Param("timelineId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListPreviewTimelineItems(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	timelineID := parseID(c.Param("timelineId"))
	if err := h.semantic.EnsurePreviewTimelineInProject(c.Request.Context(), projectID, timelineID); err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	items, err := h.semantic.ListPreviewTimelineItems(c.Request.Context(), semanticapp.PreviewTimelineItemFilter{
		ProjectID:         projectID,
		PreviewTimelineID: timelineID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) ListPreviewTimelineItemsFlat(c *gin.Context) {
	items, err := h.semantic.ListPreviewTimelineItems(c.Request.Context(), semanticapp.PreviewTimelineItemFilter{
		ProjectID:         parseID(c.Param("id")),
		PreviewTimelineID: parseID(c.Query("preview_timeline_id")),
		Status:            c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreatePreviewTimelineItemFlat(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.PreviewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreatePreviewTimelineItem(c.Request.Context(), projectID, 0, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchPreviewTimelineItemFlat(c *gin.Context) {
	var req semanticapp.PreviewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchPreviewTimelineItem(c.Request.Context(), parseID(c.Param("id")), c.Param("itemId"), 0, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) CreatePreviewTimelineItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	timelineID := parseID(c.Param("timelineId"))
	var req semanticapp.PreviewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreatePreviewTimelineItem(c.Request.Context(), projectID, timelineID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchPreviewTimelineItem(c *gin.Context) {
	var req semanticapp.PreviewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchPreviewTimelineItem(c.Request.Context(), parseID(c.Param("id")), c.Param("itemId"), parseID(c.Param("timelineId")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}
