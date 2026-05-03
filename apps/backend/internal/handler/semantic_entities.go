package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type SemanticEntityHandler struct {
	db       *gorm.DB
	semantic *semanticapp.Service
}

func NewSemanticEntityHandler(db *gorm.DB) *SemanticEntityHandler {
	return &SemanticEntityHandler{db: db, semantic: semanticapp.NewService(db)}
}

func (h *SemanticEntityHandler) ListEntityRelations(c *gin.Context) {
	items, err := h.semantic.ListRelations(c.Request.Context(), semanticapp.RelationFilter{
		ProjectID:  parseID(c.Param("id")),
		Category:   c.Query("category"),
		Type:       c.Query("type"),
		SourceType: c.Query("source_type"),
		SourceID:   parseID(c.Query("source_id")),
		TargetType: c.Query("target_type"),
		TargetID:   parseID(c.Query("target_id")),
		Status:     c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) ListScriptVersions(c *gin.Context) {
	items, err := h.semantic.ListScriptVersions(c.Request.Context(), semanticapp.ScriptVersionFilter{
		ProjectID: parseID(c.Param("id")),
		ScriptID:  parseID(c.Query("script_id")),
		Status:    c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateScriptVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateScriptVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateScriptVersion(c.Request.Context(), projectID, req, currentUserID(c))
	if err != nil {
		if errors.Is(err, semanticapp.ErrScriptNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchScriptVersion(c *gin.Context) {
	var req semanticapp.PatchScriptVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchScriptVersion(c.Request.Context(), parseID(c.Param("id")), c.Param("versionId"), req)
	if err != nil {
		if errors.Is(err, semanticapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("对象不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, item)
}

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

func (h *SemanticEntityHandler) ListStoryboardScripts(c *gin.Context) {
	items, err := h.semantic.ListStoryboardScripts(c.Request.Context(), semanticapp.StoryboardScriptFilter{
		ProjectID:       parseID(c.Param("id")),
		ScriptVersionID: parseID(c.Query("script_version_id")),
		Status:          c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardScript(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateStoryboardScript(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchStoryboardScript(c *gin.Context) {
	var req semanticapp.StoryboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchStoryboardScript(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardScriptId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListStoryboardVersions(c *gin.Context) {
	items, err := h.semantic.ListStoryboardVersions(c.Request.Context(), semanticapp.StoryboardVersionFilter{
		ProjectID:          parseID(c.Param("id")),
		StoryboardScriptID: parseID(c.Query("storyboard_script_id")),
		Status:             c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateStoryboardVersion(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchStoryboardVersion(c *gin.Context) {
	var req semanticapp.StoryboardVersionPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchStoryboardVersion(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardVersionId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListStoryboardLines(c *gin.Context) {
	items, err := h.semantic.ListStoryboardLines(c.Request.Context(), semanticapp.StoryboardLineFilter{
		ProjectID:           parseID(c.Param("id")),
		StoryboardScriptID:  parseID(c.Query("storyboard_script_id")),
		StoryboardVersionID: parseID(c.Query("storyboard_version_id")),
		Status:              c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardLine(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardLineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateStoryboardLine(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchStoryboardLine(c *gin.Context) {
	var req semanticapp.StoryboardLineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchStoryboardLine(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardLineId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListProductions(c *gin.Context) {
	items, err := h.semantic.ListProductions(c.Request.Context(), semanticapp.ProductionFilter{
		ProjectID:  parseID(c.Param("id")),
		Status:     c.Query("status"),
		SourceType: c.Query("source_type"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateProduction(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ProductionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateContentUnit(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ContentUnitInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateKeyframeResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateKeyframe(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.KeyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreatePreviewTimeline(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.PreviewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
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
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreatePreviewTimelineItemFlat(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.PreviewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchPreviewTimelineItem(c.Request.Context(), parseID(c.Param("id")), c.Param("itemId"), parseID(c.Param("timelineId")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeReferences(c *gin.Context) {
	items, err := h.semantic.ListCreativeReferences(c.Request.Context(), semanticapp.CreativeReferenceFilter{
		ProjectID: parseID(c.Param("id")),
		Kind:      c.Query("kind"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReference(c *gin.Context) {
	var req semanticapp.CreativeReferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeReference(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeReference(c *gin.Context) {
	var req semanticapp.CreativeReferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeReference(c.Request.Context(), parseID(c.Param("id")), c.Param("referenceId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeReferenceStates(c *gin.Context) {
	items, err := h.semantic.ListCreativeReferenceStates(c.Request.Context(), semanticapp.CreativeReferenceStateFilter{
		ProjectID:           parseID(c.Param("id")),
		CreativeReferenceID: parseID(c.Query("creative_reference_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReferenceState(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreativeReferenceStateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeReferenceState(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeReferenceState(c *gin.Context) {
	var req semanticapp.CreativeReferenceStateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeReferenceState(c.Request.Context(), parseID(c.Param("id")), c.Param("stateId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeReferenceUsages(c *gin.Context) {
	items, err := h.semantic.ListCreativeReferenceUsages(c.Request.Context(), semanticapp.CreativeReferenceUsageFilter{
		ProjectID:           parseID(c.Param("id")),
		OwnerType:           c.Query("owner_type"),
		OwnerID:             parseID(c.Query("owner_id")),
		CreativeReferenceID: parseID(c.Query("creative_reference_id")),
		Status:              c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReferenceUsage(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreativeReferenceUsageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeReferenceUsage(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeReferenceUsage(c *gin.Context) {
	var req semanticapp.CreativeReferenceUsageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeReferenceUsage(c.Request.Context(), parseID(c.Param("id")), c.Param("usageId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeRelationships(c *gin.Context) {
	items, err := h.semantic.ListCreativeRelationships(c.Request.Context(), semanticapp.CreativeRelationshipFilter{
		ProjectID:           parseID(c.Param("id")),
		CreativeReferenceID: parseID(c.Query("creative_reference_id")),
		ScopeType:           c.Query("scope_type"),
		Status:              c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeRelationship(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreativeRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeRelationship(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeRelationship(c *gin.Context) {
	var req semanticapp.CreativeRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeRelationship(c.Request.Context(), parseID(c.Param("id")), c.Param("relationshipId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListAssetSlots(c *gin.Context) {
	items, err := h.semantic.ListAssetSlots(c.Request.Context(), semanticapp.AssetSlotFilter{
		ProjectID:       parseID(c.Param("id")),
		ProductionID:    parseID(c.Query("production_id")),
		Status:          c.Query("status"),
		OwnerType:       c.Query("owner_type"),
		IncludeInternal: truthyQuery(c.Query("include_internal")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateAssetSlotResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateAssetSlot(c *gin.Context) {
	var req semanticapp.AssetSlotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateAssetSlot(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchAssetSlot(c *gin.Context) {
	var req semanticapp.PatchAssetSlotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchAssetSlot(c.Request.Context(), parseID(c.Param("id")), c.Param("slotId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListAssetSlotCandidates(c *gin.Context) {
	items, err := h.semantic.ListAssetSlotCandidates(c.Request.Context(), semanticapp.AssetSlotCandidateFilter{
		ProjectID:   parseID(c.Param("id")),
		AssetSlotID: parseID(c.Query("asset_slot_id")),
		Status:      c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateAssetSlotCandidateResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateAssetSlotCandidate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.AssetSlotCandidateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	userID := uint(0)
	if id := currentUserID(c); id != nil {
		userID = *id
	}
	item, err := h.semantic.CreateAssetSlotCandidate(c.Request.Context(), projectID, req, userID)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	single := []model.AssetSlotCandidate{item}
	populateAssetSlotCandidateResourceURLs(c, single)
	c.JSON(http.StatusCreated, single[0])
}

func (h *SemanticEntityHandler) PatchAssetSlotCandidate(c *gin.Context) {
	var req semanticapp.AssetSlotCandidateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchAssetSlotCandidate(c.Request.Context(), parseID(c.Param("id")), c.Param("candidateId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCandidateDecisions(c *gin.Context) {
	items, err := h.semantic.ListCandidateDecisions(c.Request.Context(), semanticapp.CandidateDecisionFilter{
		ProjectID:         parseID(c.Param("id")),
		CandidateType:     c.Query("candidate_type"),
		CandidateID:       parseID(c.Query("candidate_id")),
		CandidateClientID: c.Query("candidate_client_id"),
		Decision:          c.Query("decision"),
		Status:            c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCandidateDecision(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CandidateDecisionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCandidateDecision(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCandidateDecision(c *gin.Context) {
	var req semanticapp.CandidateDecisionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCandidateDecision(c.Request.Context(), parseID(c.Param("id")), c.Param("decisionId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListReviewEvents(c *gin.Context) {
	items, err := h.semantic.ListReviewEvents(c.Request.Context(), semanticapp.ReviewEventFilter{
		ProjectID:       parseID(c.Param("id")),
		SubjectType:     c.Query("subject_type"),
		SubjectID:       parseID(c.Query("subject_id")),
		SubjectClientID: c.Query("subject_client_id"),
		EventType:       c.Query("event_type"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateReviewEvent(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ReviewEventInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateReviewEvent(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchReviewEvent(c *gin.Context) {
	var req semanticapp.ReviewEventInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchReviewEvent(c.Request.Context(), parseID(c.Param("id")), c.Param("eventId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListWorkItems(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if _, _, ok := h.projectRole(c, projectID); !ok {
		return
	}
	items, err := h.semantic.ListWorkItems(c.Request.Context(), semanticapp.WorkItemFilter{
		ProjectID:    projectID,
		ProductionID: parseID(c.Query("production_id")),
		TargetType:   c.Query("target_type"),
		Status:       c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以分配任务"))
		return
	}
	var req semanticapp.WorkItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateWorkItem(c.Request.Context(), projectID, semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchWorkItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, userID, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchWorkItem(c.Request.Context(), projectID, c.Param("workItemId"), semanticapp.WorkAuth{Role: role, UserID: userID}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) DeleteWorkItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以删除任务"))
		return
	}
	h.DeleteSemanticItem(c, &model.WorkItem{}, c.Param("workItemId"))
}

func (h *SemanticEntityHandler) ListWorkReviews(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if _, _, ok := h.projectRole(c, projectID); !ok {
		return
	}
	items, err := h.semantic.ListWorkReviews(c.Request.Context(), semanticapp.WorkReviewFilter{
		ProjectID:  projectID,
		WorkItemID: parseID(c.Query("work_item_id")),
		Status:     c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, userID, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以审核任务"))
		return
	}
	var req semanticapp.WorkReviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateWorkReview(c.Request.Context(), projectID, semanticapp.WorkAuth{Role: role, UserID: userID}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以修改审核记录"))
		return
	}
	var req semanticapp.WorkReviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchWorkReview(c.Request.Context(), projectID, c.Param("reviewId"), semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) DeleteWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以删除审核记录"))
		return
	}
	h.DeleteSemanticItem(c, &model.WorkReview{}, c.Param("reviewId"))
}

func (h *SemanticEntityHandler) ListWorkDependencies(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if _, _, ok := h.projectRole(c, projectID); !ok {
		return
	}
	items, err := h.semantic.ListWorkDependencies(c.Request.Context(), semanticapp.WorkDependencyFilter{
		ProjectID:  projectID,
		WorkItemID: parseID(c.Query("work_item_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以维护任务依赖"))
		return
	}
	var req semanticapp.WorkDependencyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateWorkDependency(c.Request.Context(), projectID, semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以维护任务依赖"))
		return
	}
	var req semanticapp.WorkDependencyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchWorkDependency(c.Request.Context(), projectID, c.Param("dependencyId"), semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) DeleteWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if !semanticapp.IsWorkItemManagerRole(role) {
		c.JSON(http.StatusForbidden, apierr.InvalidInput("只有项目负责人或导演可以删除任务依赖"))
		return
	}
	h.DeleteSemanticItem(c, &model.WorkDependency{}, c.Param("dependencyId"))
}

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

func (h *SemanticEntityHandler) nextScriptVersionNumber(projectID uint, scriptID uint) int {
	var maxVersion int
	h.db.Model(&model.ScriptVersion{}).
		Select("COALESCE(MAX(version_number), 0)").
		Where("project_id = ? AND script_id = ?", projectID, scriptID).
		Scan(&maxVersion)
	return maxVersion + 1
}

func (h *SemanticEntityHandler) nextStoryboardVersionNumber(projectID uint, storyboardScriptID uint) int {
	var maxVersion int
	h.db.Model(&model.StoryboardVersion{}).
		Select("COALESCE(MAX(version_number), 0)").
		Where("project_id = ? AND storyboard_script_id = ?", projectID, storyboardScriptID).
		Scan(&maxVersion)
	return maxVersion + 1
}

func truthyQuery(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func populateAssetSlotResourceURLs(c *gin.Context, items []model.AssetSlot) {
	for i := range items {
		if items[i].Resource != nil {
			items[i].Resource.URL = resourceURL(c, items[i].Resource.ID)
		}
		if items[i].LockedAssetSlot != nil && items[i].LockedAssetSlot.Resource != nil {
			items[i].LockedAssetSlot.Resource.URL = resourceURL(c, items[i].LockedAssetSlot.Resource.ID)
		}
	}
}

func populateAssetSlotCandidateResourceURLs(c *gin.Context, items []model.AssetSlotCandidate) {
	for i := range items {
		if items[i].CandidateAssetSlot != nil && items[i].CandidateAssetSlot.Resource != nil {
			items[i].CandidateAssetSlot.Resource.URL = resourceURL(c, items[i].CandidateAssetSlot.Resource.ID)
		}
	}
}

func fallbackString(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func compactUpdates(values map[string]any) map[string]any {
	updates := make(map[string]any, len(values))
	for key, value := range values {
		switch v := value.(type) {
		case nil:
			continue
		case *uint:
			updates[key] = v
		case *int:
			if v != nil {
				updates[key] = *v
			}
		case *float64:
			if v != nil {
				updates[key] = *v
			}
		case *bool:
			if v != nil {
				updates[key] = *v
			}
		case string:
			updates[key] = v
		default:
			updates[key] = value
		}
	}
	return updates
}

func populateKeyframeResourceURLs(c *gin.Context, items []model.Keyframe) {
	for i := range items {
		if items[i].Resource != nil {
			items[i].Resource.URL = resourceURL(c, items[i].Resource.ID)
		}
	}
}
