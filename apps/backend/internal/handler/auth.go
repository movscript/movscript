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
	User           model.User             `json:"user"`
	Token          string                 `json:"token"`
	TokenType      string                 `json:"token_type"`
	ExpiresAt      time.Time              `json:"expires_at"`
	OrgMemberships []orgMembershipSummary `json:"org_memberships"`
}

type orgMembershipSummary struct {
	OrgID      uint   `json:"org_id"`
	OrgName    string `json:"org_name"`
	OrgSlug    string `json:"org_slug"`
	IsPersonal bool   `json:"is_personal"`
	Role       string `json:"role"`
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

	// Auto-create personal org for new user
	if err := createPersonalOrg(h.db, &u); err != nil {
		// non-fatal: log but don't fail registration
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

	var members []model.OrganizationMember
	h.db.Where("user_id = ?", user.ID).Find(&members)

	memberships := make([]orgMembershipSummary, 0, len(members))
	for _, m := range members {
		var org model.Organization
		if h.db.First(&org, m.OrgID).Error != nil {
			continue
		}
		memberships = append(memberships, orgMembershipSummary{
			OrgID:      org.ID,
			OrgName:    org.Name,
			OrgSlug:    org.Slug,
			IsPersonal: org.IsPersonal,
			Role:       m.Role,
		})
	}

	c.JSON(status, authResponse{
		User:           user,
		Token:          token,
		TokenType:      "Bearer",
		ExpiresAt:      expiresAt,
		OrgMemberships: memberships,
	})
}
