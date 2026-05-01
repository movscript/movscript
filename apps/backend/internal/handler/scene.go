package handler

import (
	"fmt"
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
	q.Order("number").
		Preload("Script").
		Preload("Settings").
		Preload("Storyboards", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
		Preload("Storyboards.Shots", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
		Preload("FinalVideos").
		Find(&scenes)
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
// in the current frontend.
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
	if rawScriptID, ok := body["script_id"]; ok {
		scriptID, err := optionalUintFromJSON(rawScriptID)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		if scriptID != nil {
			if err := h.validateSceneScript(s.ProjectID, *scriptID); err != nil {
				c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
				return
			}
		}
	}
	if updates := service.ScenePatchUpdates(body); len(updates) > 0 {
		h.db.Model(&s).Updates(updates)
	}
	if rawSettingIDs, ok := body["setting_ids"]; ok {
		settingIDs, err := uintSliceFromJSON(rawSettingIDs)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		if err := h.replaceSceneSettings(&s, settingIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "分场设定引用同步失败: " + err.Error()})
			return
		}
	}
	if rawStoryboardIDs, ok := body["storyboard_ids"]; ok {
		storyboardIDs, err := uintSliceFromJSON(rawStoryboardIDs)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		if err := h.replaceSceneStoryboards(&s, storyboardIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "分场分镜引用同步失败: " + err.Error()})
			return
		}
	}
	h.db.
		Preload("Script").
		Preload("Settings").
		Preload("Storyboards", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
		Preload("Storyboards.Shots", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
		Preload("FinalVideos").
		First(&s, s.ID)
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

func (h *SceneHandler) replaceSceneSettings(scene *model.Scene, settingIDs []uint) error {
	if len(settingIDs) > 0 {
		var settings []model.Setting
		if err := h.db.Where("project_id = ? AND id IN ?", scene.ProjectID, settingIDs).Find(&settings).Error; err != nil {
			return err
		}
		if len(settings) != len(settingIDs) {
			return fmt.Errorf("部分设定不存在或不属于当前项目")
		}
	}
	if err := h.db.Where("scene_id = ?", scene.ID).Delete(&model.SceneSettingRef{}).Error; err != nil {
		return err
	}
	refs := make([]model.SceneSettingRef, 0, len(settingIDs))
	for index, settingID := range settingIDs {
		refs = append(refs, model.SceneSettingRef{
			ProjectID: scene.ProjectID,
			SceneID:   scene.ID,
			SettingID: settingID,
			Order:     index,
		})
	}
	if len(refs) > 0 {
		return h.db.Create(&refs).Error
	}
	return nil
}

func (h *SceneHandler) replaceSceneStoryboards(scene *model.Scene, storyboardIDs []uint) error {
	if len(storyboardIDs) > 0 {
		var count int64
		if err := h.db.Model(&model.Storyboard{}).
			Where("project_id = ? AND id IN ?", scene.ProjectID, storyboardIDs).
			Count(&count).Error; err != nil {
			return err
		}
		if int(count) != len(storyboardIDs) {
			return fmt.Errorf("部分分镜不存在或不属于当前项目")
		}
	}
	return h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Storyboard{}).
			Where("scene_id = ?", scene.ID).
			Update("scene_id", nil).Error; err != nil {
			return err
		}
		for index, storyboardID := range storyboardIDs {
			if err := tx.Model(&model.Storyboard{}).
				Where("project_id = ? AND id = ?", scene.ProjectID, storyboardID).
				Updates(map[string]interface{}{"scene_id": scene.ID, "order": index + 1}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (h *SceneHandler) validateSceneScript(projectID uint, scriptID uint) error {
	var count int64
	if err := h.db.Model(&model.Script{}).
		Where("project_id = ? AND id = ? AND script_type = ?", projectID, scriptID, "scene").
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("分场剧本不存在或不属于当前项目")
	}
	return nil
}

func uintSliceFromJSON(value interface{}) ([]uint, error) {
	rawItems, ok := value.([]interface{})
	if !ok {
		return nil, fmt.Errorf("ID 列表必须是数组")
	}
	ids := make([]uint, 0, len(rawItems))
	for _, raw := range rawItems {
		id, err := uintFromJSON(raw)
		if err != nil {
			return nil, err
		}
		if id > 0 {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func optionalUintFromJSON(value interface{}) (*uint, error) {
	if value == nil {
		return nil, nil
	}
	id, err := uintFromJSON(value)
	if err != nil {
		return nil, err
	}
	if id == 0 {
		return nil, nil
	}
	return &id, nil
}

func uintFromJSON(value interface{}) (uint, error) {
	switch v := value.(type) {
	case float64:
		if v < 0 || v != float64(uint(v)) {
			return 0, fmt.Errorf("ID 必须是正整数")
		}
		return uint(v), nil
	case int:
		if v < 0 {
			return 0, fmt.Errorf("ID 必须是正整数")
		}
		return uint(v), nil
	case uint:
		return v, nil
	default:
		return 0, fmt.Errorf("ID 必须是正整数")
	}
}
