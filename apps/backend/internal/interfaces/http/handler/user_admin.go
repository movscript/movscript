package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	adminuser "github.com/movscript/movscript/internal/app/admin/user"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type UserAdminHandler struct {
	db      *gorm.DB
	service *adminuser.Service
}

func NewUserAdminHandler(db *gorm.DB) *UserAdminHandler {
	return &UserAdminHandler{db: db, service: adminuser.NewService(db)}
}

func (h *UserAdminHandler) List(c *gin.Context) {
	result, err := h.service.List(c.Request.Context(), adminuser.ListFilter{
		Query:      c.Query("q"),
		SystemRole: c.Query("system_role"),
		Status:     c.Query("status"),
		Page:       parsePositiveInt(c.Query("page"), 1),
		PageSize:   parsePositiveInt(c.Query("page_size"), 50),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询用户失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *UserAdminHandler) Create(c *gin.Context) {
	var req adminuser.CreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	created, err := h.service.Create(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, adminuser.ErrInvalidUsername):
			c.JSON(http.StatusBadRequest, api.InvalidInput("用户名不能为空"))
		case errors.Is(err, adminuser.ErrUserConflict):
			c.JSON(http.StatusConflict, api.Conflict("用户名或邮箱已存在"))
		case errors.Is(err, adminuser.ErrInvalidEmail):
			c.JSON(http.StatusBadRequest, api.InvalidInput("邮箱格式无效"))
		case errors.Is(err, adminuser.ErrInvalidPassword):
			c.JSON(http.StatusBadRequest, api.InvalidInput("密码至少需要 8 位"))
		case errors.Is(err, adminuser.ErrInvalidSystemRole):
			c.JSON(http.StatusBadRequest, api.InvalidInput("system_role 必须是 super_admin 或 user"))
		case errors.Is(err, adminuser.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, api.InvalidInput("status 必须是 active、disabled 或 suspended"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("创建用户失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "user.admin_created",
		TargetType: "user",
		TargetID:   audit.TargetID(created.ID),
		Metadata: map[string]any{
			"system_role": created.SystemRole,
			"status":      created.Status,
		},
	})
	c.JSON(http.StatusCreated, created)
}

func (h *UserAdminHandler) Detail(c *gin.Context) {
	result, err := h.service.Detail(c.Request.Context(), parseID(c.Param("id")))
	if err != nil {
		if errors.Is(err, adminuser.ErrUserNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询用户详情失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *UserAdminHandler) ResetPassword(c *gin.Context) {
	userID := parseID(c.Param("id"))
	var req adminuser.ResetPasswordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.ResetPassword(c.Request.Context(), userID, req)
	if err != nil {
		switch {
		case errors.Is(err, adminuser.ErrUserNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
		case errors.Is(err, adminuser.ErrInvalidPassword):
			c.JSON(http.StatusBadRequest, api.InvalidInput("密码至少需要 8 位"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("重置密码失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "user.password.admin_reset",
		TargetType: "user",
		TargetID:   audit.TargetID(updated.ID),
	})
	c.JSON(http.StatusOK, updated)
}

func (h *UserAdminHandler) RevokeSession(c *gin.Context) {
	userID := parseID(c.Param("id"))
	sessionID := parseID(c.Param("sessionId"))
	if err := h.service.RevokeSession(c.Request.Context(), userID, sessionID); err != nil {
		switch {
		case errors.Is(err, adminuser.ErrUserNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
		case errors.Is(err, adminuser.ErrSessionNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("会话不存在"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("撤销会话失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "user.session.admin_revoked",
		TargetType: "auth_session",
		TargetID:   audit.TargetID(sessionID),
		Metadata: map[string]any{
			"user_id":    userID,
			"session_id": sessionID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *UserAdminHandler) RevokeAllSessions(c *gin.Context) {
	userID := parseID(c.Param("id"))
	count, err := h.service.RevokeAllSessions(c.Request.Context(), userID)
	if err != nil {
		switch {
		case errors.Is(err, adminuser.ErrUserNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("撤销用户会话失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "user.sessions.admin_revoked",
		TargetType: "user",
		TargetID:   audit.TargetID(userID),
		Metadata: map[string]any{
			"user_id":       userID,
			"revoked_count": count,
		},
	})
	c.JSON(http.StatusOK, gin.H{"revoked_count": count})
}

func (h *UserAdminHandler) Update(c *gin.Context) {
	userID := parseID(c.Param("id"))
	var req adminuser.UpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.Update(c.Request.Context(), userID, req)
	if err != nil {
		switch {
		case errors.Is(err, adminuser.ErrUserNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
		case errors.Is(err, adminuser.ErrInvalidSystemRole):
			c.JSON(http.StatusBadRequest, api.InvalidInput("system_role 必须是 super_admin 或 user"))
		case errors.Is(err, adminuser.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, api.InvalidInput("status 必须是 active、disabled 或 suspended"))
		case errors.Is(err, adminuser.ErrInvalidEmail):
			c.JSON(http.StatusBadRequest, api.InvalidInput("邮箱格式无效"))
		case errors.Is(err, adminuser.ErrUserConflict):
			c.JSON(http.StatusConflict, api.Conflict("邮箱已存在"))
		case errors.Is(err, adminuser.ErrNoFieldsToUpdate):
			c.JSON(http.StatusBadRequest, api.InvalidInput("没有可更新字段"))
		case errors.Is(err, adminuser.ErrLastSuperAdmin):
			c.JSON(http.StatusConflict, api.Conflict("不能移除最后一个可用超级管理员"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("更新用户失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "user.admin_updated",
		TargetType: "user",
		TargetID:   audit.TargetID(updated.ID),
		Metadata: map[string]any{
			"system_role":          updated.SystemRole,
			"status":               updated.Status,
			"display_name_changed": req.DisplayName != nil,
			"email_changed":        req.Email != nil,
		},
	})
	c.JSON(http.StatusOK, updated)
}
