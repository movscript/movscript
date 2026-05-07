package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	projectapp "github.com/movscript/movscript/internal/app/project"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

type ProjectHandler struct {
	db       *gorm.DB
	projects *projectapp.Service
}

func NewProjectHandler(db *gorm.DB, cacheStore ...cache.Cache) *ProjectHandler {
	return &ProjectHandler{db: db, projects: projectapp.NewService(db, cacheStore...)}
}

func currentOrgID(c *gin.Context) *uint {
	if _, ok := c.Get(middleware.ContextOrgMemberKey); ok {
		member := currentDomainOrgMember(c)
		if member.ID != 0 {
			return &member.OrgID
		}
	}
	if raw := c.GetHeader("X-Org-ID"); raw != "" {
		if id := parseID(raw); id != 0 {
			return &id
		}
	}
	return nil
}

func (h *ProjectHandler) List(c *gin.Context) {
	projects, err := h.projects.List(c.Request.Context(), currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目失败"))
		return
	}
	c.JSON(http.StatusOK, projects)
}

func (h *ProjectHandler) AdminList(c *gin.Context) {
	projects, err := h.projects.AdminList(c.Request.Context())
	if err != nil {
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

	updated, err := h.projects.ForceSetOwner(c.Request.Context(), projectID, req.OwnerID)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrOwnerNotFound):
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
	var req projectapp.CreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var ownerID uint
	if user := currentUser(c); user != nil {
		ownerID = user.ID
	}
	project, err := h.projects.Create(c.Request.Context(), req, ownerID, currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建项目失败"))
		return
	}
	c.JSON(http.StatusCreated, project)
}

func (h *ProjectHandler) Get(c *gin.Context) {
	project, err := h.projects.Get(c.Request.Context(), parseID(c.Param("id")), currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) Update(c *gin.Context) {
	var req projectapp.UpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	project, err := h.projects.Update(c.Request.Context(), parseID(c.Param("id")), req, currentOrgID(c))
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("更新项目失败"))
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	if err := h.projects.Delete(c.Request.Context(), parseID(c.Param("id")), currentOrgID(c)); err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("删除项目失败"))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AddMember(c *gin.Context) {
	var req projectapp.MemberInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	member, err := h.projects.AddMember(c.Request.Context(), parseID(c.Param("id")), req, currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("添加项目成员失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_added",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		ProjectID:  &member.ProjectID,
		Metadata: map[string]any{
			"project_id": member.ProjectID,
			"user_id":    member.UserID,
			"role":       member.Role,
		},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *ProjectHandler) RemoveMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	if err := h.projects.RemoveMember(c.Request.Context(), projectID, memberID, currentOrgID(c)); err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("移除项目成员失败"))
		return
	}
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
	members, err := h.projects.ListMembers(c.Request.Context(), parseID(c.Param("id")), currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目成员失败"))
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *ProjectHandler) Progress(c *gin.Context) {
	progress, err := h.projects.Progress(c.Request.Context(), parseID(c.Param("id")), currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目进度失败"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"scripts":     progress.Scripts,
		"segments":    progress.Segments,
		"asset_slots": progress.AssetSlots,
		"members":     progress.Members,
		"storyboard_lines": gin.H{
			"total": progress.StoryboardLines,
		},
		"content_units": gin.H{
			"total":        progress.ContentUnits["total"],
			"draft":        progress.ContentUnits["draft"],
			"prompt_ready": progress.ContentUnits["confirmed"],
			"generating":   progress.ContentUnits["in_production"],
			"approved":     progress.ContentUnits["locked"],
			"is_approved":  progress.ContentUnits["locked"],
		},
		"keyframes": gin.H{
			"accepted": progress.Keyframes["accepted"],
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
