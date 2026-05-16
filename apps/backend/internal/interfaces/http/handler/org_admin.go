package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	orgadmin "github.com/movscript/movscript/internal/app/orgadmin"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
	"gorm.io/gorm"
)

type OrgAdminHandler struct {
	db      *gorm.DB
	service *orgadmin.Service
}

func NewOrgAdminHandler(db *gorm.DB) *OrgAdminHandler {
	return &OrgAdminHandler{db: db, service: orgadmin.NewService(db)}
}

func (h *OrgAdminHandler) List(c *gin.Context) {
	isPersonal, ok := parseOptionalBool(c, "is_personal")
	if !ok {
		return
	}
	result, err := h.service.List(c.Request.Context(), orgadmin.ListFilter{
		Query:      c.Query("q"),
		Plan:       c.Query("plan"),
		Status:     c.Query("status"),
		IsPersonal: isPersonal,
		Page:       parsePositiveInt(c.Query("page"), 1),
		PageSize:   parsePositiveInt(c.Query("page_size"), 50),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *OrgAdminHandler) Create(c *gin.Context) {
	var req orgadmin.CreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	created, err := h.service.Create(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrInvalidOrgName):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("组织名称不能为空"))
		case errors.Is(err, orgadmin.ErrUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("Owner 用户不存在"))
		case errors.Is(err, orgadmin.ErrUserInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("Owner 用户必须是 active 状态"))
		case errors.Is(err, orgadmin.ErrOrgAlreadyExists):
			c.JSON(http.StatusConflict, apierr.Conflict("组织 slug 已存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("创建组织失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.admin_created",
		TargetType: "organization",
		TargetID:   audit.TargetID(created.ID),
		OrgID:      &created.ID,
		Metadata: map[string]any{
			"name":          created.Name,
			"slug":          created.Slug,
			"owner_user_id": created.CreatedBy,
			"join_code":     created.JoinCode,
		},
	})
	c.JSON(http.StatusCreated, created)
}

func (h *OrgAdminHandler) Detail(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	detail, err := h.service.Detail(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织详情失败"))
		}
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *OrgAdminHandler) ListMembers(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	members, err := h.service.ListMembers(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织成员失败"))
		}
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *OrgAdminHandler) ListInvitations(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	invitations, err := h.service.ListInvitations(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织邀请失败"))
		}
		return
	}
	c.JSON(http.StatusOK, invitations)
}

func (h *OrgAdminHandler) AddMember(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	var req orgadmin.AddMemberInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	member, err := h.service.AddMember(c.Request.Context(), orgID, req)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		case errors.Is(err, orgadmin.ErrUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
		case errors.Is(err, orgadmin.ErrUserInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("组织成员用户必须是 active 状态"))
		case errors.Is(err, orgadmin.ErrMemberAlreadyExists):
			c.JSON(http.StatusConflict, apierr.Conflict("用户已是组织成员"))
		case errors.Is(err, orgadmin.ErrInvalidMemberRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("role 必须是 owner、admin、member 或 viewer"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("添加组织成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.member.admin_added",
		TargetType: "org_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":  orgID,
			"user_id": member.UserID,
			"role":    member.Role,
		},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *OrgAdminHandler) CreateInvitation(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	var req orgadmin.CreateInvitationInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var creatorID uint
	if user := currentUser(c); user != nil {
		creatorID = user.ID
	}
	invitation, err := h.service.CreateInvitation(c.Request.Context(), orgID, creatorID, req)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		case errors.Is(err, orgadmin.ErrOrgInactive):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("组织已暂停，不能创建邀请"))
		case errors.Is(err, orgadmin.ErrInvalidMemberRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("role 必须是 owner、admin、member 或 viewer"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("创建组织邀请失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.invitation.admin_created",
		TargetType: "org_invitation",
		TargetID:   audit.TargetID(invitation.ID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":        orgID,
			"invitation_id": invitation.ID,
			"role":          invitation.Role,
			"expires_at":    invitation.ExpiresAt,
		},
	})
	c.JSON(http.StatusCreated, invitation)
}

func (h *OrgAdminHandler) UpdateMember(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	userID := parseID(c.Param("userId"))
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	member, err := h.service.UpdateMemberRole(c.Request.Context(), orgID, userID, req.Role)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrMemberNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("成员不存在"))
		case errors.Is(err, orgadmin.ErrInvalidMemberRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("role 必须是 owner、admin、member 或 viewer"))
		case errors.Is(err, orgadmin.ErrLastOwner):
			c.JSON(http.StatusConflict, apierr.Conflict("不能移除最后一个组织 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("更新组织成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.member.admin_updated",
		TargetType: "org_member",
		TargetID:   audit.TargetID(member.ID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":  orgID,
			"user_id": userID,
			"role":    member.Role,
		},
	})
	c.JSON(http.StatusOK, member)
}

func (h *OrgAdminHandler) RemoveMember(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	userID := parseID(c.Param("userId"))
	if err := h.service.RemoveMember(c.Request.Context(), orgID, userID); err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrMemberNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("成员不存在"))
		case errors.Is(err, orgadmin.ErrLastOwner):
			c.JSON(http.StatusConflict, apierr.Conflict("不能移除最后一个组织 Owner"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("移除组织成员失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.member.admin_removed",
		TargetType: "org_member",
		TargetID:   audit.TargetID(userID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":  orgID,
			"user_id": userID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *OrgAdminHandler) RevokeInvitation(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	invitationID := parseID(c.Param("invitationId"))
	if err := h.service.RevokeInvitation(c.Request.Context(), orgID, invitationID); err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		case errors.Is(err, orgadmin.ErrInvitationNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("邀请不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("撤销组织邀请失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.invitation.admin_revoked",
		TargetType: "org_invitation",
		TargetID:   audit.TargetID(invitationID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":        orgID,
			"invitation_id": invitationID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *OrgAdminHandler) RotateJoinCode(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	updated, err := h.service.RotateJoinCode(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		case errors.Is(err, orgadmin.ErrPersonalOrgJoinCode):
			c.JSON(http.StatusConflict, apierr.Conflict("个人组织不能轮换加入码"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("轮换组织加入码失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.join_code.admin_rotated",
		TargetType: "organization",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      &updated.ID,
		Metadata: map[string]any{
			"org_id": updated.ID,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *OrgAdminHandler) Update(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	var req orgadmin.UpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.Update(c.Request.Context(), orgID, req)
	if err != nil {
		switch {
		case errors.Is(err, orgadmin.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		case errors.Is(err, orgadmin.ErrInvalidPlan):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("plan 必须是 personal 或 team"))
		case errors.Is(err, orgadmin.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("status 必须是 active 或 suspended"))
		case errors.Is(err, orgadmin.ErrNoFieldsToUpdate):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("没有可更新字段"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("更新组织失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.admin_updated",
		TargetType: "organization",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      &updated.ID,
		Metadata: map[string]any{
			"name":   updated.Name,
			"plan":   updated.Plan,
			"status": updated.Status,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func parseOptionalBool(c *gin.Context, key string) (*bool, bool) {
	raw := strings.ToLower(strings.TrimSpace(c.Query(key)))
	if raw == "" {
		return nil, true
	}
	switch raw {
	case "true", "1":
		value := true
		return &value, true
	case "false", "0":
		value := false
		return &value, true
	default:
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(key+" must be true or false"))
		return nil, false
	}
}
