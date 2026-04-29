package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/audit"
	"github.com/movscript/movscript/internal/auth"
	"github.com/movscript/movscript/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db     *gorm.DB
	tokens *auth.Manager
}

func NewAuthHandler(db *gorm.DB, tokens *auth.Manager) *AuthHandler {
	return &AuthHandler{db: db, tokens: tokens}
}

type authResponse struct {
	User      model.User `json:"user"`
	Token     string     `json:"token"`
	TokenType string     `json:"token_type"`
	ExpiresAt time.Time  `json:"expires_at"`
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

	var existing model.User
	if h.db.Where("username = ?", req.Username).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	var count int64
	h.db.Model(&model.User{}).Count(&count)

	role := "user"
	if count == 0 {
		role = "super_admin"
	}

	u := model.User{
		Username:     req.Username,
		PasswordHash: string(hash),
		SystemRole:   role,
	}
	if err := h.db.Create(&u).Error; err != nil {
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

	var u model.User
	if err := h.db.Where("username = ?", req.Username).First(&u).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
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
	c.JSON(status, authResponse{
		User:      user,
		Token:     token,
		TokenType: "Bearer",
		ExpiresAt: expiresAt,
	})
}
