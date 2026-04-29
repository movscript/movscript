package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type ShotHandler struct{ db *gorm.DB }

func NewShotHandler(db *gorm.DB) *ShotHandler { return &ShotHandler{db: db} }

// List returns shots for a storyboard.
func (h *ShotHandler) List(c *gin.Context) {
	shots := make([]model.Shot, 0)
	h.db.Where("storyboard_id = ?", c.Param("id")).Order("\"order\"").Find(&shots)
	c.JSON(http.StatusOK, shots)
}

// Create creates a shot under a storyboard.
func (h *ShotHandler) Create(c *gin.Context) {
	var req service.ShotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var s model.Shot
	service.ApplyShotInput(&s, req)
	boardID := parseID(c.Param("id"))
	s.StoryboardID = &boardID

	// Inherit project_id from storyboard.
	var board model.Storyboard
	if h.db.First(&board, boardID).Error == nil {
		s.ProjectID = board.ProjectID
	}

	var count int64
	h.db.Model(&model.Shot{}).Where("storyboard_id = ?", boardID).Count(&count)
	if s.Order == 0 {
		s.Order = int(count) + 1
	}
	h.db.Create(&s)
	c.JSON(http.StatusCreated, s)
}

// CreateByProject creates a shot directly under a project (no storyboard required).
func (h *ShotHandler) CreateByProject(c *gin.Context) {
	var req service.ShotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var s model.Shot
	service.ApplyShotInput(&s, req)
	s.ProjectID = parseID(c.Param("id"))
	if s.Order == 0 {
		var count int64
		h.db.Model(&model.Shot{}).Where("project_id = ? AND storyboard_id IS NULL", s.ProjectID).Count(&count)
		s.Order = int(count) + 1
	}
	h.db.Create(&s)
	c.JSON(http.StatusCreated, s)
}

// Update updates a shot by its own ID.
func (h *ShotHandler) Update(c *gin.Context) {
	var s model.Shot
	if err := h.db.First(&s, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("镜头不存在"))
		return
	}
	var req service.ShotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplyShotInput(&s, req)
	h.db.Save(&s)
	c.JSON(http.StatusOK, s)
}

// Delete deletes a shot by its own ID.
func (h *ShotHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Shot{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

// Patch applies a partial update to a shot.
// Note: review_status is retained for legacy compatibility but is not enabled
// in the current frontend; pipeline node status owns review workflow.
func (h *ShotHandler) Patch(c *gin.Context) {
	var s model.Shot
	if err := h.db.First(&s, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("镜头不存在"))
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if updates := service.ShotPatchUpdates(body); len(updates) > 0 {
		h.db.Model(&s).Updates(updates)
	}
	h.db.First(&s, s.ID)
	c.JSON(http.StatusOK, s)
}

// ListByProject returns all shots for a project.
func (h *ShotHandler) ListByProject(c *gin.Context) {
	shots := make([]model.Shot, 0)
	q := h.db.Where("project_id = ?", c.Param("id")).Order("\"order\"")
	if sid := c.Query("storyboard_id"); sid != "" {
		q = q.Where("storyboard_id = ?", sid)
	}
	if nid := c.Query("pipeline_node_id"); nid != "" {
		q = q.Where("pipeline_node_id = ?", nid)
	}
	if aid := c.Query("assignee_id"); aid != "" {
		q = q.Where("assignee_id = ?", aid)
	}
	q.Find(&shots)
	c.JSON(http.StatusOK, shots)
}
