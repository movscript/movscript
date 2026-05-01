package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/v2/scriptpreview"
	"gorm.io/gorm"
)

type ScriptPreviewHandler struct {
	db      *gorm.DB
	service *scriptpreview.Service
}

func NewScriptPreviewHandler(db *gorm.DB) *ScriptPreviewHandler {
	return &ScriptPreviewHandler{
		db:      db,
		service: scriptpreview.NewServiceWithStore(scriptpreview.NewGormDraftStore(db)),
	}
}

func (h *ScriptPreviewHandler) GetLatestDraft(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	resp, err := h.service.GetLatestDraftWithContext(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) SaveDraft(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.SaveDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.SaveDraftWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) AnalyzeScriptToSections(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.AnalyzeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.AnalyzeWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) GenerateKeyframesForContentUnits(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.GeneratePreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.GeneratePreviewWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) ConfirmPreview(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.ConfirmPreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.ConfirmPreviewWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) AcceptStoryboardSuggestion(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.StoryboardSuggestionDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.AcceptStoryboardSuggestionWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) RejectStoryboardSuggestion(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.StoryboardSuggestionDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.RejectStoryboardSuggestionWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) AcceptKeyframeCandidate(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.KeyframeCandidateDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.AcceptKeyframeCandidateWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) RejectKeyframeCandidate(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.KeyframeCandidateDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.RejectKeyframeCandidateWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) AcceptAssetGap(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.AssetGapDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.AcceptAssetGapWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) ResolveAssetGap(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.AssetGapDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.ResolveAssetGapWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) RejectAssetGap(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req scriptpreview.AssetGapDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	resp, err := h.service.RejectAssetGapWithContext(c.Request.Context(), projectID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScriptPreviewHandler) ensureProject(c *gin.Context) (uint, bool) {
	projectID := parseID(c.Param("id"))
	if projectID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("project id is required"))
		return 0, false
	}
	var project model.Project
	if err := h.db.Select("id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return 0, false
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return 0, false
	}
	return projectID, true
}
