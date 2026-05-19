package handler

import (
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	authapp "github.com/movscript/movscript/internal/app/auth"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/mail"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db              *gorm.DB
	service         *authapp.Service
	settingsService *adminsettings.Service
	mailSender      mail.Sender
	localAppMode    bool
}

func NewAuthHandler(db *gorm.DB, tokens *auth.Manager) *AuthHandler {
	return &AuthHandler{db: db, service: authapp.NewService(db, tokens), settingsService: adminsettings.NewService(db), mailSender: mail.SMTPSender{}}
}

func NewAuthHandlerWithConfig(db *gorm.DB, tokens *auth.Manager, cfg *config.Config) *AuthHandler {
	if cfg != nil && strings.TrimSpace(cfg.AppMode) == "local" {
		return &AuthHandler{db: db, service: authapp.NewLocalService(db, tokens), settingsService: adminsettings.NewService(db, cfg.EncryptionKey), mailSender: mail.SMTPSender{}, localAppMode: true}
	}
	handler := NewAuthHandler(db, tokens)
	if cfg != nil {
		handler.settingsService = adminsettings.NewService(db, cfg.EncryptionKey)
	}
	return handler
}

type authResponse struct {
	User           authUser                       `json:"user"`
	Token          string                         `json:"token"`
	TokenType      string                         `json:"token_type"`
	ExpiresAt      time.Time                      `json:"expires_at"`
	OrgMemberships []authapp.OrgMembershipSummary `json:"org_memberships"`
}

type authUser struct {
	ID              string `json:"id"`
	Username        string `json:"username"`
	DisplayName     string `json:"displayName"`
	AvatarURL       string `json:"avatarUrl"`
	PrimaryEmail    string `json:"primaryEmail"`
	PrimaryPhone    string `json:"primaryPhone"`
	Locale          string `json:"locale"`
	SystemRole      string `json:"systemRole"`
	EmailVerifiedAt *int64 `json:"emailVerifiedAt,omitempty"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		ChallengeID string `json:"challengeId"`
		Code        string `json:"code"`
		LocalAdmin  bool   `json:"localAdmin"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	settings, err := h.settingsService.PublicAuthSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取注册设置失败"})
		return
	}
	bootstrapRequired, err := h.service.BootstrapRequired(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取初始化状态失败"})
		return
	}
	bootstrapRegistration := req.LocalAdmin || bootstrapRequired
	if !bootstrapRegistration && !settings.RegistrationEnabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "注册已关闭，请联系管理员创建账号"})
		return
	}
	input := authapp.RegisterInput{Username: req.Username, Password: req.Password, BootstrapSystemAdmin: bootstrapRegistration}
	if settings.RequireEmailVerification && !bootstrapRegistration {
		if req.ChallengeID == "" || req.Code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先完成邮箱验证码验证"})
			return
		}
	}
	if req.ChallengeID != "" || req.Code != "" {
		challenge, err := h.verifyChallengeRequest(c, req.ChallengeID, req.Code)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码无效或已过期"})
			return
		}
		input.Email = challenge.Target
	}

	u, err := h.service.Register(c.Request.Context(), input)
	if err != nil {
		if errors.Is(err, authapp.ErrConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
			return
		}
		if errors.Is(err, authapp.ErrInvalidInput) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户名或邮箱无效"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	actorID := u.ID
	audit.Record(c, h.db, audit.Event{
		Action:     "auth.register",
		TargetType: "user",
		TargetID:   audit.TargetID(u.ID),
		ActorID:    &actorID,
		Metadata: map[string]any{
			"system_role": u.SystemRole,
		},
	})
	h.respondWithCredential(c, http.StatusCreated, u)
}

func (h *AuthHandler) LocalBootstrap(c *gin.Context) {
	var req struct {
		DisplayName string `json:"displayName"`
		Name        string `json:"name"`
		Password    string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !isLoopbackRequest(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "本地初始化只允许从本机访问"})
		return
	}
	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(req.Name)
	}
	u, err := h.service.LocalBootstrap(c.Request.Context(), authapp.LocalBootstrapInput{DisplayName: displayName, Password: req.Password})
	if err != nil {
		if errors.Is(err, authapp.ErrConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": "本地工作区已初始化"})
			return
		}
		if errors.Is(err, authapp.ErrInvalidInput) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "本地初始化只允许在本地模式下使用"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	actorID := u.ID
	audit.Record(c, h.db, audit.Event{
		Action:     "auth.local_bootstrap",
		TargetType: "user",
		TargetID:   audit.TargetID(u.ID),
		ActorID:    &actorID,
		Metadata: map[string]any{
			"system_role": u.SystemRole,
		},
	})
	h.respondWithCredential(c, http.StatusCreated, u)
}

func isLoopbackRequest(c *gin.Context) bool {
	ip := net.ParseIP(c.ClientIP())
	return ip != nil && ip.IsLoopback()
}

