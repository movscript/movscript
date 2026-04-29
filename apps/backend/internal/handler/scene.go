package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type SceneHandler struct{ db *gorm.DB }

func NewSceneHandler(db *gorm.DB) *SceneHandler { return &SceneHandler{db: db} }

// List returns all scenes for a project.
func (h *SceneHandler) List(c *gin.Context) {
	scenes := make([]model.Scene, 0)
	q := h.db.Where("project_id = ?", c.Param("id"))
	if nid := c.Query("pipeline_node_id"); nid != "" {
		q = q.Where("pipeline_node_id = ?", nid)
	}
	q.Order("number").Preload("Storyboards").Find(&scenes)
	c.JSON(http.StatusOK, scenes)
}

// ListByProject is an alias kept for router compatibility.
func (h *SceneHandler) ListByProject(c *gin.Context) {
	h.List(c)
}

func (h *SceneHandler) Create(c *gin.Context) {
	var req service.SceneInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var s model.Scene
	service.ApplySceneInput(&s, req)
	s.ProjectID = parseID(c.Param("id"))
	var count int64
	h.db.Model(&model.Scene{}).Where("project_id = ?", s.ProjectID).Count(&count)
	if s.Number == 0 {
		s.Number = int(count) + 1
	}
	h.db.Create(&s)
	c.JSON(http.StatusCreated, s)
}

func (h *SceneHandler) Update(c *gin.Context) {
	var s model.Scene
	if err := h.db.First(&s, c.Param("sceneId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("分场不存在"))
		return
	}
	var req service.SceneInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplySceneInput(&s, req)
	h.db.Save(&s)
	c.JSON(http.StatusOK, s)
}

// Patch applies a partial update to a scene.
// Note: review_status is retained for legacy compatibility but is not enabled
// in the current frontend; pipeline node status owns review workflow.
func (h *SceneHandler) Patch(c *gin.Context) {
	var s model.Scene
	if err := h.db.First(&s, c.Param("sceneId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("分场不存在"))
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if updates := service.ScenePatchUpdates(body); len(updates) > 0 {
		h.db.Model(&s).Updates(updates)
	}
	h.db.First(&s, s.ID)
	c.JSON(http.StatusOK, s)
}

func (h *SceneHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Scene{}, c.Param("sceneId"))
	c.Status(http.StatusNoContent)
}

// AddEpisodeScene links a scene to an episode.
func (h *SceneHandler) AddEpisodeScene(c *gin.Context) {
	episodeID := parseID(c.Param("id"))
	var body struct {
		SceneID uint `json:"scene_id" binding:"required"`
		Order   int  `json:"order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	es := model.EpisodeScene{EpisodeID: episodeID, SceneID: body.SceneID, Order: body.Order}
	if err := h.db.Create(&es).Error; err != nil {
		c.JSON(http.StatusConflict, apierr.Conflict("该分场已关联到此分集"))
		return
	}
	c.JSON(http.StatusCreated, es)
}

// RemoveEpisodeScene unlinks a scene from an episode.
func (h *SceneHandler) RemoveEpisodeScene(c *gin.Context) {
	episodeID := parseID(c.Param("id"))
	sceneID := parseID(c.Param("sceneId"))
	h.db.Where("episode_id = ? AND scene_id = ?", episodeID, sceneID).Delete(&model.EpisodeScene{})
	c.Status(http.StatusNoContent)
}

// ListEpisodeScenes returns the EpisodeScene join records for an episode (ordered by scene order).
func (h *SceneHandler) ListEpisodeScenes(c *gin.Context) {
	episodeID := parseID(c.Param("id"))
	var links []model.EpisodeScene
	h.db.Where("episode_id = ?", episodeID).Order(`"order"`).Find(&links)
	c.JSON(http.StatusOK, links)
}
