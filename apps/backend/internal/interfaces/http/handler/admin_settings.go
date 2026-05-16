package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type AdminSettingsHandler struct {
	db      *gorm.DB
	service *adminsettings.Service
}

func NewAdminSettingsHandler(db *gorm.DB, encryptionKeyHex string) *AdminSettingsHandler {
	return &AdminSettingsHandler{db: db, service: adminsettings.NewService(db, encryptionKeyHex)}
}

func (h *AdminSettingsHandler) GetAuthSettings(c *gin.Context) {
	settings, err := h.service.PublicAuthSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询认证设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateAuthSettings(c *gin.Context) {
	var req adminsettings.AuthSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateAuthSettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidAuthSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("认证设置无效：开放注册必须启用邮箱验证码并配置 SMTP"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存认证设置失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.auth.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.AuthSettingsKey,
		Metadata: map[string]any{
			"registration_enabled":       updated.RegistrationEnabled,
			"require_email_verification": updated.RequireEmailVerification,
			"email_enabled":              updated.Email.Enabled,
			"smtp_host":                  updated.Email.Host,
			"smtp_port":                  updated.Email.Port,
			"smtp_username_set":          updated.Email.Username != "",
			"smtp_password_set":          updated.Email.PasswordSet,
			"from_email":                 updated.Email.FromEmail,
			"use_tls":                    updated.Email.UseTLS,
			"use_start_tls":              updated.Email.UseStartTLS,
		},
	})
	c.JSON(http.StatusOK, updated)
}