func (h *AuthHandler) Config(c *gin.Context) {
	settings, err := h.settingsService.PublicAuthSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取认证配置失败"})
		return
	}
	bootstrapRequired, err := h.service.BootstrapRequired(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取初始化状态失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"registration_enabled":       settings.RegistrationEnabled,
		"require_email_verification": settings.RequireEmailVerification,
		"email_verification_enabled": settings.Email.Enabled,
		"local_bootstrap_enabled":    h.localAppMode,
		"bootstrap_required":         bootstrapRequired,
		"providers": gin.H{
			"email": settings.Email.Enabled,
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	memberships, err := h.service.OrgMemberships(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load org memberships"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toAuthUser(*u), "org_memberships": memberships})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := h.service.Login(c.Request.Context(), authapp.LoginInput{Username: req.Username, Password: req.Password})
	if err != nil {
		if errors.Is(err, authapp.ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	actorID := u.ID
	audit.Record(c, h.db, audit.Event{
		Action:     "auth.login",
		TargetType: "user",
		TargetID:   audit.TargetID(u.ID),
		ActorID:    &actorID,
	})
	h.respondWithCredential(c, http.StatusOK, u)
}

func (h *AuthHandler) StartCode(c *gin.Context) {
	var req struct {
		Channel string `json:"channel"`
		Target  string `json:"target" binding:"required"`
		Purpose string `json:"purpose"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	settings, err := h.settingsService.AuthSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取邮箱设置失败"})
		return
	}
	if strings.TrimSpace(req.Purpose) == "register" && !settings.RegistrationEnabled && !h.localAppMode {
		bootstrapRequired, err := h.service.BootstrapRequired(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取初始化状态失败"})
			return
		}
		if !bootstrapRequired {
			c.JSON(http.StatusForbidden, gin.H{"error": "注册已关闭，请联系管理员创建账号"})
			return
		}
	}
	if !settings.Email.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱验证码未启用"})
		return
	}
	result, err := h.service.StartChallenge(c.Request.Context(), authapp.ChallengeStartInput{Channel: req.Channel, Target: req.Target})
	if err != nil {
		if errors.Is(err, authapp.ErrInvalidInput) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱地址无效"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !h.localAppMode {
		if err := h.mailSender.Send(c.Request.Context(), settings.SMTPConfig(), mail.Message{
			To:      req.Target,
			Subject: "Movscript verification code",
			Text:    "Your Movscript verification code is " + result.Code + ". It expires in 10 minutes.",
		}); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "验证码邮件发送失败，请检查邮箱配置"})
			return
		}
	}
	c.JSON(http.StatusOK, result)
}

func (h *AuthHandler) VerifyCode(c *gin.Context) {
	var req struct {
		ChallengeID string `json:"challengeId" binding:"required"`
		Code        string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	challenge, err := h.verifyChallengeRequest(c, req.ChallengeID, req.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码无效或已过期"})
		return
	}
	u, err := h.service.LoginWithEmail(c.Request.Context(), challenge.Target)
	if err != nil {
		if errors.Is(err, authapp.ErrInvalidCredentials) {
			c.JSON(http.StatusNotFound, gin.H{"error": "该邮箱尚未注册"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.respondWithCredential(c, http.StatusOK, u)
}

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var req struct {
		DisplayName *string `json:"displayName"`
		AvatarURL   *string `json:"avatarUrl"`
		Locale      *string `json:"locale"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.service.UpdateProfile(c.Request.Context(), u.ID, authapp.ProfileInput{
		DisplayName: req.DisplayName,
		AvatarURL:   req.AvatarURL,
		Locale:      req.Locale,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toAuthUser(updated)})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	if session, err := c.Cookie(middleware.SessionCookieName); err == nil {
		_ = h.service.RevokeSession(c.Request.Context(), session)
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "auth.logout",
		TargetType: "session",
	})
	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuthHandler) respondWithCredential(c *gin.Context, status int, user domainauth.UserProfile) {
	credential, err := h.service.IssueCredential(c.Request.Context(), authapp.CredentialInput{
		UserID:    user.ID,
		UserAgent: c.Request.UserAgent(),
		IPAddress: c.ClientIP(),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue auth token"})
		return
	}
	if credential.SessionToken != "" {
		setSessionCookie(c, credential.SessionToken, credential.SessionExpiresAt)
	}

	c.JSON(status, authResponse{
		User:           toAuthUser(user),
		Token:          credential.Token,
		TokenType:      credential.TokenType,
		ExpiresAt:      credential.ExpiresAt,
		OrgMemberships: credential.OrgMemberships,
	})
}

func (h *AuthHandler) verifyChallengeRequest(c *gin.Context, challengeID, code string) (domainauth.AuthChallenge, error) {
	id, err := strconv.ParseUint(strings.TrimSpace(challengeID), 10, 64)
	if err != nil || id == 0 {
		return domainauth.AuthChallenge{}, authapp.ErrInvalidChallenge
	}
	return h.service.VerifyChallenge(c.Request.Context(), authapp.ChallengeVerifyInput{ChallengeID: uint(id), Code: code})
}

func toAuthUser(user domainauth.UserProfile) authUser {
	return authUser{
		ID:              strconv.FormatUint(uint64(user.ID), 10),
		Username:        user.Username,
		DisplayName:     user.DisplayName,
		AvatarURL:       user.AvatarURL,
		PrimaryEmail:    deref(user.PrimaryEmail),
		PrimaryPhone:    deref(user.PrimaryPhone),
		Locale:          user.Locale,
		SystemRole:      user.SystemRole,
		EmailVerifiedAt: user.EmailVerifiedAt,
	}
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func setSessionCookie(c *gin.Context, value string, expiresAt time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    value,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
		HttpOnly: true,
		Secure:   c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
		SameSite: http.SameSiteLaxMode,
	})
}
