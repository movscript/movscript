package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
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
	q := h.db.Preload("Setting").Where("project_id = ?", c.Param("id"))
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
	var ref model.ScriptSettingRef
	if err := c.ShouldBindJSON(&ref); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
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
	if err := c.ShouldBindJSON(&ref); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
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
	if scriptID := c.Query("scope_script_id"); scriptID != "" {
		q = q.Where("scope_script_id = ?", scriptID)
	}
	q.Order("created_at").Find(&relationships)
	c.JSON(http.StatusOK, relationships)
}

func (h *SettingHandler) CreateRelationship(c *gin.Context) {
	var relationship model.SettingRelationship
	if err := c.ShouldBindJSON(&relationship); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	relationship.ProjectID = parseID(c.Param("id"))
	if relationship.Source == "" {
		relationship.Source = "manual"
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
	if err := c.ShouldBindJSON(&relationship); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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

func (h *SettingHandler) Create(c *gin.Context) {
	var s model.Setting
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	s.ProjectID = parseID(c.Param("id"))
	h.db.Create(&s)
	c.JSON(http.StatusCreated, s)
}

func (h *SettingHandler) Update(c *gin.Context) {
	var s model.Setting
	if err := h.db.First(&s, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("设定不存在"))
		return
	}
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Save(&s)
	c.JSON(http.StatusOK, s)
}

func (h *SettingHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Setting{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}
