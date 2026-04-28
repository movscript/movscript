package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type EpisodeHandler struct{ db *gorm.DB }

func NewEpisodeHandler(db *gorm.DB) *EpisodeHandler { return &EpisodeHandler{db: db} }

// List returns episodes that belong to a specific script.
func (h *EpisodeHandler) List(c *gin.Context) {
	episodes := make([]model.Episode, 0)
	h.db.Where("script_id = ?", c.Param("id")).Order("number").Find(&episodes)
	c.JSON(http.StatusOK, episodes)
}

// ListByProject returns all episodes for a project (via script OR direct project_id).
func (h *EpisodeHandler) ListByProject(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var scriptIDs []uint
	h.db.Model(&model.Script{}).Where("project_id = ?", projectID).Pluck("id", &scriptIDs)

	episodes := make([]model.Episode, 0)
	q := h.db.Where("project_id = ?", projectID)
	if len(scriptIDs) > 0 {
		q = h.db.Where("project_id = ? OR script_id IN ?", projectID, scriptIDs)
	}
	if nid := c.Query("pipeline_node_id"); nid != "" {
		q = q.Where("pipeline_node_id = ?", nid)
	}
	if len(scriptIDs) > 0 {
		q.Order("number").Find(&episodes)
	} else {
		q.Order("number").Find(&episodes)
	}
	c.JSON(http.StatusOK, episodes)
}

// Create creates an episode under a specific script (legacy route).
func (h *EpisodeHandler) Create(c *gin.Context) {
	var e model.Episode
	if err := c.ShouldBindJSON(&e); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	scriptID := parseID(c.Param("id"))
	e.ScriptID = &scriptID

	// Resolve project_id from script
	var script model.Script
	if err := h.db.First(&script, scriptID).Error; err == nil {
		e.ProjectID = script.ProjectID
	}

	if e.Number == 0 {
		var count int64
		h.db.Model(&model.Episode{}).Where("script_id = ?", scriptID).Count(&count)
		e.Number = int(count) + 1
	}
	h.db.Create(&e)
	c.JSON(http.StatusCreated, e)
}

// CreateUnderProject creates an episode directly under a project (script optional).
func (h *EpisodeHandler) CreateUnderProject(c *gin.Context) {
	var e model.Episode
	if err := c.ShouldBindJSON(&e); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	projectID := parseID(c.Param("id"))
	e.ProjectID = projectID

	// If script_id is provided, validate it belongs to this project
	if e.ScriptID != nil && *e.ScriptID != 0 {
		var script model.Script
		if err := h.db.First(&script, *e.ScriptID).Error; err != nil || script.ProjectID != projectID {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("剧本不存在或不属于该项目"))
			return
		}
	} else {
		e.ScriptID = nil
	}

	if e.Number == 0 {
		var count int64
		h.db.Model(&model.Episode{}).Where("project_id = ?", projectID).Count(&count)
		e.Number = int(count) + 1
	}
	h.db.Create(&e)
	c.JSON(http.StatusCreated, e)
}

func (h *EpisodeHandler) Update(c *gin.Context) {
	var e model.Episode
	if err := h.db.First(&e, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("分集不存在"))
		return
	}
	if err := c.ShouldBindJSON(&e); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Save(&e)
	c.JSON(http.StatusOK, e)
}

// Patch applies a partial update to an episode.
// Note: review_status is retained for legacy compatibility but is not enabled
// in the current frontend; pipeline node status owns review workflow.
func (h *EpisodeHandler) Patch(c *gin.Context) {
	var e model.Episode
	if err := h.db.First(&e, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("分集不存在"))
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Model(&e).Updates(body)
	h.db.First(&e, e.ID)
	c.JSON(http.StatusOK, e)
}

func (h *EpisodeHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Episode{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}
