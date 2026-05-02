package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/audit"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
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

	audit.Record(c, h.db, audit.Event{
		Action:     "project.owner_changed",
		TargetType: "project",
		TargetID:   audit.TargetID(updated.ID),
		ProjectID:  &updated.ID,
		Metadata: map[string]any{
			"owner_id": req.OwnerID,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *ProjectHandler) Create(c *gin.Context) {
	var req service.ProjectCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var ownerID uint
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		ownerID = u.(*model.User).ID
	}
	p := service.NewProject(req, ownerID)
	h.db.Create(&p)
	if p.OwnerID != 0 {
		h.db.Create(&model.ProjectMember{ProjectID: p.ID, UserID: p.OwnerID, Role: "owner"})
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
	var req service.ProjectUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplyProjectUpdate(&p, req)
	h.db.Save(&p)
	c.JSON(http.StatusOK, p)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Project{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AddMember(c *gin.Context) {
	var req service.ProjectMemberInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.Role == "" {
		req.Role = "viewer"
	}
	m := model.ProjectMember{ProjectID: parseID(c.Param("id")), UserID: req.UserID, Role: req.Role}
	h.db.Create(&m)
	h.db.Preload("User").First(&m, m.ID)
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_added",
		TargetType: "project_member",
		TargetID:   audit.TargetID(m.ID),
		ProjectID:  &m.ProjectID,
		Metadata: map[string]any{
			"project_id": m.ProjectID,
			"user_id":    m.UserID,
			"role":       m.Role,
		},
	})
	c.JSON(http.StatusCreated, m)
}

func (h *ProjectHandler) RemoveMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	h.db.Where("project_id = ? AND id = ?", c.Param("id"), c.Param("memberId")).
		Delete(&model.ProjectMember{})
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_removed",
		TargetType: "project_member",
		TargetID:   audit.TargetID(memberID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"member_id":  memberID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) ListMembers(c *gin.Context) {
	members := make([]model.ProjectMember, 0)
	h.db.Where("project_id = ?", c.Param("id")).Preload("User").Find(&members)
	c.JSON(http.StatusOK, members)
}

func (h *ProjectHandler) Progress(c *gin.Context) {
	pid := c.Param("id")
	var scriptVersionCount, segmentCount, memberCount, assetSlotCount int64

	h.db.Model(&model.ScriptVersion{}).Where("project_id = ?", pid).Count(&scriptVersionCount)
	h.db.Model(&model.Segment{}).Where("project_id = ?", pid).Count(&segmentCount)
	h.db.Model(&model.ProjectMember{}).Where("project_id = ?", pid).Count(&memberCount)
	h.db.Model(&model.AssetSlot{}).Where("project_id = ?", pid).Count(&assetSlotCount)

	type statusCount struct {
		Status string
		Count  int64
	}

	var storyboardLineCount int64
	h.db.Model(&model.StoryboardLine{}).Where("project_id = ?", pid).Count(&storyboardLineCount)

	var contentUnitBreakdown []statusCount
	h.db.Model(&model.ContentUnit{}).
		Select("status, count(*) as count").
		Where("project_id = ?", pid).
		Group("status").
		Scan(&contentUnitBreakdown)
	contentUnitMap := map[string]int64{}
	var contentUnitTotal int64
	for _, r := range contentUnitBreakdown {
		contentUnitMap[r.Status] = r.Count
		contentUnitTotal += r.Count
	}

	var acceptedKeyframeCount int64
	h.db.Model(&model.Keyframe{}).Where("project_id = ? AND status IN ?", pid, []string{"attached", "accepted"}).Count(&acceptedKeyframeCount)

	c.JSON(http.StatusOK, gin.H{
		"scripts":        scriptVersionCount,
		"episodes":       int64(0),
		"total_episodes": int64(0),
		"scenes":         segmentCount,
		"assets":         assetSlotCount,
		"members":        memberCount,
		"storyboards": gin.H{
			"total": storyboardLineCount,
		},
		"shots": gin.H{
			"total":        contentUnitTotal,
			"draft":        contentUnitMap["draft"],
			"prompt_ready": contentUnitMap["confirmed"],
			"generating":   contentUnitMap["in_production"],
			"generated":    acceptedKeyframeCount,
			"approved":     contentUnitMap["locked"],
			"is_approved":  contentUnitMap["locked"],
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
