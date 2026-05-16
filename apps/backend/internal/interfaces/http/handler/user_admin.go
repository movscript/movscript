package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	useradmin "github.com/movscript/movscript/internal/app/useradmin"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
	"gorm.io/gorm"
)

type UserAdminHandler struct {
	db      *gorm.DB
	service *useradmin.Service
}

func NewUserAdminHandler(db *gorm.DB) *UserAdminHandler {
	return &UserAdminHandler{db: db, service: useradmin.NewService(db)}
}

func (h *UserAdminHandler) List(c *gin.Context) {
	result, err := h.service.List(c.Request.Context(), useradmin.ListFilter{
		Query:      c.Query("q"),
		SystemRole: c.Query("system_role"),
		Status:     c.Query("status"),
		Page:       parsePositiveInt(c.Query("page"), 1),
		PageSize:   parsePositiveInt(c.Query("page_size"), 50),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询用户失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *UserAdminHandler) Create(c *gin.Context) {
	var req useradmin.CreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	created, err := h.service.Create(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, useradmin.ErrInvalidUsername):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("用户名不能为空"))
		case errors.Is(err, useradmin.ErrUserConflict):
			c.JSON(http.StatusConflict, apierr.Conflict("用户名或邮箱已存在"))
		case errors.Is(err, useradmin.ErrInvalidEmail):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("邮箱格式无效"))
		case errors.Is(err, useradmin.ErrInvalidPassword):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("密码至少需要 8 位"))
		case errors.Is(err, useradmin.ErrInvalidSystemRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("system_role 必须是 super_admin 或 user"))
		case errors.Is(err, useradmin.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("status 必须是 active、disabled 或 suspended"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("创建用户失败"))
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
		if errors.Is(err, useradmin.ErrUserNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询用户详情失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *UserAdminHandler) ResetPassword(c *gin.Context) {
	userID := parseID(c.Param("id"))
	var req useradmin.ResetPasswordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.ResetPassword(c.Request.Context(), userID, req)
	if err != nil {
		switch {
		case errors.Is(err, useradmin.ErrUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
		case errors.Is(err, useradmin.ErrInvalidPassword):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("密码至少需要 8 位"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("重置密码失败"))
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
		case errors.Is(err, useradmin.ErrUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
		case errors.Is(err, useradmin.ErrSessionNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("会话不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("撤销会话失败"))
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
		case errors.Is(err, useradmin.ErrUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("撤销用户会话失败"))
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
	var req useradmin.UpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.Update(c.Request.Context(), userID, req)
	if err != nil {
		switch {
		case errors.Is(err, useradmin.ErrUserNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
		case errors.Is(err, useradmin.ErrInvalidSystemRole):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("system_role 必须是 super_admin 或 user"))
		case errors.Is(err, useradmin.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("status 必须是 active、disabled 或 suspended"))
		case errors.Is(err, useradmin.ErrInvalidEmail):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("邮箱格式无效"))
		case errors.Is(err, useradmin.ErrUserConflict):
			c.JSON(http.StatusConflict, apierr.Conflict("邮箱已存在"))
		case errors.Is(err, useradmin.ErrNoFieldsToUpdate):
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("没有可更新字段"))
		case errors.Is(err, useradmin.ErrLastSuperAdmin):
			c.JSON(http.StatusConflict, apierr.Conflict("不能移除最后一个可用超级管理员"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("更新用户失败"))
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
