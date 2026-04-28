package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ProjectHandler struct{ db *gorm.DB }

func NewProjectHandler(db *gorm.DB) *ProjectHandler { return &ProjectHandler{db: db} }

var (
	errAdminProjectNotFound = errors.New("project not found")
	errAdminOwnerNotFound   = errors.New("owner user not found")
)

func (h *ProjectHandler) List(c *gin.Context) {
	projects := make([]model.Project, 0)
	h.db.Preload("Owner").Find(&projects)
	c.JSON(http.StatusOK, projects)
}

func (h *ProjectHandler) AdminList(c *gin.Context) {
	projects := make([]model.Project, 0)
	if err := h.db.Preload("Owner").Preload("Members.User").Order("id desc").Find(&projects).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目失败"))
		return
	}
	c.JSON(http.StatusOK, projects)
}

func (h *ProjectHandler) AdminForceSetOwner(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req struct {
		OwnerID uint `json:"owner_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if projectID == 0 || req.OwnerID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("项目 ID 和 owner_id 必须有效"))
		return
	}

	var updated model.Project
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var owner model.User
		if err := tx.First(&owner, req.OwnerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errAdminOwnerNotFound
			}
			return err
		}

		var project model.Project
		if err := tx.First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errAdminProjectNotFound
			}
			return err
		}

		if err := tx.Model(&model.Project{}).Where("id = ?", project.ID).Update("owner_id", req.OwnerID).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ProjectMember{}).
			Where("project_id = ? AND user_id <> ? AND role = ?", project.ID, req.OwnerID, "owner").
			Update("role", "director").Error; err != nil {
			return err
		}

		result := tx.Model(&model.ProjectMember{}).
			Where("project_id = ? AND user_id = ?", project.ID, req.OwnerID).
			Update("role", "owner")
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			if err := tx.Create(&model.ProjectMember{ProjectID: project.ID, UserID: req.OwnerID, Role: "owner"}).Error; err != nil {
				return err
			}
		}

		return tx.Preload("Owner").Preload("Members.User").First(&updated, project.ID).Error
	})
	if err != nil {
		switch {
		case errors.Is(err, errAdminProjectNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		case errors.Is(err, errAdminOwnerNotFound):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner 用户不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("修改项目 owner 失败"))
		}
		return
	}

	c.JSON(http.StatusOK, updated)
}

func (h *ProjectHandler) Create(c *gin.Context) {
	var p model.Project
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		p.OwnerID = u.(*model.User).ID
	}
	h.db.Create(&p)
	if p.OwnerID != 0 {
		h.db.Create(&model.ProjectMember{ProjectID: p.ID, UserID: p.OwnerID, Role: "owner"})
	}
	if p.PipelineTemplate != "" && p.PipelineTemplate != "custom" {
		createPipelineFromTemplate(h.db, p.ID, p.PipelineTemplate)
	}
	c.JSON(http.StatusCreated, p)
}

func (h *ProjectHandler) Get(c *gin.Context) {
	var p model.Project
	if err := h.db.Preload("Owner").Preload("Members.User").First(&p, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *ProjectHandler) Update(c *gin.Context) {
	var p model.Project
	if err := h.db.First(&p, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		return
	}
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Save(&p)
	c.JSON(http.StatusOK, p)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Project{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AddMember(c *gin.Context) {
	var m model.ProjectMember
	if err := c.ShouldBindJSON(&m); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	m.ProjectID = parseID(c.Param("id"))
	h.db.Create(&m)
	h.db.Preload("User").First(&m, m.ID)
	c.JSON(http.StatusCreated, m)
}

func (h *ProjectHandler) RemoveMember(c *gin.Context) {
	h.db.Where("project_id = ? AND id = ?", c.Param("id"), c.Param("memberId")).
		Delete(&model.ProjectMember{})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) ListMembers(c *gin.Context) {
	members := make([]model.ProjectMember, 0)
	h.db.Where("project_id = ?", c.Param("id")).Preload("User").Find(&members)
	c.JSON(http.StatusOK, members)
}

func (h *ProjectHandler) Progress(c *gin.Context) {
	pid := c.Param("id")
	var scriptCount, episodeCount, sceneCount, memberCount, assetCount int64

	h.db.Model(&model.Script{}).Where("project_id = ?", pid).Count(&scriptCount)
	h.db.Model(&model.Episode{}).Where("project_id = ?", pid).Count(&episodeCount)
	h.db.Model(&model.Scene{}).Where("project_id = ?", pid).Count(&sceneCount)
	h.db.Model(&model.ProjectMember{}).Where("project_id = ?", pid).Count(&memberCount)
	h.db.Model(&model.Asset{}).Where("project_id = ?", pid).Count(&assetCount)

	// Fetch project for total_episodes target
	var project model.Project
	h.db.Select("total_episodes").First(&project, pid)

	type statusCount struct {
		Status string
		Count  int64
	}

	// Storyboard breakdown — use project_id directly
	var sbBreakdown []statusCount
	h.db.Model(&model.Storyboard{}).
		Select("status, count(*) as count").
		Where("project_id = ?", pid).
		Group("status").
		Scan(&sbBreakdown)
	sbMap := map[string]int64{}
	var sbTotal int64
	for _, r := range sbBreakdown {
		sbMap[r.Status] = r.Count
		sbTotal += r.Count
	}

	// Shot breakdown — use project_id directly
	var shotBreakdown []statusCount
	h.db.Model(&model.Shot{}).
		Select("status, count(*) as count").
		Where("project_id = ?", pid).
		Group("status").
		Scan(&shotBreakdown)
	shotMap := map[string]int64{}
	var shotTotal int64
	for _, r := range shotBreakdown {
		shotMap[r.Status] = r.Count
		shotTotal += r.Count
	}

	var approvedShotCount int64
	h.db.Model(&model.Shot{}).Where("project_id = ? AND is_approved = true", pid).Count(&approvedShotCount)

	c.JSON(http.StatusOK, gin.H{
		"scripts":        scriptCount,
		"episodes":       episodeCount,
		"total_episodes": project.TotalEpisodes,
		"scenes":         sceneCount,
		"assets":         assetCount,
		"members":        memberCount,
		"storyboards": gin.H{
			"total":    sbTotal,
			"draft":    sbMap["draft"],
			"approved": sbMap["approved"],
		},
		"shots": gin.H{
			"total":        shotTotal,
			"draft":        shotMap["draft"],
			"prompt_ready": shotMap["prompt_ready"],
			"generating":   shotMap["generating"],
			"generated":    shotMap["generated"],
			"approved":     shotMap["approved"],
			"is_approved":  approvedShotCount,
		},
	})
}

func parseID(s string) uint {
	var id uint
	for _, c := range s {
		if c >= '0' && c <= '9' {
			id = id*10 + uint(c-'0')
		}
	}
	return id
}
