package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type StoryboardHandler struct{ db *gorm.DB }

func NewStoryboardHandler(db *gorm.DB) *StoryboardHandler { return &StoryboardHandler{db: db} }

// List returns storyboards for a scene.
func (h *StoryboardHandler) List(c *gin.Context) {
	boards := make([]model.Storyboard, 0)
	h.db.Where("scene_id = ?", c.Param("id")).Order("\"order\"").Preload("Shots").Find(&boards)
	c.JSON(http.StatusOK, boards)
}

// ListByEpisode returns storyboards for an episode.
func (h *StoryboardHandler) ListByEpisode(c *gin.Context) {
	boards := make([]model.Storyboard, 0)
	q := h.db.Where("episode_id = ?", c.Param("id")).Order("\"order\"").Preload("Shots")
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	q.Find(&boards)
	c.JSON(http.StatusOK, boards)
}

// ListByProject returns all storyboards for a project.
func (h *StoryboardHandler) ListByProject(c *gin.Context) {
	boards := make([]model.Storyboard, 0)
	q := h.db.Where("project_id = ?", c.Param("id")).Order("\"order\"").Preload("Shots")
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if sid := c.Query("scene_id"); sid != "" {
		q = q.Where("scene_id = ?", sid)
	}
	if eid := c.Query("episode_id"); eid != "" {
		q = q.Where("episode_id = ?", eid)
	}
	q.Find(&boards)
	c.JSON(http.StatusOK, boards)
}

// Create creates a storyboard under a scene.
func (h *StoryboardHandler) Create(c *gin.Context) {
	var b model.Storyboard
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	sceneID := parseID(c.Param("id"))
	b.SceneID = &sceneID

	// Inherit project_id from scene.
	var scene model.Scene
	if h.db.First(&scene, sceneID).Error == nil {
		b.ProjectID = scene.ProjectID
	}

	if b.Order == 0 {
		var count int64
		h.db.Model(&model.Storyboard{}).Where("scene_id = ?", sceneID).Count(&count)
		b.Order = int(count) + 1
	}
	// Resolve EpisodeID from the first episode linked to this scene (if not provided).
	if b.EpisodeID == nil {
		var es model.EpisodeScene
		if h.db.Where("scene_id = ?", sceneID).First(&es).Error == nil {
			b.EpisodeID = &es.EpisodeID
		}
	}
	h.db.Create(&b)
	c.JSON(http.StatusCreated, b)
}

// CreateByProject creates a storyboard directly under a project (scene/episode optional).
func (h *StoryboardHandler) CreateByProject(c *gin.Context) {
	var b model.Storyboard
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	b.ProjectID = parseID(c.Param("id"))

	// If scene_id provided in body, resolve episode from it.
	if b.SceneID != nil && b.EpisodeID == nil {
		var es model.EpisodeScene
		if h.db.Where("scene_id = ?", *b.SceneID).First(&es).Error == nil {
			b.EpisodeID = &es.EpisodeID
		}
	}

	if b.Order == 0 {
		var count int64
		h.db.Model(&model.Storyboard{}).Where("project_id = ?", b.ProjectID).Count(&count)
		b.Order = int(count) + 1
	}
	h.db.Create(&b)
	c.JSON(http.StatusCreated, b)
}

func (h *StoryboardHandler) Update(c *gin.Context) {
	var b model.Storyboard
	if err := h.db.First(&b, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("分镜不存在"))
		return
	}
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Save(&b)
	c.JSON(http.StatusOK, b)
}

func (h *StoryboardHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Storyboard{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}
