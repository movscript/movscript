package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type SettingHandler struct{ db *gorm.DB }

func NewSettingHandler(db *gorm.DB) *SettingHandler { return &SettingHandler{db: db} }

func (h *SettingHandler) List(c *gin.Context) {
	settings := make([]model.Setting, 0)
	q := h.db.Where("project_id = ?", c.Param("id"))
	if t := c.Query("type"); t != "" {
		q = q.Where("type = ?", t)
	}
	if sid := c.Query("script_id"); sid != "" {
		q = q.Where("script_id = ?", sid)
	}
	q.Order("type, name").Find(&settings)
	c.JSON(http.StatusOK, settings)
}

func (h *SettingHandler) ListRefs(c *gin.Context) {
	refs := make([]model.ScriptSettingRef, 0)
	q := h.db.Preload("Setting").Preload("Script").Where("project_id = ?", c.Param("id"))
	if scriptID := c.Query("script_id"); scriptID != "" {
		q = q.Where("script_id = ?", scriptID)
	}
	if settingID := c.Query("setting_id"); settingID != "" {
		q = q.Where("setting_id = ?", settingID)
	}
	if scope := c.Query("scope"); scope != "" {
		q = q.Where("scope = ?", scope)
	}
	q.Order(`script_id, "order", created_at`).Find(&refs)
	c.JSON(http.StatusOK, refs)
}

func (h *SettingHandler) CreateRef(c *gin.Context) {
	var req service.ScriptSettingRefInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var ref model.ScriptSettingRef
	service.ApplyScriptSettingRefInput(&ref, req)
	ref.ProjectID = parseID(c.Param("id"))
	if ref.Source == "" {
		ref.Source = "manual"
	}
	h.db.Create(&ref)
	h.db.Preload("Setting").First(&ref, ref.ID)
	c.JSON(http.StatusCreated, ref)
}

func (h *SettingHandler) UpdateRef(c *gin.Context) {
	var ref model.ScriptSettingRef
	if err := h.db.First(&ref, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("设定引用不存在"))
		return
	}
	var req service.ScriptSettingRefInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplyScriptSettingRefInput(&ref, req)
	h.db.Save(&ref)
	h.db.Preload("Setting").First(&ref, ref.ID)
	c.JSON(http.StatusOK, ref)
}

