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

type V2SemanticHandler struct{ db *gorm.DB }

func NewV2SemanticHandler(db *gorm.DB) *V2SemanticHandler {
	return &V2SemanticHandler{db: db}
}

func (h *V2SemanticHandler) ListScriptVersions(c *gin.Context) {
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

func (h *V2SemanticHandler) CreateScriptVersion(c *gin.Context) {
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

func (h *V2SemanticHandler) PatchScriptVersion(c *gin.Context) {
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

func (h *V2SemanticHandler) ListScriptSections(c *gin.Context) {
	var items []model.ScriptSection
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

func (h *V2SemanticHandler) CreateScriptSection(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req scriptSectionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var version model.ScriptVersion
	if err := h.db.First(&version, req.ScriptVersionID).Error; err != nil || version.ProjectID != projectID {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本版本不存在"))
		return
	}
	item := model.ScriptSection{
		ProjectID:       projectID,
		ScriptID:        version.ScriptID,
		ScriptVersionID: version.ID,
		ParentSectionID: req.ParentSectionID,
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

func (h *V2SemanticHandler) PatchScriptSection(c *gin.Context) {
	var item model.ScriptSection
	if !h.loadProjectItem(c, &item, c.Param("sectionId")) {
		return
	}
	var req scriptSectionPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"parent_section_id": req.ParentSectionID,
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

func (h *V2SemanticHandler) ListSituations(c *gin.Context) {
	var items []model.Situation
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if sectionID := parseID(c.Query("script_section_id")); sectionID > 0 {
		q = q.Where("script_section_id = ?", sectionID)
	}
	if err := q.Order(`script_section_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *V2SemanticHandler) CreateSituation(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req situationInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_section", req.ScriptSectionID) {
		return
	}
	item := model.Situation{
		ProjectID:       projectID,
		ScriptSectionID: req.ScriptSectionID,
		Order:           req.Order,
		Title:           req.Title,
		Description:     req.Description,
		TimeText:        req.TimeText,
		LocationText:    req.LocationText,
		ConditionText:   req.ConditionText,
		ActionText:      req.ActionText,
		Mood:            req.Mood,
		Status:          fallbackString(req.Status, "draft"),
		MetadataJSON:    req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *V2SemanticHandler) PatchSituation(c *gin.Context) {
	var item model.Situation
	if !h.loadProjectItem(c, &item, c.Param("situationId")) {
		return
	}
	var req situationPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_section", req.ScriptSectionID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"script_section_id": req.ScriptSectionID,
		"order":             req.Order,
		"title":             req.Title,
		"description":       req.Description,
		"time_text":         req.TimeText,
		"location_text":     req.LocationText,
		"condition_text":    req.ConditionText,
		"action_text":       req.ActionText,
		"mood":              req.Mood,
		"status":            req.Status,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *V2SemanticHandler) ListContentUnits(c *gin.Context) {
	var items []model.ContentUnit
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if sectionID := parseID(c.Query("script_section_id")); sectionID > 0 {
		q = q.Where("script_section_id = ?", sectionID)
	}
	if situationID := parseID(c.Query("situation_id")); situationID > 0 {
		q = q.Where("situation_id = ?", situationID)
	}
	if err := q.Order(`script_section_id, situation_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *V2SemanticHandler) CreateContentUnit(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req contentUnitInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_section", req.ScriptSectionID) || !h.optionalOwnerInProject(c, "situation", req.SituationID) {
		return
	}
	item := model.ContentUnit{
		ProjectID:       projectID,
		ScriptSectionID: req.ScriptSectionID,
		SituationID:     req.SituationID,
		Kind:            fallbackString(req.Kind, "shot"),
		Order:           req.Order,
		Title:           req.Title,
		Description:     req.Description,
		Prompt:          req.Prompt,
		DurationSec:     req.DurationSec,
		Status:          fallbackString(req.Status, "draft"),
		MetadataJSON:    req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *V2SemanticHandler) PatchContentUnit(c *gin.Context) {
	var item model.ContentUnit
	if !h.loadProjectItem(c, &item, c.Param("contentUnitId")) {
		return
	}
	var req contentUnitPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "script_section", req.ScriptSectionID) || !h.optionalOwnerInProject(c, "situation", req.SituationID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"script_section_id": req.ScriptSectionID,
		"situation_id":      req.SituationID,
		"kind":              req.Kind,
		"order":             req.Order,
		"title":             req.Title,
		"description":       req.Description,
		"prompt":            req.Prompt,
		"duration_sec":      req.DurationSec,
		"status":            req.Status,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *V2SemanticHandler) ListKeyframes(c *gin.Context) {
	var items []model.Keyframe
	q := h.db.Preload("Resource").Where("project_id = ?", parseID(c.Param("id")))
	if situationID := parseID(c.Query("situation_id")); situationID > 0 {
		q = q.Where("situation_id = ?", situationID)
	}
	if contentUnitID := parseID(c.Query("content_unit_id")); contentUnitID > 0 {
		q = q.Where("content_unit_id = ?", contentUnitID)
	}
	if err := q.Order(`content_unit_id, situation_id, "order", id`).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateKeyframeResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *V2SemanticHandler) CreateKeyframe(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req keyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "situation", req.SituationID) || !h.optionalOwnerInProject(c, "content_unit", req.ContentUnitID) {
		return
	}
	item := model.Keyframe{
		ProjectID:     projectID,
		SituationID:   req.SituationID,
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

func (h *V2SemanticHandler) PatchKeyframe(c *gin.Context) {
	var item model.Keyframe
	if !h.loadProjectItem(c, &item, c.Param("keyframeId")) {
		return
	}
	var req keyframeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if !h.optionalOwnerInProject(c, "situation", req.SituationID) || !h.optionalOwnerInProject(c, "content_unit", req.ContentUnitID) {
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"situation_id":    req.SituationID,
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

func (h *V2SemanticHandler) ListPreviewTimelines(c *gin.Context) {
	var items []model.PreviewTimeline
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *V2SemanticHandler) CreatePreviewTimeline(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req previewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item := model.PreviewTimeline{
		ProjectID:       projectID,
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

func (h *V2SemanticHandler) PatchPreviewTimeline(c *gin.Context) {
	var item model.PreviewTimeline
	if !h.loadProjectItem(c, &item, c.Param("timelineId")) {
		return
	}
	var req previewTimelineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"script_version_id": req.ScriptVersionID,
		"name":              req.Name,
		"status":            req.Status,
		"duration_sec":      req.DurationSec,
		"is_primary":        &req.IsPrimary,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *V2SemanticHandler) ListPreviewTimelineItems(c *gin.Context) {
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

func (h *V2SemanticHandler) CreatePreviewTimelineItem(c *gin.Context) {
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
		ScriptSectionID:   req.ScriptSectionID,
		SituationID:       req.SituationID,
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

func (h *V2SemanticHandler) PatchPreviewTimelineItem(c *gin.Context) {
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
		"script_section_id": req.ScriptSectionID,
		"situation_id":      req.SituationID,
		"content_unit_id":   req.ContentUnitID,
		"keyframe_id":       req.KeyframeID,
		"kind":              req.Kind,
		"order":             req.Order,
		"start_sec":         req.StartSec,
		"duration_sec":      req.DurationSec,
		"label":             req.Label,
		"status":            req.Status,
		"metadata_json":     req.MetadataJSON,
	}))
}

func (h *V2SemanticHandler) ListCreativeReferences(c *gin.Context) {
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

func (h *V2SemanticHandler) CreateCreativeReference(c *gin.Context) {
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

func (h *V2SemanticHandler) PatchCreativeReference(c *gin.Context) {
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

func (h *V2SemanticHandler) ListCreativeReferenceStates(c *gin.Context) {
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

func (h *V2SemanticHandler) CreateCreativeReferenceState(c *gin.Context) {
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

func (h *V2SemanticHandler) PatchCreativeReferenceState(c *gin.Context) {
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

func (h *V2SemanticHandler) ListCreativeReferenceUsages(c *gin.Context) {
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

func (h *V2SemanticHandler) CreateCreativeReferenceUsage(c *gin.Context) {
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

func (h *V2SemanticHandler) PatchCreativeReferenceUsage(c *gin.Context) {
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

func (h *V2SemanticHandler) ListCreativeRelationships(c *gin.Context) {
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

func (h *V2SemanticHandler) CreateCreativeRelationship(c *gin.Context) {
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

func (h *V2SemanticHandler) PatchCreativeRelationship(c *gin.Context) {
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

func (h *V2SemanticHandler) ListAssetRequirements(c *gin.Context) {
	var items []model.AssetRequirement
	q := h.db.Preload("LockedAsset").Where("project_id = ?", parseID(c.Param("id")))
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

func (h *V2SemanticHandler) CreateAssetRequirement(c *gin.Context) {
	var req assetRequirementInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item := model.AssetRequirement{
		ProjectID:                parseID(c.Param("id")),
		CreativeReferenceID:      req.CreativeReferenceID,
		CreativeReferenceStateID: req.CreativeReferenceStateID,
		OwnerType:                req.OwnerType,
		OwnerID:                  req.OwnerID,
		Kind:                     fallbackString(req.Kind, "image"),
		Name:                     req.Name,
		Description:              req.Description,
		RequiredSlot:             req.RequiredSlot,
		PromptHint:               req.PromptHint,
		Status:                   fallbackString(req.Status, "missing"),
		Priority:                 fallbackString(req.Priority, "normal"),
		LockedAssetID:            req.LockedAssetID,
		MetadataJSON:             req.MetadataJSON,
	}
	h.createItem(c, &item)
}

func (h *V2SemanticHandler) PatchAssetRequirement(c *gin.Context) {
	var item model.AssetRequirement
	if !h.loadProjectItem(c, &item, c.Param("requirementId")) {
		return
	}
	var req assetRequirementInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"creative_reference_id":       req.CreativeReferenceID,
		"creative_reference_state_id": req.CreativeReferenceStateID,
		"owner_type":                  req.OwnerType,
		"owner_id":                    req.OwnerID,
		"kind":                        req.Kind,
		"name":                        req.Name,
		"description":                 req.Description,
		"required_slot":               req.RequiredSlot,
		"prompt_hint":                 req.PromptHint,
		"status":                      req.Status,
		"priority":                    req.Priority,
		"locked_asset_id":             req.LockedAssetID,
		"metadata_json":               req.MetadataJSON,
	}))
}

func (h *V2SemanticHandler) ListWorkItems(c *gin.Context) {
	var items []model.WorkItem
	q := h.db.Preload("Assignee").Where("project_id = ?", parseID(c.Param("id")))
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

func (h *V2SemanticHandler) CreateWorkItem(c *gin.Context) {
	var req workItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item := model.WorkItem{
		ProjectID:      parseID(c.Param("id")),
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

func (h *V2SemanticHandler) PatchWorkItem(c *gin.Context) {
	var item model.WorkItem
	if !h.loadProjectItem(c, &item, c.Param("workItemId")) {
		return
	}
	var req workItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
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

func (h *V2SemanticHandler) ListDeliveryVersions(c *gin.Context) {
	var items []model.DeliveryVersion
	q := h.db.Where("project_id = ?", parseID(c.Param("id")))
	if err := q.Order("is_primary desc, id desc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *V2SemanticHandler) CreateDeliveryVersion(c *gin.Context) {
	var req deliveryVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item := model.DeliveryVersion{
		ProjectID:         parseID(c.Param("id")),
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

func (h *V2SemanticHandler) PatchDeliveryVersion(c *gin.Context) {
	var item model.DeliveryVersion
	if !h.loadProjectItem(c, &item, c.Param("deliveryVersionId")) {
		return
	}
	var req deliveryVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.patchItem(c, &item, compactUpdates(map[string]any{
		"preview_timeline_id": req.PreviewTimelineID,
		"name":                req.Name,
		"description":         req.Description,
		"status":              req.Status,
		"is_primary":          &req.IsPrimary,
		"duration_sec":        req.DurationSec,
		"metadata_json":       req.MetadataJSON,
	}))
}

func (h *V2SemanticHandler) DeleteV2Item(c *gin.Context, item any, id string) {
	if !h.loadProjectItem(c, item, id) {
		return
	}
	if err := h.db.Delete(item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *V2SemanticHandler) createItem(c *gin.Context, item any) {
	if err := h.db.Create(item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *V2SemanticHandler) patchItem(c *gin.Context, item any, updates map[string]any) {
	if len(updates) > 0 {
		if err := h.db.Model(item).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return
		}
	}
	h.db.First(item)
	c.JSON(http.StatusOK, item)
}

func (h *V2SemanticHandler) loadProjectItem(c *gin.Context, item any, id string) bool {
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

func (h *V2SemanticHandler) ownerInProject(c *gin.Context, ownerType string, ownerID uint) bool {
	if ownerID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner id is required"))
		return false
	}
	if err := h.ensureV2OwnerInProject(parseID(c.Param("id")), ownerType, ownerID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("关联对象不存在"))
			return false
		}
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("关联对象不属于当前项目"))
		return false
	}
	return true
}

func (h *V2SemanticHandler) optionalOwnerInProject(c *gin.Context, ownerType string, ownerID *uint) bool {
	if ownerID == nil {
		return true
	}
	return h.ownerInProject(c, ownerType, *ownerID)
}

func (h *V2SemanticHandler) optionalScopedOwnerInProject(c *gin.Context, ownerType string, ownerID *uint) bool {
	if strings.TrimSpace(ownerType) == "" || ownerID == nil {
		return true
	}
	return h.ownerInProject(c, ownerType, *ownerID)
}

func (h *V2SemanticHandler) ensureV2OwnerInProject(projectID uint, ownerType string, ownerID uint) error {
	var ownerProjectID uint
	switch ownerType {
	case "script_version":
		var item model.ScriptVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "script_section":
		var item model.ScriptSection
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "situation":
		var item model.Situation
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
	default:
		return gorm.ErrInvalidData
	}
	if ownerProjectID != projectID {
		return gorm.ErrInvalidData
	}
	return nil
}

func (h *V2SemanticHandler) nextScriptVersionNumber(projectID uint, scriptID uint) int {
	var maxVersion int
	h.db.Model(&model.ScriptVersion{}).
		Select("COALESCE(MAX(version_number), 0)").
		Where("project_id = ? AND script_id = ?", projectID, scriptID).
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

type scriptSectionInput struct {
	ScriptVersionID uint   `json:"script_version_id" binding:"required"`
	ParentSectionID *uint  `json:"parent_section_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	SourceRange     string `json:"source_range"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type scriptSectionPatchInput struct {
	ParentSectionID *uint  `json:"parent_section_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	SourceRange     string `json:"source_range"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type situationInput struct {
	ScriptSectionID *uint  `json:"script_section_id"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	TimeText        string `json:"time_text"`
	LocationText    string `json:"location_text"`
	ConditionText   string `json:"condition_text"`
	ActionText      string `json:"action_text"`
	Mood            string `json:"mood"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type situationPatchInput = situationInput

type contentUnitInput struct {
	ScriptSectionID *uint   `json:"script_section_id"`
	SituationID     *uint   `json:"situation_id"`
	Kind            string  `json:"kind"`
	Order           int     `json:"order"`
	Title           string  `json:"title"`
	Description     string  `json:"description"`
	Prompt          string  `json:"prompt"`
	DurationSec     float64 `json:"duration_sec"`
	Status          string  `json:"status"`
	MetadataJSON    string  `json:"metadata_json"`
}

type contentUnitPatchInput = contentUnitInput

type keyframeInput struct {
	SituationID   *uint  `json:"situation_id"`
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
	ScriptVersionID *uint   `json:"script_version_id"`
	Name            string  `json:"name"`
	Status          string  `json:"status"`
	DurationSec     float64 `json:"duration_sec"`
	IsPrimary       bool    `json:"is_primary"`
	MetadataJSON    string  `json:"metadata_json"`
}

type previewTimelineItemInput struct {
	ScriptSectionID *uint   `json:"script_section_id"`
	SituationID     *uint   `json:"situation_id"`
	ContentUnitID   *uint   `json:"content_unit_id"`
	KeyframeID      *uint   `json:"keyframe_id"`
	Kind            string  `json:"kind"`
	Order           int     `json:"order"`
	StartSec        float64 `json:"start_sec"`
	DurationSec     float64 `json:"duration_sec"`
	Label           string  `json:"label"`
	Status          string  `json:"status"`
	MetadataJSON    string  `json:"metadata_json"`
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

type assetRequirementInput struct {
	CreativeReferenceID      *uint  `json:"creative_reference_id"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	OwnerType                string `json:"owner_type"`
	OwnerID                  *uint  `json:"owner_id"`
	Kind                     string `json:"kind"`
	Name                     string `json:"name" binding:"required"`
	Description              string `json:"description"`
	RequiredSlot             string `json:"required_slot"`
	PromptHint               string `json:"prompt_hint"`
	Status                   string `json:"status"`
	Priority                 string `json:"priority"`
	LockedAssetID            *uint  `json:"locked_asset_id"`
	MetadataJSON             string `json:"metadata_json"`
}

type workItemInput struct {
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

type deliveryVersionInput struct {
	PreviewTimelineID *uint   `json:"preview_timeline_id"`
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Status            string  `json:"status"`
	IsPrimary         bool    `json:"is_primary"`
	DurationSec       float64 `json:"duration_sec"`
	MetadataJSON      string  `json:"metadata_json"`
}
