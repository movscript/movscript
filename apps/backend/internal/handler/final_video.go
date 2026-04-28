package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type FinalVideoHandler struct{ db *gorm.DB }

func NewFinalVideoHandler(db *gorm.DB) *FinalVideoHandler { return &FinalVideoHandler{db: db} }

// ListByProject returns all final videos for a project.
func (h *FinalVideoHandler) ListByProject(c *gin.Context) {
	videos := make([]model.FinalVideo, 0)
	q := h.db.Where("project_id = ?", c.Param("id")).Order("\"order\", id")
	if eid := c.Query("episode_id"); eid != "" {
		q = q.Where("episode_id = ?", eid)
	}
	if sid := c.Query("scene_id"); sid != "" {
		q = q.Where("scene_id = ?", sid)
	}
	if bid := c.Query("storyboard_id"); bid != "" {
		q = q.Where("storyboard_id = ?", bid)
	}
	if shid := c.Query("shot_id"); shid != "" {
		q = q.Where("shot_id = ?", shid)
	}
	if nid := c.Query("pipeline_node_id"); nid != "" {
		q = q.Where("pipeline_node_id = ?", nid)
	}
	q.Find(&videos)
	c.JSON(http.StatusOK, videos)
}

// CreateByProject creates a final video directly under a project.
func (h *FinalVideoHandler) CreateByProject(c *gin.Context) {
	var v model.FinalVideo
	if err := c.ShouldBindJSON(&v); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	v.ProjectID = parseID(c.Param("id"))
	if v.Order == 0 {
		var count int64
		h.db.Model(&model.FinalVideo{}).Where("project_id = ?", v.ProjectID).Count(&count)
		v.Order = int(count) + 1
	}
	if v.Title == "" {
		v.Title = "成片"
	}
	if v.Status == "" {
		v.Status = "draft"
	}
	h.db.Create(&v)
	c.JSON(http.StatusCreated, v)
}

func (h *FinalVideoHandler) Update(c *gin.Context) {
	var v model.FinalVideo
	if err := h.db.First(&v, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("成片不存在"))
		return
	}
	if err := c.ShouldBindJSON(&v); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Save(&v)
	c.JSON(http.StatusOK, v)
}

func (h *FinalVideoHandler) Patch(c *gin.Context) {
	var v model.FinalVideo
	if err := h.db.First(&v, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("成片不存在"))
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Model(&v).Updates(body)
	h.db.First(&v, v.ID)
	c.JSON(http.StatusOK, v)
}

func (h *FinalVideoHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.FinalVideo{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}