func (h *SettingHandler) DeleteRef(c *gin.Context) {
	h.db.Delete(&model.ScriptSettingRef{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

func (h *SettingHandler) ListRelationships(c *gin.Context) {
	relationships := make([]model.SettingRelationship, 0)
	q := h.db.Preload("SourceSetting").Preload("TargetSetting").Where("project_id = ?", c.Param("id"))
	if category := c.Query("category"); category != "" {
		q = q.Where("category = ?", category)
	}
	if scriptID := c.Query("scope_script_id"); scriptID != "" {
		q = q.Where("scope_script_id = ?", scriptID)
	}
	q.Order("created_at").Find(&relationships)
	c.JSON(http.StatusOK, relationships)
}

func (h *SettingHandler) CreateRelationship(c *gin.Context) {
	var req service.SettingRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var relationship model.SettingRelationship
	service.ApplySettingRelationshipInput(&relationship, req)
	relationship.ProjectID = parseID(c.Param("id"))
	if relationship.Source == "" {
		relationship.Source = "manual"
	}
	if relationship.Category == "" {
		relationship.Category = "relationship"
	}
	if err := h.validateRelationship(&relationship); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if h.relationshipExists(&relationship, 0) {
		c.JSON(http.StatusConflict, apierr.InvalidInput("设定关系已存在"))
		return
	}
	h.db.Create(&relationship)
	h.db.Preload("SourceSetting").Preload("TargetSetting").First(&relationship, relationship.ID)
	c.JSON(http.StatusCreated, relationship)
}

func (h *SettingHandler) UpdateRelationship(c *gin.Context) {
	var relationship model.SettingRelationship
	if err := h.db.First(&relationship, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("设定关系不存在"))
		return
	}
	var req service.SettingRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplySettingRelationshipInput(&relationship, req)
	if relationship.Category == "" {
		relationship.Category = "relationship"
	}
	if err := h.validateRelationship(&relationship); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if h.relationshipExists(&relationship, relationship.ID) {
		c.JSON(http.StatusConflict, apierr.InvalidInput("设定关系已存在"))
		return
	}
	h.db.Save(&relationship)
	h.db.Preload("SourceSetting").Preload("TargetSetting").First(&relationship, relationship.ID)
	c.JSON(http.StatusOK, relationship)
}

func (h *SettingHandler) DeleteRelationship(c *gin.Context) {
	h.db.Delete(&model.SettingRelationship{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

func (h *SettingHandler) validateRelationship(r *model.SettingRelationship) error {
	if r.ProjectID == 0 {
		return fmt.Errorf("项目 ID 无效")
	}
	if r.SourceSettingID == 0 || r.TargetSettingID == 0 {
		return fmt.Errorf("关系两端设定不能为空")
	}
	if r.SourceSettingID == r.TargetSettingID {
		return fmt.Errorf("关系两端不能是同一个设定")
	}
	if strings.TrimSpace(r.Category) == "" {
		return fmt.Errorf("关系分类不能为空")
	}
	var sourceSetting model.Setting
	if err := h.db.Where("id = ? AND project_id = ?", r.SourceSettingID, r.ProjectID).First(&sourceSetting).Error; err != nil {
		return fmt.Errorf("起点设定不存在或不属于当前项目")
	}
	var targetSetting model.Setting
	if err := h.db.Where("id = ? AND project_id = ?", r.TargetSettingID, r.ProjectID).First(&targetSetting).Error; err != nil {
		return fmt.Errorf("终点设定不存在或不属于当前项目")
	}
	if r.ScopeScriptID != nil {
		var script model.Script
		if err := h.db.Where("id = ? AND project_id = ?", *r.ScopeScriptID, r.ProjectID).First(&script).Error; err != nil {
			return fmt.Errorf("作用域剧本不存在或不属于当前项目")
		}
	}
	return nil
}

func (h *SettingHandler) relationshipExists(r *model.SettingRelationship, excludeID uint) bool {
	q := h.db.Model(&model.SettingRelationship{}).
		Where("project_id = ? AND source_setting_id = ? AND target_setting_id = ? AND category = ? AND type = ?", r.ProjectID, r.SourceSettingID, r.TargetSettingID, r.Category, r.Type)
	if r.ScopeScriptID == nil {
		q = q.Where("scope_script_id IS NULL")
	} else {
		q = q.Where("scope_script_id = ?", *r.ScopeScriptID)
	}
	if excludeID != 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	q.Count(&count)
	return count > 0
}

func (h *SettingHandler) Create(c *gin.Context) {
	var req service.SettingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var s model.Setting
	service.ApplySettingInput(&s, req)
	s.ProjectID = parseID(c.Param("id"))
	s.Name = strings.TrimSpace(s.Name)
	if s.Name == "" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("设定名称不能为空"))
		return
	}
	s.Status = strings.TrimSpace(s.Status)
	if s.Status == "" {
		s.Status = "default"
	}
	if h.settingNameExists(s.ProjectID, s.Name, 0) {
		c.JSON(http.StatusConflict, apierr.InvalidInput("设定名称已存在"))
		return
	}
	h.db.Create(&s)
	c.JSON(http.StatusCreated, s)
}

func (h *SettingHandler) Update(c *gin.Context) {
	var s model.Setting
	if err := h.db.First(&s, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("设定不存在"))
		return
	}
	var req service.SettingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplySettingInput(&s, req)
	s.Name = strings.TrimSpace(s.Name)
	if s.Name == "" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("设定名称不能为空"))
		return
	}
	s.Status = strings.TrimSpace(s.Status)
	if s.Status == "" {
		s.Status = "default"
	}
	if h.settingNameExists(s.ProjectID, s.Name, s.ID) {
		c.JSON(http.StatusConflict, apierr.InvalidInput("设定名称已存在"))
		return
	}
	h.db.Save(&s)
	c.JSON(http.StatusOK, s)
}

func (h *SettingHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Setting{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

func (h *SettingHandler) settingNameExists(projectID uint, name string, excludeID uint) bool {
	q := h.db.Model(&model.Setting{}).Where("project_id = ? AND name = ?", projectID, name)
	if excludeID != 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	q.Count(&count)
	return count > 0
}
