package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

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
	filter := projectapp.AdminListFilter{
		Query:    c.Query("q"),
		Status:   c.Query("status"),
		Page:     intQuery(c, "page", 1),
		PageSize: intQuery(c, "page_size", 50),
	}
	if ownerID := parseID(c.Query("owner_id")); ownerID != 0 {
		filter.OwnerID = &ownerID
	}
	if orgID := parseID(c.Query("org_id")); orgID != 0 {
		filter.OrgID = &orgID
	}
	page, err := h.projects.AdminList(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目失败"))
		return
	}
	c.Header("X-Total-Count", strconv.FormatInt(page.Total, 10))
	c.JSON(http.StatusOK, page.Items)
}

func (h *ProjectHandler) AdminDetail(c *gin.Context) {
	detail, err := h.projects.AdminDetail(c.Request.Context(), parseID(c.Param("id")))
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目详情失败"))
		return
	}
	c.JSON(http.StatusOK, detail)
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

	var previousOwnerID uint
	if existing, err := h.projects.Get(c.Request.Context(), projectID, nil); err == nil {
		previousOwnerID = existing.OwnerID
	}
	updated, err := h.projects.ForceSetOwner(c.Request.Context(), projectID, req.OwnerID)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrOwnerNotFound):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner 用户不存在"))
		case errors.Is(err, projectapp.ErrOwnerInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner 用户必须是 active 状态"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("修改项目 owner 失败"))
		}
		return
	}

	audit.Record(c, h.db, audit.Event{
		Action:     "project.owner_changed",
		TargetType: "project",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      updated.OrgID,
		ProjectID:  &updated.ID,
		Metadata: map[string]any{
			"previous_owner_id": previousOwnerID,
			"owner_id":          req.OwnerID,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *ProjectHandler) AdminDelete(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if projectID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("项目 ID 必须有效"))
		return
	}
	var orgID *uint
	if existing, err := h.projects.Get(c.Request.Context(), projectID, nil); err == nil {
		orgID = existing.OrgID
	}
	if err := h.projects.Delete(c.Request.Context(), projectID, nil); err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("删除项目失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.admin_deleted",
		TargetType: "project",
		TargetID:   audit.TargetID(projectID),
		OrgID:      orgID,
		ProjectID:  &projectID,
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AdminCreate(c *gin.Context) {
	var req projectapp.AdminCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	created, err := h.projects.AdminCreate(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrInvalidProjectName):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("项目名称不能为空"))
		case errors.Is(err, projectapp.ErrInvalidProjectStatus):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("status 必须是 planning、script_analysis、asset_prep、production、editing 或 done"))
		case errors.Is(err, projectapp.ErrOwnerNotFound):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner 用户不存在"))
		case errors.Is(err, projectapp.ErrOwnerInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("owner 用户必须是 active 状态"))
		case errors.Is(err, projectapp.ErrProjectOrgNotFound):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("组织不存在"))
		case errors.Is(err, projectapp.ErrProjectOrgInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("组织已暂停，不能创建项目"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("创建项目失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.admin_created",
		TargetType: "project",
		TargetID:   audit.TargetID(created.ID),
		OrgID:      created.OrgID,
		ProjectID:  &created.ID,
		Metadata: map[string]any{
			"name":     created.Name,
			"owner_id": created.OwnerID,
			"org_id":   created.OrgID,
			"status":   created.Status,
		},
	})
	c.JSON(http.StatusCreated, created)
}

