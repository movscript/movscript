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
