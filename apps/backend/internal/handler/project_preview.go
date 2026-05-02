package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/semantic/projectpreview"
	"gorm.io/gorm"
)

type ProjectPreviewHandler struct {
	db      *gorm.DB
	service *projectpreview.Service
}

func NewProjectPreviewHandler(db *gorm.DB) *ProjectPreviewHandler {
	return &ProjectPreviewHandler{
		db:      db,
		service: projectpreview.NewServiceWithStore(projectpreview.NewGormDraftStore(db)),
	}
}

func (h *ProjectPreviewHandler) GetLatestDraft(c *gin.Context) {
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

func (h *ProjectPreviewHandler) SaveDraft(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.SaveDraftRequest
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

func (h *ProjectPreviewHandler) AnalyzeScriptToSegments(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.AnalyzeRequest
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

func (h *ProjectPreviewHandler) AnalyzeScriptToSections(c *gin.Context) {
	h.AnalyzeScriptToSegments(c)
}

func (h *ProjectPreviewHandler) GenerateKeyframesForContentUnits(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.GeneratePreviewRequest
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

func (h *ProjectPreviewHandler) ConfirmPreview(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.ConfirmPreviewRequest
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

func (h *ProjectPreviewHandler) AcceptStoryboardSuggestion(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.StoryboardSuggestionDecisionRequest
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

func (h *ProjectPreviewHandler) RejectStoryboardSuggestion(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.StoryboardSuggestionDecisionRequest
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

func (h *ProjectPreviewHandler) AcceptKeyframeCandidate(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.KeyframeCandidateDecisionRequest
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

func (h *ProjectPreviewHandler) RejectKeyframeCandidate(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.KeyframeCandidateDecisionRequest
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

func (h *ProjectPreviewHandler) AcceptAssetGap(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.AssetGapDecisionRequest
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

func (h *ProjectPreviewHandler) ResolveAssetGap(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.AssetGapDecisionRequest
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

func (h *ProjectPreviewHandler) RejectAssetGap(c *gin.Context) {
	projectID, ok := h.ensureProject(c)
	if !ok {
		return
	}
	var req projectpreview.AssetGapDecisionRequest
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

func (h *ProjectPreviewHandler) ensureProject(c *gin.Context) (uint, bool) {
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