func (h *ProjectHandler) AdminUpdate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req projectapp.AdminUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var previousName string
	var previousStatus string
	if existing, err := h.projects.Get(c.Request.Context(), projectID, nil); err == nil {
		previousName = existing.Name
		previousStatus = existing.Status
	}
	updated, err := h.projects.AdminUpdate(c.Request.Context(), projectID, req)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrInvalidProjectName):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("项目名称不能为空"))
		case errors.Is(err, projectapp.ErrInvalidProjectStatus):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("status 必须是 planning、script_analysis、asset_prep、production、editing 或 done"))
		case errors.Is(err, projectapp.ErrNoProjectFieldsToUpdate):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("没有可更新字段"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("更新项目失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.admin_updated",
		TargetType: "project",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      updated.OrgID,
		ProjectID:  &updated.ID,
		Metadata: map[string]any{
			"previous_name":   previousName,
			"name":            updated.Name,
			"previous_status": previousStatus,
			"status":          updated.Status,
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
	if strings.TrimSpace(req.Name) == "" {
		if existing, err := h.projects.Get(c.Request.Context(), parseID(c.Param("id")), currentOrgID(c)); err == nil {
			req.Name = existing.Name
			if req.Description == "" {
				req.Description = existing.Description
			}
			if req.TotalEpisodes == 0 {
				req.TotalEpisodes = existing.TotalEpisodes
			}
			if req.AspectRatio == "" {
				req.AspectRatio = existing.AspectRatio
			}
			if req.VisualStyle == "" {
				req.VisualStyle = existing.VisualStyle
			}
			if req.ProjectStyle == "" {
				req.ProjectStyle = existing.ProjectStyle
			}
		}
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
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return
		}
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
	orgID := currentOrgID(c)
	member, err := h.projects.AddMember(c.Request.Context(), parseID(c.Param("id")), req, orgID)
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return
		}
		if errors.Is(err, projectapp.ErrMemberUserNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
			return
		}
		if errors.Is(err, projectapp.ErrMemberUserInactive) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("项目成员用户必须是 active 状态"))
			return
		}
		if errors.Is(err, projectapp.ErrInvalidProjectMemberRole) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("role 必须是 director、writer、generator 或 viewer"))
			return
		}
		if errors.Is(err, projectapp.ErrProjectOwnerMemberLocked) {
			c.JSON(http.StatusConflict, apierr.Conflict("不能通过成员接口修改项目 Owner，请使用修改 Owner"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("添加项目成员失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_added",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      orgID,
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
	orgID := currentOrgID(c)
	if err := h.projects.RemoveMember(c.Request.Context(), projectID, memberID, orgID); err != nil {
		if errors.Is(err, projectapp.ErrProjectMemberNotFound) || errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目成员不存在"))
			return
		}
		if errors.Is(err, projectapp.ErrProjectOwnerMemberLocked) {
			c.JSON(http.StatusConflict, apierr.Conflict("不能直接移除项目 Owner，请先修改项目 Owner"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("移除项目成员失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member_removed",
		TargetType: "project_member",
		TargetID:   audit.TargetID(memberID),
		OrgID:      orgID,
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"member_id":  memberID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) AdminAddMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req projectapp.MemberInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.UserID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("user_id 必须有效"))
		return
	}
	member, err := h.projects.AddMember(c.Request.Context(), projectID, req, nil)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrMemberUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
		case errors.Is(err, projectapp.ErrMemberUserInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("项目成员用户必须是 active 状态"))
		case errors.Is(err, projectapp.ErrInvalidProjectMemberRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("role 必须是 director、writer、generator 或 viewer"))
		case errors.Is(err, projectapp.ErrProjectOwnerMemberLocked):
			c.JSON(http.StatusConflict, apierr.Conflict("不能通过成员接口修改项目 Owner，请使用修改 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("添加项目成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member.admin_added",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      h.adminProjectOrgID(c, projectID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"user_id":    member.UserID,
			"role":       member.Role,
		},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *ProjectHandler) AdminUpdateMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	member, err := h.projects.UpdateMemberRole(c.Request.Context(), projectID, memberID, req.Role, nil)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound), errors.Is(err, projectapp.ErrProjectMemberNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目成员不存在"))
		case errors.Is(err, projectapp.ErrInvalidProjectMemberRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("role 必须是 director、writer、generator 或 viewer"))
		case errors.Is(err, projectapp.ErrProjectOwnerMemberLocked):
			c.JSON(http.StatusConflict, apierr.Conflict("不能直接修改项目 Owner 成员角色，请使用修改 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("更新项目成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member.admin_updated",
		TargetType: "project_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      h.adminProjectOrgID(c, projectID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"user_id":    member.UserID,
			"role":       member.Role,
		},
	})
	c.JSON(http.StatusOK, member)
}

func (h *ProjectHandler) AdminRemoveMember(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	memberID := parseID(c.Param("memberId"))
	if err := h.projects.RemoveMember(c.Request.Context(), projectID, memberID, nil); err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound), errors.Is(err, projectapp.ErrProjectMemberNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目成员不存在"))
		case errors.Is(err, projectapp.ErrProjectOwnerMemberLocked):
			c.JSON(http.StatusConflict, apierr.Conflict("不能直接移除项目 Owner，请先修改项目 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("移除项目成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "project.member.admin_removed",
		TargetType: "project_member",
		TargetID:   audit.TargetID(memberID),
		OrgID:      h.adminProjectOrgID(c, projectID),
		ProjectID:  &projectID,
		Metadata: map[string]any{
			"project_id": projectID,
			"member_id":  memberID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *ProjectHandler) adminProjectOrgID(c *gin.Context, projectID uint) *uint {
	if projectID == 0 {
		return nil
	}
	project, err := h.projects.Get(c.Request.Context(), projectID, nil)
	if err != nil {
		return nil
	}
	return project.OrgID
}

func (h *ProjectHandler) ListMembers(c *gin.Context) {
	members, err := h.projects.ListMembers(c.Request.Context(), parseID(c.Param("id")), currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询项目成员失败"))
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *ProjectHandler) AdminListMembers(c *gin.Context) {
	members, err := h.projects.ListMembers(c.Request.Context(), parseID(c.Param("id")), nil)
	if err != nil {
		if errors.Is(err, projectapp.ErrProjectNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return
		}
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

func intQuery(c *gin.Context, key string, fallback int) int {
	value, err := strconv.Atoi(c.DefaultQuery(key, strconv.Itoa(fallback)))
	if err != nil {
		return fallback
	}
	return value
}
