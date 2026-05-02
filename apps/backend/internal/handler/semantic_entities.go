package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type SemanticEntityHandler struct{ db *gorm.DB }

func NewSemanticEntityHandler(db *gorm.DB) *SemanticEntityHandler {
	return &SemanticEntityHandler{db: db}
}

func (h *SemanticEntityHandler) ListScriptVersions(c *gin.Context) {
	var items []model.ScriptVersion
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if scriptID := parseID(c.Query("script_id")); scriptID > 0 {
		q = q.Where("script_id = ?", scriptID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("script_id, version_number desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateScriptVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req scriptVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var script model.Script
	if err := h.db.Select("id, project_id, title, raw_source, content").First(&script, req.ScriptID).Error; err != nil || script.ProjectID != projectID {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	item := model.ScriptVersion{
		ProjectID:       projectID,
		ScriptID:        req.ScriptID,
		ParentVersionID: req.ParentVersionID,
		VersionNumber:   req.VersionNumber,
		Title:           fallbackString(req.Title, script.Title),
		SourceType:      fallbackString(req.SourceType, "raw"),
		Content:         fallbackString(req.Content, script.Content),
		RawSource:       fallbackString(req.RawSource, script.RawSource),
		Summary:         req.Summary,
		Status:          fallbackString(req.Status, "draft"),
		CreatedByID:     currentUserID(c),
	}
	if item.VersionNumber == 0 {
		item.VersionNumber = h.nextScriptVersionNumber(projectID, req.ScriptID)
	}
	if err := h.db.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchScriptVersion(c *gin.Context) {
	var item model.ScriptVersion
	if !h.loadProjectItem(c, &item, c.Param("versionId")) {
		return
	}
	var req scriptVersionPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	updates := compactUpdates(map[string]any{
		"title":             req.Title,
		"source_type":       req.SourceType,
		"content":           req.Content,
		"raw_source":        req.RawSource,
		"summary":           req.Summary,
		"status":            req.Status,
		"parent_version_id": req.ParentVersionID,
	})
	h.patchItem(c, &item, updates)
}

func (h *SemanticEntityHandler) ListSegments(c *gin.Context) {
	var items []model.Segment
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if scriptID := parseID(c.Query("script_id")); scriptID > 0 {
		q = q.Where("script_id = ?", scriptID)
	}
	if versionID := parseID(c.Query("script_version_id")); versionID > 0 {
		q = q.Where("script_version_id = ?", versionID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order(`script_version_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateSegment(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req segmentInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var scriptID *uint
	var scriptVersionID *uint
	if req.ScriptVersionID != nil {
		var version model.ScriptVersion
		if err := h.db.First(&version, *req.ScriptVersionID).Error; err != nil || version.ProjectID != projectID {
			c.JSON(http.StatusNotFound, apierr.NotFound("剧本版本不存在"))
			return
		}
		scriptID = &version.ScriptID
		scriptVersionID = &version.ID
	}
	item := model.Segment{
		ProjectID:       projectID,
		ScriptID:        scriptID,
		ScriptVersionID: scriptVersionID,
		ParentSegmentID: req.ParentSegmentID,
		Kind:            fallbackString(req.Kind, "section"),
		Order:           req.Order,
		Title:           req.Title,
		Summary:         req.Summary,
		Content:         req.Content,
		SourceRange:     req.SourceRange,
		Status:          fallbackString(req.Status, "draft"),
		MetadataJSON:    req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchSegment(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var item model.Segment
	if !h.loadProjectItem(c, &item, c.Param("segmentId")) {
		return
	}
	var req segmentPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var scriptID *uint
	var scriptVersionID *uint
	if req.ScriptVersionID != nil {
		var version model.ScriptVersion
		if err := h.db.First(&version, *req.ScriptVersionID).Error; err != nil || version.ProjectID != projectID {
			c.JSON(http.StatusNotFound, apierr.NotFound("剧本版本不存在"))
			return
		}
		scriptID = &version.ScriptID
		scriptVersionID = &version.ID
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"script_id":         scriptID,
		"script_version_id": scriptVersionID,
		"parent_segment_id": req.ParentSegmentID,
		"kind":              req.Kind,
		"order":             req.Order,
		"title":             req.Title,
		"summary":           req.Summary,
		"content":           req.Content,
		"source_range":      req.SourceRange,
		"status":            req.Status,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListSceneMoments(c *gin.Context) {
	var items []model.SceneMoment
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if segmentID := parseID(c.Query("segment_id")); segmentID > 0 {
		q = q.Where("segment_id = ?", segmentID)
	}
	if err := q.Order(`segment_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateSceneMoment(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req sceneMomentInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "segment", req.SegmentID) {
		return
	}
	item := model.SceneMoment{
		ProjectID:     projectID,
		SegmentID:     req.SegmentID,
		Order:         req.Order,
		Title:         req.Title,
		Description:   req.Description,
		TimeText:      req.TimeText,
		LocationText:  req.LocationText,
		ConditionText: req.ConditionText,
		ActionText:    req.ActionText,
		Mood:          req.Mood,
		Status:        fallbackString(req.Status, "draft"),
		MetadataJSON:  req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchSceneMoment(c *gin.Context) {
	var item model.SceneMoment
	if !h.loadProjectItem(c, &item, c.Param("sceneMomentId")) {
		return
	}
	var req sceneMomentPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "segment", req.SegmentID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"segment_id":     req.SegmentID,
		"order":          req.Order,
		"title":          req.Title,
		"description":    req.Description,
		"time_text":      req.TimeText,
		"location_text":  req.LocationText,
		"condition_text": req.ConditionText,
		"action_text":    req.ActionText,
		"mood":           req.Mood,
		"status":         req.Status,
		"metadata_json":  req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListStoryboardScripts(c *gin.Context) {
	var items []model.StoryboardScript
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if scriptVersionID := parseID(c.Query("script_version_id")); scriptVersionID > 0 {
		q = q.Where("script_version_id = ?", scriptVersionID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardScript(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req storyboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_version", req.ScriptVersionID) {
		return
	}
	item := model.StoryboardScript{
		ProjectID:       projectID,
		ScriptVersionID: req.ScriptVersionID,
		Name:            fallbackString(req.Name, "Storyboard Script"),
		Description:     req.Description,
		Status:          fallbackString(req.Status, "draft"),
		IsPrimary:       req.IsPrimary,
		MetadataJSON:    req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchStoryboardScript(c *gin.Context) {
	var item model.StoryboardScript
	if !h.loadProjectItem(c, &item, c.Param("storyboardScriptId")) {
		return
	}
	var req storyboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_version", req.ScriptVersionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"script_version_id": req.ScriptVersionID,
		"name":              req.Name,
		"description":       req.Description,
		"status":            req.Status,
		"is_primary":        &req.IsPrimary,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListStoryboardVersions(c *gin.Context) {
	var items []model.StoryboardVersion
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if storyboardScriptID := parseID(c.Query("storyboard_script_id")); storyboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", storyboardScriptID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("storyboard_script_id, version_number desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req storyboardVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "storyboard_script", req.StoryboardScriptID) {
		return
	}
	item := model.StoryboardVersion{
		ProjectID:          projectID,
		StoryboardScriptID: req.StoryboardScriptID,
		ParentVersionID:    req.ParentVersionID,
		VersionNumber:      req.VersionNumber,
		Title:              req.Title,
		Source:             fallbackString(req.Source, "manual"),
		Status:             fallbackString(req.Status, "draft"),
		SnapshotJSON:       req.SnapshotJSON,
		MetadataJSON:       req.MetadataJSON,
	}
	if item.VersionNumber == 0 {
		item.VersionNumber = h.nextStoryboardVersionNumber(projectID, req.StoryboardScriptID)
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchStoryboardVersion(c *gin.Context) {
	var item model.StoryboardVersion
	if !h.loadProjectItem(c, &item, c.Param("storyboardVersionId")) {
		return
	}
	var req storyboardVersionPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"parent_version_id": req.ParentVersionID,
		"title":             req.Title,
		"source":            req.Source,
		"status":            req.Status,
		"snapshot_json":     req.SnapshotJSON,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListStoryboardLines(c *gin.Context) {
	var items []model.StoryboardLine
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if storyboardScriptID := parseID(c.Query("storyboard_script_id")); storyboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", storyboardScriptID)
	}
	if storyboardVersionID := parseID(c.Query("storyboard_version_id")); storyboardVersionID > 0 {
		q = q.Where("storyboard_version_id = ?", storyboardVersionID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("storyboard_script_id, storyboard_version_id, \"order\", id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardLine(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req storyboardLineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "storyboard_script", req.StoryboardScriptID) ||
		!h.optionalOwnerInProject(c, "storyboard_version", req.StoryboardVersionID) ||
		!h.optionalOwnerInProject(c, "segment", req.SegmentID) ||
		!h.optionalOwnerInProject(c, "scene_moment", req.SceneMomentID) {
		return
	}
	item := model.StoryboardLine{
		ProjectID:           projectID,
		StoryboardScriptID:  req.StoryboardScriptID,
		StoryboardVersionID: req.StoryboardVersionID,
		SegmentID:           req.SegmentID,
		SceneMomentID:       req.SceneMomentID,
		Order:               req.Order,
		Kind:                fallbackString(req.Kind, "beat"),
		Title:               req.Title,
		Description:         req.Description,
		Dialogue:            req.Dialogue,
		VisualIntent:        req.VisualIntent,
		DurationSec:         req.DurationSec,
		Status:              fallbackString(req.Status, "draft"),
		MetadataJSON:        req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchStoryboardLine(c *gin.Context) {
	var item model.StoryboardLine
	if !h.loadProjectItem(c, &item, c.Param("storyboardLineId")) {
		return
	}
	var req storyboardLineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "storyboard_script", req.StoryboardScriptID) ||
		!h.optionalOwnerInProject(c, "storyboard_version", req.StoryboardVersionID) ||
		!h.optionalOwnerInProject(c, "segment", req.SegmentID) ||
		!h.optionalOwnerInProject(c, "scene_moment", req.SceneMomentID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"storyboard_script_id":  req.StoryboardScriptID,
		"storyboard_version_id": req.StoryboardVersionID,
		"segment_id":            req.SegmentID,
		"scene_moment_id":       req.SceneMomentID,
		"order":                 req.Order,
		"kind":                  req.Kind,
		"title":                 req.Title,
		"description":           req.Description,
		"dialogue":              req.Dialogue,
		"visual_intent":         req.VisualIntent,
		"duration_sec":          req.DurationSec,
		"status":                req.Status,
		"metadata_json":         req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListProductions(c *gin.Context) {
	var items []model.Production
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if sourceType := strings.TrimSpace(c.Query("source_type")); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	if err := q.Order("updated_at desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateProduction(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req productionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_version", req.ScriptVersionID) || !h.optionalOwnerInProject(c, "preview_timeline", req.PreviewTimelineID) {
		return
	}
	item := model.Production{
		ProjectID:         projectID,
		ScriptVersionID:   req.ScriptVersionID,
		PreviewTimelineID: req.PreviewTimelineID,
		Name:              req.Name,
		Description:       req.Description,
		Status:            fallbackString(req.Status, "planning"),
		SourceType:        fallbackString(req.SourceType, "direct"),
		OwnerLabel:        fallbackString(req.OwnerLabel, "导演组"),
		Progress:          req.Progress,
		MetadataJSON:      req.MetadataJSON,
	}
	if item.Name == "" {
		item.Name = "未命名制作"
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchProduction(c *gin.Context) {
	var item model.Production
	if !h.loadProjectItem(c, &item, c.Param("productionId")) {
		return
	}
	var req productionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_version", req.ScriptVersionID) || !h.optionalOwnerInProject(c, "preview_timeline", req.PreviewTimelineID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"script_version_id":   req.ScriptVersionID,
		"preview_timeline_id": req.PreviewTimelineID,
		"name":                req.Name,
		"description":         req.Description,
		"status":              req.Status,
		"source_type":         req.SourceType,
		"owner_label":         req.OwnerLabel,
		"progress":            req.Progress,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListContentUnits(c *gin.Context) {
	var items []model.ContentUnit
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if productionID := parseID(c.Query("production_id")); productionID > 0 {
		q = q.Where("production_id = ?", productionID)
	}
	if segmentID := parseID(c.Query("segment_id")); segmentID > 0 {
		q = q.Where("segment_id = ?", segmentID)
	}
	if sceneMomentID := parseID(c.Query("scene_moment_id")); sceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", sceneMomentID)
	}
	if err := q.Order(`segment_id, scene_moment_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateContentUnit(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req contentUnitInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "segment", req.SegmentID) || !h.optionalOwnerInProject(c, "scene_moment", req.SceneMomentID) {
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	item := model.ContentUnit{
		ProjectID:     projectID,
		ProductionID:  req.ProductionID,
		SegmentID:     req.SegmentID,
		SceneMomentID: req.SceneMomentID,
		Kind:          fallbackString(req.Kind, "shot"),
		Order:         req.Order,
		Title:         req.Title,
		Description:   req.Description,
		Prompt:        req.Prompt,
		DurationSec:   req.DurationSec,
		Status:        fallbackString(req.Status, "draft"),
		MetadataJSON:  req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchContentUnit(c *gin.Context) {
	var item model.ContentUnit
	if !h.loadProjectItem(c, &item, c.Param("contentUnitId")) {
		return
	}
	var req contentUnitPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "segment", req.SegmentID) || !h.optionalOwnerInProject(c, "scene_moment", req.SceneMomentID) {
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"production_id":   req.ProductionID,
		"segment_id":      req.SegmentID,
		"scene_moment_id": req.SceneMomentID,
		"kind":            req.Kind,
		"order":           req.Order,
		"title":           req.Title,
		"description":     req.Description,
		"prompt":          req.Prompt,
		"duration_sec":    req.DurationSec,
		"status":          req.Status,
		"metadata_json":   req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListKeyframes(c *gin.Context) {
	var items []model.Keyframe
	q := h.db.Preload("Resource").Where("project_id = ?", parseID(c.Param("id")))
	if productionID := parseID(c.Query("production_id")); productionID > 0 {
		q = q.Where("production_id = ?", productionID)
	}
	if sceneMomentID := parseID(c.Query("scene_moment_id")); sceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", sceneMomentID)
	}
	if contentUnitID := parseID(c.Query("content_unit_id")); contentUnitID > 0 {
		q = q.Where("content_unit_id = ?", contentUnitID)
	}
	if err := q.Order(`content_unit_id, scene_moment_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateKeyframeResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateKeyframe(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req keyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "scene_moment", req.SceneMomentID) || !h.optionalOwnerInProject(c, "content_unit", req.ContentUnitID) {
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	item := model.Keyframe{
		ProjectID:     projectID,
		ProductionID:  req.ProductionID,
		SceneMomentID: req.SceneMomentID,
		ContentUnitID: req.ContentUnitID,
		ResourceID:    req.ResourceID,
		CanvasID:      req.CanvasID,
		Title:         req.Title,
		Description:   req.Description,
		Prompt:        req.Prompt,
		Order:         req.Order,
		Status:        fallbackString(req.Status, "generated"),
		MetadataJSON:  req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchKeyframe(c *gin.Context) {
	var item model.Keyframe
	if !h.loadProjectItem(c, &item, c.Param("keyframeId")) {
		return
	}
	var req keyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "scene_moment", req.SceneMomentID) || !h.optionalOwnerInProject(c, "content_unit", req.ContentUnitID) {
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"production_id":   req.ProductionID,
		"scene_moment_id": req.SceneMomentID,
		"content_unit_id": req.ContentUnitID,
		"resource_id":     req.ResourceID,
		"canvas_id":       req.CanvasID,
		"title":           req.Title,
		"description":     req.Description,
		"prompt":          req.Prompt,
		"order":           req.Order,
		"status":          req.Status,
		"metadata_json":   req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListPreviewTimelines(c *gin.Context) {
	var items []model.PreviewTimeline
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if productionID := parseID(c.Query("production_id")); productionID > 0 {
		q = q.Where("production_id = ?", productionID)
	}
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreatePreviewTimeline(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req previewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	item := model.PreviewTimeline{
		ProjectID:       projectID,
		ProductionID:    req.ProductionID,
		ScriptVersionID: req.ScriptVersionID,
		Name:            req.Name,
		Status:          fallbackString(req.Status, "draft"),
		DurationSec:     req.DurationSec,
		IsPrimary:       req.IsPrimary,
		MetadataJSON:    req.MetadataJSON,
	}
	if item.Name == "" {
		item.Name = "Preview"
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchPreviewTimeline(c *gin.Context) {
	var item model.PreviewTimeline
	if !h.loadProjectItem(c, &item, c.Param("timelineId")) {
		return
	}
	var req previewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"production_id":     req.ProductionID,
		"script_version_id": req.ScriptVersionID,
		"name":              req.Name,
		"status":            req.Status,
		"duration_sec":      req.DurationSec,
		"is_primary":        &req.IsPrimary,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListPreviewTimelineItems(c *gin.Context) {
	var items []model.PreviewTimelineItem
	projectID := parseID(c.Param("id"))
	timelineID := parseID(c.Param("timelineId"))
	if !h.ownerInProject(c, "preview_timeline", timelineID) {
		return
	}
	if err := h.db.Where("project_id = ? AND preview_timeline_id = ?", projectID, timelineID).Order(`"order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) ListPreviewTimelineItemsFlat(c *gin.Context) {
	var items []model.PreviewTimelineItem
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if timelineID := parseID(c.Query("preview_timeline_id")); timelineID > 0 {
		q = q.Where("preview_timeline_id = ?", timelineID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("preview_timeline_id, \"order\", id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreatePreviewTimelineItemFlat(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req previewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "preview_timeline", req.PreviewTimelineID) {
		return
	}
	item := model.PreviewTimelineItem{
		ProjectID:         projectID,
		PreviewTimelineID: req.PreviewTimelineID,
		SegmentID:         req.SegmentID,
		SceneMomentID:     req.SceneMomentID,
		ContentUnitID:     req.ContentUnitID,
		KeyframeID:        req.KeyframeID,
		Kind:              fallbackString(req.Kind, "keyframe"),
		Order:             req.Order,
		StartSec:          req.StartSec,
		DurationSec:       req.DurationSec,
		Label:             req.Label,
		Status:            fallbackString(req.Status, "draft"),
		MetadataJSON:      req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchPreviewTimelineItemFlat(c *gin.Context) {
	var item model.PreviewTimelineItem
	if !h.loadProjectItem(c, &item, c.Param("itemId")) {
		return
	}
	var req previewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "preview_timeline", req.PreviewTimelineID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"preview_timeline_id": req.PreviewTimelineID,
		"segment_id":          req.SegmentID,
		"scene_moment_id":     req.SceneMomentID,
		"content_unit_id":     req.ContentUnitID,
		"keyframe_id":         req.KeyframeID,
		"kind":                req.Kind,
		"order":               req.Order,
		"start_sec":           req.StartSec,
		"duration_sec":        req.DurationSec,
		"label":               req.Label,
		"status":              req.Status,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) CreatePreviewTimelineItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	timelineID := parseID(c.Param("timelineId"))
	if !h.ownerInProject(c, "preview_timeline", timelineID) {
		return
	}
	var req previewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item := model.PreviewTimelineItem{
		ProjectID:         projectID,
		PreviewTimelineID: timelineID,
		SegmentID:         req.SegmentID,
		SceneMomentID:     req.SceneMomentID,
		ContentUnitID:     req.ContentUnitID,
		KeyframeID:        req.KeyframeID,
		Kind:              fallbackString(req.Kind, "keyframe"),
		Order:             req.Order,
		StartSec:          req.StartSec,
		DurationSec:       req.DurationSec,
		Label:             req.Label,
		Status:            fallbackString(req.Status, "draft"),
		MetadataJSON:      req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchPreviewTimelineItem(c *gin.Context) {
	var item model.PreviewTimelineItem
	if !h.loadProjectItem(c, &item, c.Param("itemId")) {
		return
	}
	timelineID := parseID(c.Param("timelineId"))
	if item.PreviewTimelineID != timelineID {
		c.JSON(http.StatusNotFound, apierr.NotFound("对象不存在"))
		return
	}
	var req previewTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"segment_id":      req.SegmentID,
		"scene_moment_id": req.SceneMomentID,
		"content_unit_id": req.ContentUnitID,
		"keyframe_id":     req.KeyframeID,
		"kind":            req.Kind,
		"order":           req.Order,
		"start_sec":       req.StartSec,
		"duration_sec":    req.DurationSec,
		"label":           req.Label,
		"status":          req.Status,
		"metadata_json":   req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListCreativeReferences(c *gin.Context) {
	var items []model.CreativeReference
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if kind := strings.TrimSpace(c.Query("kind")); kind != "" {
		q = q.Where("kind = ?", kind)
	}
	if err := q.Order("kind, name, id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReference(c *gin.Context) {
	var req creativeReferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item := model.CreativeReference{
		ProjectID:        parseID(c.Param("id")),
		SourceScriptID:   req.SourceScriptID,
		SourceAnalysisID: req.SourceAnalysisID,
		LegacySettingID:  req.LegacySettingID,
		Kind:             req.Kind,
		Name:             req.Name,
		Alias:            req.Alias,
		Description:      req.Description,
		Content:          req.Content,
		Importance:       fallbackString(req.Importance, "supporting"),
		Status:           fallbackString(req.Status, "draft"),
		ProfileJSON:      req.ProfileJSON,
		TagsJSON:         req.TagsJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchCreativeReference(c *gin.Context) {
	var item model.CreativeReference
	if !h.loadProjectItem(c, &item, c.Param("referenceId")) {
		return
	}
	var req creativeReferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"source_script_id":   req.SourceScriptID,
		"source_analysis_id": req.SourceAnalysisID,
		"legacy_setting_id":  req.LegacySettingID,
		"kind":               req.Kind,
		"name":               req.Name,
		"alias":              req.Alias,
		"description":        req.Description,
		"content":            req.Content,
		"importance":         req.Importance,
		"status":             req.Status,
		"profile_json":       req.ProfileJSON,
		"tags_json":          req.TagsJSON,
	}))
}

func (h *SemanticEntityHandler) ListCreativeReferenceStates(c *gin.Context) {
	var items []model.CreativeReferenceState
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if refID := parseID(c.Query("creative_reference_id")); refID > 0 {
		q = q.Where("creative_reference_id = ?", refID)
	}
	if err := q.Order("creative_reference_id, scope_type, scope_id, id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReferenceState(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req creativeReferenceStateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "creative_reference", req.CreativeReferenceID) {
		return
	}
	item := model.CreativeReferenceState{
		ProjectID:           projectID,
		CreativeReferenceID: req.CreativeReferenceID,
		ScopeType:           req.ScopeType,
		ScopeID:             req.ScopeID,
		Name:                req.Name,
		Description:         req.Description,
		VisualNotes:         req.VisualNotes,
		Emotion:             req.Emotion,
		Costume:             req.Costume,
		Props:               req.Props,
		Status:              fallbackString(req.Status, "draft"),
		TagsJSON:            req.TagsJSON,
		MetadataJSON:        req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchCreativeReferenceState(c *gin.Context) {
	var item model.CreativeReferenceState
	if !h.loadProjectItem(c, &item, c.Param("stateId")) {
		return
	}
	var req creativeReferenceStateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "creative_reference", req.CreativeReferenceID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"creative_reference_id": req.CreativeReferenceID,
		"scope_type":            req.ScopeType,
		"scope_id":              req.ScopeID,
		"name":                  req.Name,
		"description":           req.Description,
		"visual_notes":          req.VisualNotes,
		"emotion":               req.Emotion,
		"costume":               req.Costume,
		"props":                 req.Props,
		"status":                req.Status,
		"tags_json":             req.TagsJSON,
		"metadata_json":         req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListCreativeReferenceUsages(c *gin.Context) {
	var items []model.CreativeReferenceUsage
	q := h.db.Preload("CreativeReference").Preload("CreativeReferenceState").Where("project_id = ?", parseID(c.Param("id")))
	if ownerType := strings.TrimSpace(c.Query("owner_type")); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if ownerID := parseID(c.Query("owner_id")); ownerID > 0 {
		q = q.Where("owner_id = ?", ownerID)
	}
	if refID := parseID(c.Query("creative_reference_id")); refID > 0 {
		q = q.Where("creative_reference_id = ?", refID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("owner_type, owner_id, \"order\", id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReferenceUsage(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req creativeReferenceUsageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, req.OwnerType, req.OwnerID) ||
		!h.ownerInProject(c, "creative_reference", req.CreativeReferenceID) ||
		!h.optionalOwnerInProject(c, "creative_reference_state", req.CreativeReferenceStateID) {
		return
	}
	item := model.CreativeReferenceUsage{
		ProjectID:                projectID,
		OwnerType:                req.OwnerType,
		OwnerID:                  req.OwnerID,
		CreativeReferenceID:      req.CreativeReferenceID,
		CreativeReferenceStateID: req.CreativeReferenceStateID,
		Role:                     req.Role,
		Order:                    req.Order,
		Evidence:                 req.Evidence,
		Source:                   fallbackString(req.Source, "manual"),
		Status:                   fallbackString(req.Status, "draft"),
		MetadataJSON:             req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchCreativeReferenceUsage(c *gin.Context) {
	var item model.CreativeReferenceUsage
	if !h.loadProjectItem(c, &item, c.Param("usageId")) {
		return
	}
	var req creativeReferenceUsageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, req.OwnerType, req.OwnerID) ||
		!h.ownerInProject(c, "creative_reference", req.CreativeReferenceID) ||
		!h.optionalOwnerInProject(c, "creative_reference_state", req.CreativeReferenceStateID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"owner_type":                  req.OwnerType,
		"owner_id":                    req.OwnerID,
		"creative_reference_id":       req.CreativeReferenceID,
		"creative_reference_state_id": req.CreativeReferenceStateID,
		"role":                        req.Role,
		"order":                       req.Order,
		"evidence":                    req.Evidence,
		"source":                      req.Source,
		"status":                      req.Status,
		"metadata_json":               req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListCreativeRelationships(c *gin.Context) {
	var items []model.CreativeRelationship
	q := h.db.Preload("SourceCreativeReference").Preload("TargetCreativeReference").Where("project_id = ?", parseID(c.Param("id")))
	if refID := parseID(c.Query("creative_reference_id")); refID > 0 {
		q = q.Where("source_creative_reference_id = ? OR target_creative_reference_id = ?", refID, refID)
	}
	if scopeType := strings.TrimSpace(c.Query("scope_type")); scopeType != "" {
		q = q.Where("scope_type = ?", scopeType)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("scope_type, scope_id, id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeRelationship(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req creativeRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "creative_reference", req.SourceCreativeReferenceID) ||
		!h.ownerInProject(c, "creative_reference", req.TargetCreativeReferenceID) ||
		!h.optionalScopedOwnerInProject(c, req.ScopeType, req.ScopeID) {
		return
	}
	item := model.CreativeRelationship{
		ProjectID:                 projectID,
		SourceCreativeReferenceID: req.SourceCreativeReferenceID,
		TargetCreativeReferenceID: req.TargetCreativeReferenceID,
		ScopeType:                 req.ScopeType,
		ScopeID:                   req.ScopeID,
		Category:                  fallbackString(req.Category, "relationship"),
		Type:                      req.Type,
		Label:                     req.Label,
		Description:               req.Description,
		Source:                    fallbackString(req.Source, "manual"),
		Status:                    fallbackString(req.Status, "draft"),
		Evidence:                  req.Evidence,
		MetadataJSON:              req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchCreativeRelationship(c *gin.Context) {
	var item model.CreativeRelationship
	if !h.loadProjectItem(c, &item, c.Param("relationshipId")) {
		return
	}
	var req creativeRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "creative_reference", req.SourceCreativeReferenceID) ||
		!h.ownerInProject(c, "creative_reference", req.TargetCreativeReferenceID) ||
		!h.optionalScopedOwnerInProject(c, req.ScopeType, req.ScopeID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"source_creative_reference_id": req.SourceCreativeReferenceID,
		"target_creative_reference_id": req.TargetCreativeReferenceID,
		"scope_type":                   req.ScopeType,
		"scope_id":                     req.ScopeID,
		"category":                     req.Category,
		"type":                         req.Type,
		"label":                        req.Label,
		"description":                  req.Description,
		"source":                       req.Source,
		"status":                       req.Status,
		"evidence":                     req.Evidence,
		"metadata_json":                req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListAssetSlots(c *gin.Context) {
	var items []model.AssetSlot
	q := h.db.Preload("Resource").Preload("LockedAssetSlot.Resource").Where("project_id = ?", parseID(c.Param("id")))
	if productionID := parseID(c.Query("production_id")); productionID > 0 {
		q = q.Where("production_id = ?", productionID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if ownerType := strings.TrimSpace(c.Query("owner_type")); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if err := q.Order("status, priority desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateAssetSlot(c *gin.Context) {
	var req assetSlotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	item := model.AssetSlot{
		ProjectID:                parseID(c.Param("id")),
		ProductionID:             req.ProductionID,
		CreativeReferenceID:      req.CreativeReferenceID,
		CreativeReferenceStateID: req.CreativeReferenceStateID,
		OwnerType:                req.OwnerType,
		OwnerID:                  req.OwnerID,
		Kind:                     fallbackString(req.Kind, "image"),
		Name:                     req.Name,
		Description:              req.Description,
		SlotKey:                  req.SlotKey,
		PromptHint:               req.PromptHint,
		Status:                   fallbackString(req.Status, "missing"),
		Priority:                 fallbackString(req.Priority, "normal"),
		ResourceID:               req.ResourceID,
		LockedAssetSlotID:        req.LockedAssetSlotID,
		MetadataJSON:             req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchAssetSlot(c *gin.Context) {
	var item model.AssetSlot
	if !h.loadProjectItem(c, &item, c.Param("slotId")) {
		return
	}
	var req assetSlotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"production_id":               req.ProductionID,
		"creative_reference_id":       req.CreativeReferenceID,
		"creative_reference_state_id": req.CreativeReferenceStateID,
		"owner_type":                  req.OwnerType,
		"owner_id":                    req.OwnerID,
		"kind":                        req.Kind,
		"name":                        req.Name,
		"description":                 req.Description,
		"slot_key":                    req.SlotKey,
		"prompt_hint":                 req.PromptHint,
		"status":                      req.Status,
		"priority":                    req.Priority,
		"resource_id":                 req.ResourceID,
		"locked_asset_slot_id":        req.LockedAssetSlotID,
		"metadata_json":               req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListAssetSlotCandidates(c *gin.Context) {
	var items []model.AssetSlotCandidate
	q := h.db.Preload("CandidateAssetSlot.Resource").Where("project_id = ?", parseID(c.Param("id")))
	if slotID := parseID(c.Query("asset_slot_id")); slotID > 0 {
		q = q.Where("asset_slot_id = ?", slotID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("asset_slot_id, score desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateAssetSlotCandidate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req assetSlotCandidateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "asset_slot", req.AssetSlotID) || !h.ownerInProject(c, "asset_slot", req.CandidateAssetSlotID) {
		return
	}
	item := model.AssetSlotCandidate{
		ProjectID:            projectID,
		AssetSlotID:          req.AssetSlotID,
		CandidateAssetSlotID: req.CandidateAssetSlotID,
		SourceType:           fallbackString(req.SourceType, "manual"),
		SourceID:             req.SourceID,
		Score:                req.Score,
		Status:               fallbackString(req.Status, "candidate"),
		Note:                 req.Note,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchAssetSlotCandidate(c *gin.Context) {
	var item model.AssetSlotCandidate
	if !h.loadProjectItem(c, &item, c.Param("candidateId")) {
		return
	}
	var req assetSlotCandidateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "asset_slot", req.AssetSlotID) || !h.ownerInProject(c, "asset_slot", req.CandidateAssetSlotID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"asset_slot_id":           req.AssetSlotID,
		"candidate_asset_slot_id": req.CandidateAssetSlotID,
		"source_type":             req.SourceType,
		"source_id":               req.SourceID,
		"score":                   req.Score,
		"status":                  req.Status,
		"note":                    req.Note,
	}))
}

func (h *SemanticEntityHandler) ListCandidateDecisions(c *gin.Context) {
	var items []model.CandidateDecision
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if candidateType := strings.TrimSpace(c.Query("candidate_type")); candidateType != "" {
		q = q.Where("candidate_type = ?", candidateType)
	}
	if candidateID := parseID(c.Query("candidate_id")); candidateID > 0 {
		q = q.Where("candidate_id = ?", candidateID)
	}
	if candidateClientID := strings.TrimSpace(c.Query("candidate_client_id")); candidateClientID != "" {
		q = q.Where("candidate_client_id = ?", candidateClientID)
	}
	if decision := strings.TrimSpace(c.Query("decision")); decision != "" {
		q = q.Where("decision = ?", decision)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCandidateDecision(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req candidateDecisionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalScopedOwnerInProject(c, req.CandidateType, req.CandidateID) ||
		!h.optionalScopedOwnerInProject(c, req.TargetType, req.TargetID) {
		return
	}
	item := model.CandidateDecision{
		ProjectID:         projectID,
		CandidateType:     req.CandidateType,
		CandidateID:       req.CandidateID,
		CandidateClientID: req.CandidateClientID,
		TargetType:        req.TargetType,
		TargetID:          req.TargetID,
		Decision:          req.Decision,
		Status:            fallbackString(req.Status, "recorded"),
		Reason:            req.Reason,
		Note:              req.Note,
		Source:            fallbackString(req.Source, "manual"),
		DecidedByID:       req.DecidedByID,
		AppliedAt:         req.AppliedAt,
		MetadataJSON:      req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchCandidateDecision(c *gin.Context) {
	var item model.CandidateDecision
	if !h.loadProjectItem(c, &item, c.Param("decisionId")) {
		return
	}
	var req candidateDecisionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalScopedOwnerInProject(c, req.CandidateType, req.CandidateID) ||
		!h.optionalScopedOwnerInProject(c, req.TargetType, req.TargetID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"candidate_type":      req.CandidateType,
		"candidate_id":        req.CandidateID,
		"candidate_client_id": req.CandidateClientID,
		"target_type":         req.TargetType,
		"target_id":           req.TargetID,
		"decision":            req.Decision,
		"status":              req.Status,
		"reason":              req.Reason,
		"note":                req.Note,
		"source":              req.Source,
		"decided_by_id":       req.DecidedByID,
		"applied_at":          req.AppliedAt,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListReviewEvents(c *gin.Context) {
	var items []model.ReviewEvent
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if subjectType := strings.TrimSpace(c.Query("subject_type")); subjectType != "" {
		q = q.Where("subject_type = ?", subjectType)
	}
	if subjectID := parseID(c.Query("subject_id")); subjectID > 0 {
		q = q.Where("subject_id = ?", subjectID)
	}
	if subjectClientID := strings.TrimSpace(c.Query("subject_client_id")); subjectClientID != "" {
		q = q.Where("subject_client_id = ?", subjectClientID)
	}
	if eventType := strings.TrimSpace(c.Query("event_type")); eventType != "" {
		q = q.Where("event_type = ?", eventType)
	}
	if err := q.Order("id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateReviewEvent(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req reviewEventInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalScopedOwnerInProject(c, req.SubjectType, req.SubjectID) {
		return
	}
	item := model.ReviewEvent{
		ProjectID:       projectID,
		SubjectType:     req.SubjectType,
		SubjectID:       req.SubjectID,
		SubjectClientID: req.SubjectClientID,
		EventType:       req.EventType,
		FromStatus:      req.FromStatus,
		ToStatus:        req.ToStatus,
		Comment:         req.Comment,
		Reason:          req.Reason,
		Source:          fallbackString(req.Source, "manual"),
		ActorID:         req.ActorID,
		MetadataJSON:    req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchReviewEvent(c *gin.Context) {
	var item model.ReviewEvent
	if !h.loadProjectItem(c, &item, c.Param("eventId")) {
		return
	}
	var req reviewEventInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalScopedOwnerInProject(c, req.SubjectType, req.SubjectID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"subject_type":      req.SubjectType,
		"subject_id":        req.SubjectID,
		"subject_client_id": req.SubjectClientID,
		"event_type":        req.EventType,
		"from_status":       req.FromStatus,
		"to_status":         req.ToStatus,
		"comment":           req.Comment,
		"reason":            req.Reason,
		"source":            req.Source,
		"actor_id":          req.ActorID,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListWorkItems(c *gin.Context) {
	var items []model.WorkItem
	q := h.db.Preload("Assignee").Where("project_id = ?", parseID(c.Param("id")))
	if productionID := parseID(c.Query("production_id")); productionID > 0 {
		q = q.Where("production_id = ?", productionID)
	}
	if targetType := strings.TrimSpace(c.Query("target_type")); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("status, priority desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkItem(c *gin.Context) {
	var req workItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	item := model.WorkItem{
		ProjectID:      parseID(c.Param("id")),
		ProductionID:   req.ProductionID,
		TargetType:     req.TargetType,
		TargetID:       req.TargetID,
		Kind:           fallbackString(req.Kind, "human"),
		Title:          req.Title,
		Description:    req.Description,
		Status:         fallbackString(req.Status, "todo"),
		Priority:       fallbackString(req.Priority, "normal"),
		AssigneeID:     req.AssigneeID,
		SourceJobID:    req.SourceJobID,
		SourceCanvasID: req.SourceCanvasID,
		MetadataJSON:   req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchWorkItem(c *gin.Context) {
	var item model.WorkItem
	if !h.loadProjectItem(c, &item, c.Param("workItemId")) {
		return
	}
	var req workItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"production_id":    req.ProductionID,
		"target_type":      req.TargetType,
		"target_id":        req.TargetID,
		"kind":             req.Kind,
		"title":            req.Title,
		"description":      req.Description,
		"status":           req.Status,
		"priority":         req.Priority,
		"assignee_id":      req.AssigneeID,
		"source_job_id":    req.SourceJobID,
		"source_canvas_id": req.SourceCanvasID,
		"metadata_json":    req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListWorkReviews(c *gin.Context) {
	var items []model.WorkReview
	q := h.db.Preload("Reviewer").Where("project_id = ?", parseID(c.Param("id")))
	if workItemID := parseID(c.Query("work_item_id")); workItemID > 0 {
		q = q.Where("work_item_id = ?", workItemID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("work_item_id, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req workReviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "work_item", req.WorkItemID) {
		return
	}
	item := model.WorkReview{
		ProjectID:    projectID,
		WorkItemID:   req.WorkItemID,
		ReviewerID:   req.ReviewerID,
		Status:       fallbackString(req.Status, "pending"),
		Comment:      req.Comment,
		MetadataJSON: req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchWorkReview(c *gin.Context) {
	var item model.WorkReview
	if !h.loadProjectItem(c, &item, c.Param("reviewId")) {
		return
	}
	var req workReviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "work_item", req.WorkItemID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"work_item_id":  req.WorkItemID,
		"reviewer_id":   req.ReviewerID,
		"status":        req.Status,
		"comment":       req.Comment,
		"metadata_json": req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListWorkDependencies(c *gin.Context) {
	var items []model.WorkDependency
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if workItemID := parseID(c.Query("work_item_id")); workItemID > 0 {
		q = q.Where("work_item_id = ?", workItemID)
	}
	if err := q.Order("work_item_id, id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req workDependencyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "work_item", req.WorkItemID) || !h.ownerInProject(c, "work_item", req.DependsOnWorkItemID) {
		return
	}
	item := model.WorkDependency{
		ProjectID:           projectID,
		WorkItemID:          req.WorkItemID,
		DependsOnWorkItemID: req.DependsOnWorkItemID,
		DependencyType:      fallbackString(req.DependencyType, "blocks"),
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchWorkDependency(c *gin.Context) {
	var item model.WorkDependency
	if !h.loadProjectItem(c, &item, c.Param("dependencyId")) {
		return
	}
	var req workDependencyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "work_item", req.WorkItemID) || !h.ownerInProject(c, "work_item", req.DependsOnWorkItemID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"work_item_id":            req.WorkItemID,
		"depends_on_work_item_id": req.DependsOnWorkItemID,
		"dependency_type":         req.DependencyType,
	}))
}

func (h *SemanticEntityHandler) ListDeliveryVersions(c *gin.Context) {
	var items []model.DeliveryVersion
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if productionID := parseID(c.Query("production_id")); productionID > 0 {
		q = q.Where("production_id = ?", productionID)
	}
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateDeliveryVersion(c *gin.Context) {
	var req deliveryVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	item := model.DeliveryVersion{
		ProjectID:         parseID(c.Param("id")),
		ProductionID:      req.ProductionID,
		PreviewTimelineID: req.PreviewTimelineID,
		Name:              req.Name,
		Description:       req.Description,
		Status:            fallbackString(req.Status, "draft"),
		IsPrimary:         req.IsPrimary,
		DurationSec:       req.DurationSec,
		MetadataJSON:      req.MetadataJSON,
	}
	if item.Name == "" {
		item.Name = "Delivery"
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchDeliveryVersion(c *gin.Context) {
	var item model.DeliveryVersion
	if !h.loadProjectItem(c, &item, c.Param("deliveryVersionId")) {
		return
	}
	var req deliveryVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "production", req.ProductionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"production_id":       req.ProductionID,
		"preview_timeline_id": req.PreviewTimelineID,
		"name":                req.Name,
		"description":         req.Description,
		"status":              req.Status,
		"is_primary":          &req.IsPrimary,
		"duration_sec":        req.DurationSec,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListDeliveryTimelineItems(c *gin.Context) {
	var items []model.DeliveryTimelineItem
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if deliveryVersionID := parseID(c.Query("delivery_version_id")); deliveryVersionID > 0 {
		q = q.Where("delivery_version_id = ?", deliveryVersionID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("delivery_version_id, \"order\", id").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateDeliveryTimelineItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req deliveryTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "delivery_version", req.DeliveryVersionID) ||
		!h.optionalOwnerInProject(c, "content_unit", req.ContentUnitID) ||
		!h.optionalOwnerInProject(c, "asset_slot", req.AssetSlotID) ||
		!h.optionalOwnerInProject(c, "resource", req.ResourceID) {
		return
	}
	item := model.DeliveryTimelineItem{
		ProjectID:         projectID,
		DeliveryVersionID: req.DeliveryVersionID,
		ContentUnitID:     req.ContentUnitID,
		AssetSlotID:       req.AssetSlotID,
		ResourceID:        req.ResourceID,
		Kind:              fallbackString(req.Kind, "video"),
		Order:             req.Order,
		StartSec:          req.StartSec,
		DurationSec:       req.DurationSec,
		Label:             req.Label,
		Status:            fallbackString(req.Status, "draft"),
		MetadataJSON:      req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchDeliveryTimelineItem(c *gin.Context) {
	var item model.DeliveryTimelineItem
	if !h.loadProjectItem(c, &item, c.Param("itemId")) {
		return
	}
	var req deliveryTimelineItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "delivery_version", req.DeliveryVersionID) ||
		!h.optionalOwnerInProject(c, "content_unit", req.ContentUnitID) ||
		!h.optionalOwnerInProject(c, "asset_slot", req.AssetSlotID) ||
		!h.optionalOwnerInProject(c, "resource", req.ResourceID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"delivery_version_id": req.DeliveryVersionID,
		"content_unit_id":     req.ContentUnitID,
		"asset_slot_id":       req.AssetSlotID,
		"resource_id":         req.ResourceID,
		"kind":                req.Kind,
		"order":               req.Order,
		"start_sec":           req.StartSec,
		"duration_sec":        req.DurationSec,
		"label":               req.Label,
		"status":              req.Status,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListExportRecords(c *gin.Context) {
	var items []model.ExportRecord
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if deliveryVersionID := parseID(c.Query("delivery_version_id")); deliveryVersionID > 0 {
		q = q.Where("delivery_version_id = ?", deliveryVersionID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("delivery_version_id, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateExportRecord(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req exportRecordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "delivery_version", req.DeliveryVersionID) || !h.optionalOwnerInProject(c, "resource", req.ResourceID) {
		return
	}
	item := model.ExportRecord{
		ProjectID:         projectID,
		DeliveryVersionID: req.DeliveryVersionID,
		ResourceID:        req.ResourceID,
		Status:            fallbackString(req.Status, "pending"),
		Format:            req.Format,
		Preset:            req.Preset,
		Error:             req.Error,
		MetadataJSON:      req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchExportRecord(c *gin.Context) {
	var item model.ExportRecord
	if !h.loadProjectItem(c, &item, c.Param("exportId")) {
		return
	}
	var req exportRecordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "delivery_version", req.DeliveryVersionID) || !h.optionalOwnerInProject(c, "resource", req.ResourceID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"delivery_version_id": req.DeliveryVersionID,
		"resource_id":         req.ResourceID,
		"status":              req.Status,
		"format":              req.Format,
		"preset":              req.Preset,
		"error":               req.Error,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) ListCanvasOutputs(c *gin.Context) {
	var items []model.CanvasOutput
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if canvasID := parseID(c.Query("canvas_id")); canvasID > 0 {
		q = q.Where("canvas_id = ?", canvasID)
	}
	if ownerType := strings.TrimSpace(c.Query("owner_type")); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Order("canvas_id, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCanvasOutput(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req canvasOutputInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "canvas", req.CanvasID) ||
		!h.ownerInProject(c, req.OwnerType, req.OwnerID) ||
		!h.optionalOwnerInProject(c, "canvas_run", req.CanvasRunID) ||
		!h.optionalOwnerInProject(c, "resource", req.ResourceID) {
		return
	}
	item := model.CanvasOutput{
		ProjectID:    projectID,
		CanvasID:     req.CanvasID,
		CanvasRunID:  req.CanvasRunID,
		CanvasNodeID: req.CanvasNodeID,
		PortID:       req.PortID,
		OwnerType:    req.OwnerType,
		OwnerID:      req.OwnerID,
		OutputType:   fallbackString(req.OutputType, "resource"),
		ResourceID:   req.ResourceID,
		TargetField:  req.TargetField,
		ValueJSON:    req.ValueJSON,
		Status:       fallbackString(req.Status, "pending"),
		MetadataJSON: req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *SemanticEntityHandler) PatchCanvasOutput(c *gin.Context) {
	var item model.CanvasOutput
	if !h.loadProjectItem(c, &item, c.Param("outputId")) {
		return
	}
	var req canvasOutputInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.ownerInProject(c, "canvas", req.CanvasID) ||
		!h.ownerInProject(c, req.OwnerType, req.OwnerID) ||
		!h.optionalOwnerInProject(c, "canvas_run", req.CanvasRunID) ||
		!h.optionalOwnerInProject(c, "resource", req.ResourceID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"canvas_id":      req.CanvasID,
		"canvas_run_id":  req.CanvasRunID,
		"canvas_node_id": req.CanvasNodeID,
		"port_id":        req.PortID,
		"owner_type":     req.OwnerType,
		"owner_id":       req.OwnerID,
		"output_type":    req.OutputType,
		"resource_id":    req.ResourceID,
		"target_field":   req.TargetField,
		"value_json":     req.ValueJSON,
		"status":         req.Status,
		"metadata_json":  req.MetadataJSON,
	}))
}

func (h *SemanticEntityHandler) DeleteSemanticItem(c *gin.Context, item any, id string) {
	if !h.loadProjectItem(c, item, id) {
		return
	}
	if err := h.db.Delete(item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SemanticEntityHandler) createItem(c *gin.Context, item any) {
	if err := h.db.Create(item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) patchItem(c *gin.Context, item any, updates map[string]any) {
	if len(updates) > 0 {
		if err := h.db.Model(item).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return
		}
	}
	h.db.First(item)
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) loadProjectItem(c *gin.Context, item any, id string) bool {
	projectID := parseID(c.Param("id"))
	if err := h.db.Where("project_id = ?", projectID).First(item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("对象不存在"))
			return false
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return false
	}
	return true
}

func (h *SemanticEntityHandler) ownerInProject(c *gin.Context, ownerType string, ownerID uint) bool {
	if ownerID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner id is required"))
		return false
	}
	if err := h.ensureSemanticOwnerInProject(parseID(c.Param("id")), ownerType, ownerID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("关联对象不存在"))
			return false
		}
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("关联对象不属于当前项目"))
		return false
	}
	return true
}

func (h *SemanticEntityHandler) optionalOwnerInProject(c *gin.Context, ownerType string, ownerID *uint) bool {
	if ownerID == nil {
		return true
	}
	return h.ownerInProject(c, ownerType, *ownerID)
}

func (h *SemanticEntityHandler) optionalScopedOwnerInProject(c *gin.Context, ownerType string, ownerID *uint) bool {
	if strings.TrimSpace(ownerType) == "" || ownerID == nil {
		return true
	}
	return h.ownerInProject(c, ownerType, *ownerID)
}

func (h *SemanticEntityHandler) ensureSemanticOwnerInProject(projectID uint, ownerType string, ownerID uint) error {
	var ownerProjectID uint
	switch ownerType {
	case "script_version":
		var item model.ScriptVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "segment":
		var item model.Segment
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "scene_moment":
		var item model.SceneMoment
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "production":
		var item model.Production
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "storyboard_script":
		var item model.StoryboardScript
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "storyboard_version":
		var item model.StoryboardVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "storyboard_line":
		var item model.StoryboardLine
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "content_unit":
		var item model.ContentUnit
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "keyframe":
		var item model.Keyframe
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "preview_timeline":
		var item model.PreviewTimeline
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "creative_reference":
		var item model.CreativeReference
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "creative_reference_state":
		var item model.CreativeReferenceState
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "asset_slot":
		var item model.AssetSlot
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "asset_slot_candidate":
		var item model.AssetSlotCandidate
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "candidate_decision":
		var item model.CandidateDecision
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "review_event":
		var item model.ReviewEvent
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "work_item":
		var item model.WorkItem
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "delivery_version":
		var item model.DeliveryVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "canvas":
		var item model.Canvas
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		if item.ProjectID == nil {
			return gorm.ErrInvalidData
		}
		ownerProjectID = *item.ProjectID
	case "canvas_run":
		var item model.CanvasRun
		if err := h.db.Select("id, canvas_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		var canvas model.Canvas
		if err := h.db.Select("id, project_id").First(&canvas, item.CanvasID).Error; err != nil {
			return err
		}
		if canvas.ProjectID == nil {
			return gorm.ErrInvalidData
		}
		ownerProjectID = *canvas.ProjectID
	case "resource":
		var item model.RawResource
		if err := h.db.Select("id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = projectID
	default:
		return gorm.ErrInvalidData
	}
	if ownerProjectID != projectID {
		return gorm.ErrInvalidData
	}
	return nil
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

func currentUserID(c *gin.Context) *uint {
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		id := u.(*model.User).ID
		return &id
	}
	return nil
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

type scriptVersionInput struct {
	ScriptID        uint   `json:"script_id" binding:"required"`
	ParentVersionID *uint  `json:"parent_version_id"`
	VersionNumber   int    `json:"version_number"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type scriptVersionPatchInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type segmentInput struct {
	ScriptVersionID *uint  `json:"script_version_id"`
	ParentSegmentID *uint  `json:"parent_segment_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	SourceRange     string `json:"source_range"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type segmentPatchInput struct {
	ScriptVersionID *uint  `json:"script_version_id"`
	ParentSegmentID *uint  `json:"parent_segment_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	SourceRange     string `json:"source_range"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type sceneMomentInput struct {
	SegmentID     *uint  `json:"segment_id"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	TimeText      string `json:"time_text"`
	LocationText  string `json:"location_text"`
	ConditionText string `json:"condition_text"`
	ActionText    string `json:"action_text"`
	Mood          string `json:"mood"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type sceneMomentPatchInput = sceneMomentInput

type storyboardScriptInput struct {
	ScriptVersionID *uint  `json:"script_version_id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Status          string `json:"status"`
	IsPrimary       bool   `json:"is_primary"`
	MetadataJSON    string `json:"metadata_json"`
}

type storyboardVersionInput struct {
	StoryboardScriptID uint   `json:"storyboard_script_id" binding:"required"`
	ParentVersionID    *uint  `json:"parent_version_id"`
	VersionNumber      int    `json:"version_number"`
	Title              string `json:"title"`
	Source             string `json:"source"`
	Status             string `json:"status"`
	SnapshotJSON       string `json:"snapshot_json"`
	MetadataJSON       string `json:"metadata_json"`
}

type storyboardVersionPatchInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	Source          string `json:"source"`
	Status          string `json:"status"`
	SnapshotJSON    string `json:"snapshot_json"`
	MetadataJSON    string `json:"metadata_json"`
}

type storyboardLineInput struct {
	StoryboardScriptID  uint    `json:"storyboard_script_id" binding:"required"`
	StoryboardVersionID *uint   `json:"storyboard_version_id"`
	SegmentID           *uint   `json:"segment_id"`
	SceneMomentID       *uint   `json:"scene_moment_id"`
	Order               int     `json:"order"`
	Kind                string  `json:"kind"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	Dialogue            string  `json:"dialogue"`
	VisualIntent        string  `json:"visual_intent"`
	DurationSec         float64 `json:"duration_sec"`
	Status              string  `json:"status"`
	MetadataJSON        string  `json:"metadata_json"`
}

type productionInput struct {
	ScriptVersionID   *uint  `json:"script_version_id"`
	PreviewTimelineID *uint  `json:"preview_timeline_id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Status            string `json:"status"`
	SourceType        string `json:"source_type"`
	OwnerLabel        string `json:"owner_label"`
	Progress          int    `json:"progress"`
	MetadataJSON      string `json:"metadata_json"`
}

type contentUnitInput struct {
	ProductionID  *uint   `json:"production_id"`
	SegmentID     *uint   `json:"segment_id"`
	SceneMomentID *uint   `json:"scene_moment_id"`
	Kind          string  `json:"kind"`
	Order         int     `json:"order"`
	Title         string  `json:"title"`
	Description   string  `json:"description"`
	Prompt        string  `json:"prompt"`
	DurationSec   float64 `json:"duration_sec"`
	Status        string  `json:"status"`
	MetadataJSON  string  `json:"metadata_json"`
}

type contentUnitPatchInput = contentUnitInput

type keyframeInput struct {
	ProductionID  *uint  `json:"production_id"`
	SceneMomentID *uint  `json:"scene_moment_id"`
	ContentUnitID *uint  `json:"content_unit_id"`
	ResourceID    *uint  `json:"resource_id"`
	CanvasID      *uint  `json:"canvas_id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	Order         int    `json:"order"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type previewTimelineInput struct {
	ProductionID    *uint   `json:"production_id"`
	ScriptVersionID *uint   `json:"script_version_id"`
	Name            string  `json:"name"`
	Status          string  `json:"status"`
	DurationSec     float64 `json:"duration_sec"`
	IsPrimary       bool    `json:"is_primary"`
	MetadataJSON    string  `json:"metadata_json"`
}

type previewTimelineItemInput struct {
	PreviewTimelineID uint    `json:"preview_timeline_id"`
	SegmentID         *uint   `json:"segment_id"`
	SceneMomentID     *uint   `json:"scene_moment_id"`
	ContentUnitID     *uint   `json:"content_unit_id"`
	KeyframeID        *uint   `json:"keyframe_id"`
	Kind              string  `json:"kind"`
	Order             int     `json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `json:"status"`
	MetadataJSON      string  `json:"metadata_json"`
}

type creativeReferenceInput struct {
	SourceScriptID   *uint  `json:"source_script_id"`
	SourceAnalysisID *uint  `json:"source_analysis_id"`
	LegacySettingID  *uint  `json:"legacy_setting_id"`
	Kind             string `json:"kind" binding:"required"`
	Name             string `json:"name" binding:"required"`
	Alias            string `json:"alias"`
	Description      string `json:"description"`
	Content          string `json:"content"`
	Importance       string `json:"importance"`
	Status           string `json:"status"`
	ProfileJSON      string `json:"profile_json"`
	TagsJSON         string `json:"tags_json"`
}

type creativeReferenceStateInput struct {
	CreativeReferenceID uint   `json:"creative_reference_id" binding:"required"`
	ScopeType           string `json:"scope_type" binding:"required"`
	ScopeID             *uint  `json:"scope_id"`
	Name                string `json:"name" binding:"required"`
	Description         string `json:"description"`
	VisualNotes         string `json:"visual_notes"`
	Emotion             string `json:"emotion"`
	Costume             string `json:"costume"`
	Props               string `json:"props"`
	Status              string `json:"status"`
	TagsJSON            string `json:"tags_json"`
	MetadataJSON        string `json:"metadata_json"`
}

type creativeReferenceUsageInput struct {
	OwnerType                string `json:"owner_type" binding:"required"`
	OwnerID                  uint   `json:"owner_id" binding:"required"`
	CreativeReferenceID      uint   `json:"creative_reference_id" binding:"required"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	Role                     string `json:"role"`
	Order                    int    `json:"order"`
	Evidence                 string `json:"evidence"`
	Source                   string `json:"source"`
	Status                   string `json:"status"`
	MetadataJSON             string `json:"metadata_json"`
}

type creativeRelationshipInput struct {
	SourceCreativeReferenceID uint   `json:"source_creative_reference_id" binding:"required"`
	TargetCreativeReferenceID uint   `json:"target_creative_reference_id" binding:"required"`
	ScopeType                 string `json:"scope_type"`
	ScopeID                   *uint  `json:"scope_id"`
	Category                  string `json:"category"`
	Type                      string `json:"type"`
	Label                     string `json:"label"`
	Description               string `json:"description"`
	Source                    string `json:"source"`
	Status                    string `json:"status"`
	Evidence                  string `json:"evidence"`
	MetadataJSON              string `json:"metadata_json"`
}

type assetSlotInput struct {
	ProductionID             *uint  `json:"production_id"`
	CreativeReferenceID      *uint  `json:"creative_reference_id"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	OwnerType                string `json:"owner_type"`
	OwnerID                  *uint  `json:"owner_id"`
	Kind                     string `json:"kind"`
	Name                     string `json:"name" binding:"required"`
	Description              string `json:"description"`
	SlotKey                  string `json:"slot_key"`
	PromptHint               string `json:"prompt_hint"`
	Status                   string `json:"status"`
	Priority                 string `json:"priority"`
	ResourceID               *uint  `json:"resource_id"`
	LockedAssetSlotID        *uint  `json:"locked_asset_slot_id"`
	MetadataJSON             string `json:"metadata_json"`
}

type assetSlotCandidateInput struct {
	AssetSlotID          uint    `json:"asset_slot_id" binding:"required"`
	CandidateAssetSlotID uint    `json:"candidate_asset_slot_id" binding:"required"`
	SourceType           string  `json:"source_type"`
	SourceID             *uint   `json:"source_id"`
	Score                float64 `json:"score"`
	Status               string  `json:"status"`
	Note                 string  `json:"note"`
}

type candidateDecisionInput struct {
	CandidateType     string `json:"candidate_type" binding:"required"`
	CandidateID       *uint  `json:"candidate_id"`
	CandidateClientID string `json:"candidate_client_id"`
	TargetType        string `json:"target_type"`
	TargetID          *uint  `json:"target_id"`
	Decision          string `json:"decision" binding:"required"`
	Status            string `json:"status"`
	Reason            string `json:"reason"`
	Note              string `json:"note"`
	Source            string `json:"source"`
	DecidedByID       *uint  `json:"decided_by_id"`
	AppliedAt         string `json:"applied_at"`
	MetadataJSON      string `json:"metadata_json"`
}

type reviewEventInput struct {
	SubjectType     string `json:"subject_type" binding:"required"`
	SubjectID       *uint  `json:"subject_id"`
	SubjectClientID string `json:"subject_client_id"`
	EventType       string `json:"event_type" binding:"required"`
	FromStatus      string `json:"from_status"`
	ToStatus        string `json:"to_status"`
	Comment         string `json:"comment"`
	Reason          string `json:"reason"`
	Source          string `json:"source"`
	ActorID         *uint  `json:"actor_id"`
	MetadataJSON    string `json:"metadata_json"`
}

type workItemInput struct {
	ProductionID   *uint  `json:"production_id"`
	TargetType     string `json:"target_type" binding:"required"`
	TargetID       uint   `json:"target_id" binding:"required"`
	Kind           string `json:"kind"`
	Title          string `json:"title" binding:"required"`
	Description    string `json:"description"`
	Status         string `json:"status"`
	Priority       string `json:"priority"`
	AssigneeID     *uint  `json:"assignee_id"`
	SourceJobID    *uint  `json:"source_job_id"`
	SourceCanvasID *uint  `json:"source_canvas_id"`
	MetadataJSON   string `json:"metadata_json"`
}

type workReviewInput struct {
	WorkItemID   uint   `json:"work_item_id" binding:"required"`
	ReviewerID   *uint  `json:"reviewer_id"`
	Status       string `json:"status"`
	Comment      string `json:"comment"`
	MetadataJSON string `json:"metadata_json"`
}

type workDependencyInput struct {
	WorkItemID          uint   `json:"work_item_id" binding:"required"`
	DependsOnWorkItemID uint   `json:"depends_on_work_item_id" binding:"required"`
	DependencyType      string `json:"dependency_type"`
}

type deliveryVersionInput struct {
	ProductionID      *uint   `json:"production_id"`
	PreviewTimelineID *uint   `json:"preview_timeline_id"`
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Status            string  `json:"status"`
	IsPrimary         bool    `json:"is_primary"`
	DurationSec       float64 `json:"duration_sec"`
	MetadataJSON      string  `json:"metadata_json"`
}

type deliveryTimelineItemInput struct {
	DeliveryVersionID uint    `json:"delivery_version_id" binding:"required"`
	ContentUnitID     *uint   `json:"content_unit_id"`
	AssetSlotID       *uint   `json:"asset_slot_id"`
	ResourceID        *uint   `json:"resource_id"`
	Kind              string  `json:"kind"`
	Order             int     `json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `json:"status"`
	MetadataJSON      string  `json:"metadata_json"`
}

type exportRecordInput struct {
	DeliveryVersionID uint   `json:"delivery_version_id" binding:"required"`
	ResourceID        *uint  `json:"resource_id"`
	Status            string `json:"status"`
	Format            string `json:"format"`
	Preset            string `json:"preset"`
	Error             string `json:"error"`
	MetadataJSON      string `json:"metadata_json"`
}

type canvasOutputInput struct {
	CanvasID     uint   `json:"canvas_id" binding:"required"`
	CanvasRunID  *uint  `json:"canvas_run_id"`
	CanvasNodeID string `json:"canvas_node_id"`
	PortID       string `json:"port_id" binding:"required"`
	OwnerType    string `json:"owner_type" binding:"required"`
	OwnerID      uint   `json:"owner_id" binding:"required"`
	OutputType   string `json:"output_type"`
	ResourceID   *uint  `json:"resource_id"`
	TargetField  string `json:"target_field"`
	ValueJSON    string `json:"value_json"`
	Status       string `json:"status"`
	MetadataJSON string `json:"metadata_json"`
}
