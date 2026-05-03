package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	authapp "github.com/movscript/movscript/internal/app/auth"
	"github.com/movscript/movscript/internal/audit"
	"github.com/movscript/movscript/internal/auth"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db      *gorm.DB
	tokens  *auth.Manager
	service *authapp.Service
}

func NewAuthHandler(db *gorm.DB, tokens *auth.Manager) *AuthHandler {
	return &AuthHandler{db: db, tokens: tokens, service: authapp.NewService(db)}
}

type authResponse struct {
	User           model.User                     `json:"user"`
	Token          string                         `json:"token"`
	TokenType      string                         `json:"token_type"`
	ExpiresAt      time.Time                      `json:"expires_at"`
	OrgMemberships []authapp.OrgMembershipSummary `json:"org_memberships"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := h.service.Register(c.Request.Context(), authapp.RegisterInput{Username: req.Username, Password: req.Password})
	if err != nil {
		if errors.Is(err, authapp.ErrConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
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

func (h *AuthHandler) Logout(c *gin.Context) {
	audit.Record(c, h.db, audit.Event{
		Action:     "auth.logout",
		TargetType: "session",
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuthHandler) respondWithCredential(c *gin.Context, status int, user model.User) {
	token, expiresAt, err := h.tokens.Issue(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue auth token"})
		return
	}

	memberships, err := h.service.OrgMemberships(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load org memberships"})
		return
	}

	c.JSON(status, authResponse{
		User:           user,
		Token:          token,
		TokenType:      "Bearer",
		ExpiresAt:      expiresAt,
		OrgMemberships: memberships,
	})
}
