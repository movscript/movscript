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
	if len(scriptIDs) > 0 {
		q.Order("number").
			Preload("Script").
			Preload("Settings").
			Preload("Scenes").
			Preload("Storyboards", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
			Preload("Storyboards.Shots", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
			Find(&episodes)
	} else {
		q.Order("number").
			Preload("Script").
			Preload("Settings").
			Preload("Scenes").
			Preload("Storyboards", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
			Preload("Storyboards.Shots", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
			Find(&episodes)
	}
	c.JSON(http.StatusOK, episodes)
}

// Create creates an episode under a specific script (legacy route).
func (h *EpisodeHandler) Create(c *gin.Context) {
	var req service.EpisodeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var e model.Episode
	service.ApplyEpisodeInput(&e, req)
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
	var req service.EpisodeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var e model.Episode
	service.ApplyEpisodeInput(&e, req)
	projectID := parseID(c.Param("id"))
	e.ProjectID = projectID

	// Episode is the structure entity. Episode scripts should link back via
	// Script.episode_id; script_id is kept only for legacy rows.
	e.ScriptID = nil

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
	var req service.EpisodeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplyEpisodeInput(&e, req)
	if e.ScriptID == nil {
		var script model.Script
		if err := h.db.Where("project_id = ? AND episode_id = ? AND script_type = ?", e.ProjectID, e.ID, "episode").Order("updated_at desc, id desc").First(&script).Error; err == nil {
			e.ScriptID = &script.ID
		}
	}
	h.db.Save(&e)
	c.JSON(http.StatusOK, e)
}

// Patch applies a partial update to an episode.
// Note: review_status is retained for legacy compatibility but is not enabled
// in the current frontend.
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
	if rawScriptID, ok := body["script_id"]; ok {
		scriptID, err := optionalUintFromJSON(rawScriptID)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		if scriptID != nil {
			if err := h.validateEpisodeScript(e.ProjectID, *scriptID); err != nil {
				c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
				return
			}
		}
	}
	if updates := service.EpisodePatchUpdates(body); len(updates) > 0 {
		h.db.Model(&e).Updates(updates)
	}
	if rawSettingIDs, ok := body["setting_ids"]; ok {
		settingIDs, err := uintSliceFromJSON(rawSettingIDs)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		if err := h.replaceEpisodeSettings(&e, settingIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "分集设定引用同步失败: " + err.Error()})
			return
		}
	}
	if rawStoryboardIDs, ok := body["storyboard_ids"]; ok {
		storyboardIDs, err := uintSliceFromJSON(rawStoryboardIDs)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		if err := h.replaceEpisodeStoryboards(&e, storyboardIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "分集分镜引用同步失败: " + err.Error()})
			return
		}
	}
	h.db.
		Preload("Script").
		Preload("Settings").
		Preload("Scenes").
		Preload("Storyboards", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
		Preload("Storyboards.Shots", func(db *gorm.DB) *gorm.DB { return db.Order(`"order", id`) }).
		First(&e, e.ID)
	c.JSON(http.StatusOK, e)
}

func (h *EpisodeHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Episode{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

func (h *EpisodeHandler) replaceEpisodeSettings(episode *model.Episode, settingIDs []uint) error {
	if len(settingIDs) > 0 {
		var settings []model.Setting
		if err := h.db.Where("project_id = ? AND id IN ?", episode.ProjectID, settingIDs).Find(&settings).Error; err != nil {
			return err
		}
		if len(settings) != len(settingIDs) {
			return fmt.Errorf("部分设定不存在或不属于当前项目")
		}
	}
	if err := h.db.Where("episode_id = ?", episode.ID).Delete(&model.EpisodeSettingRef{}).Error; err != nil {
		return err
	}
	refs := make([]model.EpisodeSettingRef, 0, len(settingIDs))
	for index, settingID := range settingIDs {
		refs = append(refs, model.EpisodeSettingRef{
			ProjectID: episode.ProjectID,
			EpisodeID: episode.ID,
			SettingID: settingID,
			Order:     index,
		})
	}
	if len(refs) > 0 {
		return h.db.Create(&refs).Error
	}
	return nil
}

func (h *EpisodeHandler) replaceEpisodeStoryboards(episode *model.Episode, storyboardIDs []uint) error {
	if len(storyboardIDs) > 0 {
		var count int64
		if err := h.db.Model(&model.Storyboard{}).
			Where("project_id = ? AND id IN ?", episode.ProjectID, storyboardIDs).
			Count(&count).Error; err != nil {
			return err
		}
		if int(count) != len(storyboardIDs) {
			return fmt.Errorf("部分分镜不存在或不属于当前项目")
		}
	}
	return h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Storyboard{}).
			Where("episode_id = ?", episode.ID).
			Update("episode_id", nil).Error; err != nil {
			return err
		}
		for index, storyboardID := range storyboardIDs {
			if err := tx.Model(&model.Storyboard{}).
				Where("project_id = ? AND id = ?", episode.ProjectID, storyboardID).
				Updates(map[string]interface{}{"episode_id": episode.ID, "order": index + 1}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (h *EpisodeHandler) validateEpisodeScript(projectID uint, scriptID uint) error {
	var count int64
	if err := h.db.Model(&model.Script{}).
		Where("project_id = ? AND id = ? AND script_type = ?", projectID, scriptID, "episode").
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("分集剧本不存在或不属于当前项目")
	}
	return nil
}
