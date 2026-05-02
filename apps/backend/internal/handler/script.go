package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type ScriptHandler struct{ db *gorm.DB }

func NewScriptHandler(db *gorm.DB) *ScriptHandler {
	return &ScriptHandler{db: db}
}

func (h *ScriptHandler) List(c *gin.Context) {
	scripts := make([]model.Script, 0)
	q := h.db.Where("project_id = ?", c.Param("id"))
	if t := c.Query("type"); t != "" {
		q = q.Where("script_type = ?", t)
	}
	if aid := c.Query("assignee_id"); aid != "" {
		q = q.Where("assignee_id = ?", aid)
	}
	q.Order(`"order", created_at`).Find(&scripts)
	c.JSON(http.StatusOK, scripts)
}

func (h *ScriptHandler) Create(c *gin.Context) {
	var req service.ScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var s model.Script
	service.ApplyScriptInput(&s, req)
	s.ProjectID = parseID(c.Param("id"))
	normalizeScriptDefaults(&s)
	if user := currentUser(c); user != nil {
		s.AuthorID = user.ID
	}
	if err := h.db.Create(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.ensureInitialScriptVersion(&s, currentUserID(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "剧本版本初始化失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, s)
}

func (h *ScriptHandler) Get(c *gin.Context) {
	var s model.Script
	if err := h.db.First(&s, c.Param("scriptId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) Update(c *gin.Context) {
	var s model.Script
	if err := h.db.First(&s, c.Param("scriptId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	var req service.ScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	projectID := s.ProjectID
	service.ApplyScriptInput(&s, req)
	s.ProjectID = projectID
	normalizeScriptDefaults(&s)
	if err := h.db.Save(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.ensureInitialScriptVersion(&s, currentUserID(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "剧本版本同步失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Script{}, c.Param("scriptId"))
	c.Status(http.StatusNoContent)
}

// Patch applies a partial update to a script.
func (h *ScriptHandler) Patch(c *gin.Context) {
	var s model.Script
	if err := h.db.First(&s, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	next := s
	if scriptType, ok := body["script_type"].(string); ok {
		next.ScriptType = scriptType
	}
	normalizeScriptDefaults(&next)
	updates := service.ScriptPatchUpdates(body)
	if len(updates) > 0 {
		if err := h.db.Model(&s).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	h.db.First(&s, s.ID)
	if err := h.ensureInitialScriptVersion(&s, currentUserID(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "剧本版本同步失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func normalizeScriptDefaults(s *model.Script) {
	if s.ScriptType == "" {
		s.ScriptType = "uncategorized"
	}
	if s.SourceType == "" {
		s.SourceType = "raw"
	}
	if s.Version == 0 {
		s.Version = 1
	}
	if strings.TrimSpace(s.RawSource) == "" {
		s.RawSource = s.Content
	}
	if strings.TrimSpace(s.Content) == "" {
		s.Content = s.RawSource
	}
	if strings.TrimSpace(s.RawSource) != "" {
		s.Content = s.RawSource
	}
}

func (h *ScriptHandler) ensureInitialScriptVersion(s *model.Script, createdByID *uint) error {
	if s == nil || s.ID == 0 {
		return nil
	}
	var version model.ScriptVersion
	err := h.db.Where("project_id = ? AND script_id = ? AND version_number = ?", s.ProjectID, s.ID, 1).First(&version).Error
	if err == nil {
		updates := map[string]interface{}{
			"title":       s.Title,
			"source_type": s.SourceType,
			"content":     s.Content,
			"raw_source":  s.RawSource,
			"summary":     s.Summary,
		}
		if version.Status == "" {
			updates["status"] = "active"
		}
		return h.db.Model(&version).Updates(updates).Error
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}
	version = model.ScriptVersion{
		ProjectID:     s.ProjectID,
		ScriptID:      s.ID,
		VersionNumber: 1,
		Title:         s.Title,
		SourceType:    s.SourceType,
		Content:       s.Content,
		RawSource:     s.RawSource,
		Summary:       s.Summary,
		Status:        "active",
		CreatedByID:   createdByID,
	}
	if version.SourceType == "" {
		version.SourceType = "raw"
	}
	return h.db.Create(&version).Error
}
