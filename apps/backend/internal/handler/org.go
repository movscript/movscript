package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/audit"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type OrgHandler struct{ db *gorm.DB }

func NewOrgHandler(db *gorm.DB) *OrgHandler { return &OrgHandler{db: db} }

// ── helpers ───────────────────────────────────────────────────────────────────

func currentOrgMember(c *gin.Context) *model.OrganizationMember {
	m, _ := c.Get(middleware.ContextOrgMemberKey)
	return m.(*model.OrganizationMember)
}

func isOrgAdminOrAbove(role string) bool {
	return role == "owner" || role == "admin"
}

func generateInviteToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ── List orgs for current user ────────────────────────────────────────────────

func (h *OrgHandler) List(c *gin.Context) {
	u := currentUser(c)
	var members []model.OrganizationMember
	if err := h.db.Where("user_id = ?", u.ID).Find(&members).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织失败"))
		return
	}

	type orgItem struct {
		model.Organization
		Role string `json:"role"`
	}

	result := make([]orgItem, 0, len(members))
	for _, m := range members {
		var org model.Organization
		if err := h.db.First(&org, m.OrgID).Error; err != nil {
			continue
		}
		result = append(result, orgItem{Organization: org, Role: m.Role})
	}
	c.JSON(http.StatusOK, result)
}

// ── Create org ────────────────────────────────────────────────────────────────

func (h *OrgHandler) Create(c *gin.Context) {
	u := currentUser(c)
	var req struct {
		Name string `json:"name" binding:"required"`
		Slug string `json:"slug" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	var org model.Organization
	err := h.db.Transaction(func(tx *gorm.DB) error {
		org = model.Organization{Name: req.Name, Slug: req.Slug, CreatedBy: u.ID}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		member := model.OrganizationMember{OrgID: org.ID, UserID: u.ID, Role: "owner"}
		return tx.Create(&member).Error
	})
	if err != nil {
		if isDuplicateKey(err) {
			c.JSON(http.StatusConflict, apierr.Conflict("组织标识符已存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建组织失败"))
		return
	}

	actorID := u.ID
	audit.Record(c, h.db, audit.Event{
		Action: "org.create", TargetType: "organization", TargetID: audit.TargetID(org.ID), ActorID: &actorID,
	})
	c.JSON(http.StatusCreated, org)
}

// ── Get org ───────────────────────────────────────────────────────────────────

func (h *OrgHandler) Get(c *gin.Context) {
	orgID := currentOrgMember(c).OrgID
	var org model.Organization
	if err := h.db.First(&org, orgID).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		return
	}
	c.JSON(http.StatusOK, org)
}

// ── Update org ────────────────────────────────────────────────────────────────

func (h *OrgHandler) Update(c *gin.Context) {
	member := currentOrgMember(c)
	if !isOrgAdminOrAbove(member.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if err := h.db.Model(&model.Organization{}).Where("id = ?", member.OrgID).Update("name", req.Name).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("更新失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Members ───────────────────────────────────────────────────────────────────

func (h *OrgHandler) ListMembers(c *gin.Context) {
	orgID := currentOrgMember(c).OrgID
	var members []model.OrganizationMember
	if err := h.db.Preload("User").Where("org_id = ?", orgID).Find(&members).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询成员失败"))
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *OrgHandler) AddMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	var req struct {
		UserID uint   `json:"user_id" binding:"required"`
		Role   string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.Role == "" {
		req.Role = "member"
	}

	member := model.OrganizationMember{OrgID: caller.OrgID, UserID: req.UserID, Role: req.Role}
	if err := h.db.Create(&member).Error; err != nil {
		if isDuplicateKey(err) {
			c.JSON(http.StatusConflict, apierr.Conflict("该用户已是成员"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("添加成员失败"))
		return
	}
	actorID := currentUser(c).ID
	audit.Record(c, h.db, audit.Event{
		Action: "org.member_added", TargetType: "org_member", TargetID: audit.TargetID(member.ID),
		ActorID: &actorID, Metadata: map[string]any{"org_id": caller.OrgID, "user_id": req.UserID, "role": req.Role},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *OrgHandler) UpdateMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	targetUserID := parseID(c.Param("userId"))
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if err := h.db.Model(&model.OrganizationMember{}).
		Where("org_id = ? AND user_id = ?", caller.OrgID, targetUserID).
		Update("role", req.Role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("更新角色失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) RemoveMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	targetUserID := parseID(c.Param("userId"))
	if err := h.db.Where("org_id = ? AND user_id = ?", caller.OrgID, targetUserID).
		Delete(&model.OrganizationMember{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("移除成员失败"))
		return
	}
	actorID := currentUser(c).ID
	audit.Record(c, h.db, audit.Event{
		Action: "org.member_removed", TargetType: "org_member", TargetID: audit.TargetID(targetUserID),
		ActorID: &actorID, Metadata: map[string]any{"org_id": caller.OrgID},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Invitations ───────────────────────────────────────────────────────────────

func (h *OrgHandler) ListInvitations(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	var invitations []model.OrgInvitation
	if err := h.db.Where("org_id = ?", caller.OrgID).Order("id desc").Find(&invitations).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询邀请失败"))
		return
	}
	c.JSON(http.StatusOK, invitations)
}

func (h *OrgHandler) CreateInvitation(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	var req struct {
		Role string `json:"role"`
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.Role == "" {
		req.Role = "member"
	}

	token, err := generateInviteToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("生成邀请 token 失败"))
		return
	}

	inv := model.OrgInvitation{
		OrgID:     caller.OrgID,
		Token:     token,
		Role:      req.Role,
		Note:      req.Note,
		CreatedBy: currentUser(c).ID,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	if err := h.db.Create(&inv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建邀请失败"))
		return
	}
	c.JSON(http.StatusCreated, inv)
}

func (h *OrgHandler) RevokeInvitation(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	invID := parseID(c.Param("invId"))
	if err := h.db.Where("id = ? AND org_id = ?", invID, caller.OrgID).Delete(&model.OrgInvitation{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("撤销邀请失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Public invitation endpoints (no auth required) ────────────────────────────

func (h *OrgHandler) GetInvitation(c *gin.Context) {
	token := c.Param("token")
	var inv model.OrgInvitation
	if err := h.db.Where("token = ?", token).First(&inv).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("邀请不存在或已失效"))
		return
	}
	if inv.UsedAt != nil {
		c.JSON(http.StatusGone, apierr.Conflict("邀请已被使用"))
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		c.JSON(http.StatusGone, apierr.Conflict("邀请已过期"))
		return
	}

	var org model.Organization
	h.db.First(&org, inv.OrgID)

	c.JSON(http.StatusOK, gin.H{
		"invitation": inv,
		"org_name":   org.Name,
		"org_slug":   org.Slug,
	})
}

// AcceptInvitation handles two cases:
// 1. Authenticated user: just join the org.
// 2. Unauthenticated user: register (username+password in body) then join.
func (h *OrgHandler) AcceptInvitation(c *gin.Context) {
	token := c.Param("token")

	var inv model.OrgInvitation
	if err := h.db.Where("token = ?", token).First(&inv).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("邀请不存在或已失效"))
		return
	}
	if inv.UsedAt != nil {
		c.JSON(http.StatusGone, apierr.Conflict("邀请已被使用"))
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		c.JSON(http.StatusGone, apierr.Conflict("邀请已过期"))
		return
	}

	var user *model.User

	// Check if already authenticated
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		user = u.(*model.User)
	} else {
		// Register new user
		var req struct {
			Username string `json:"username" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		var existing model.User
		if h.db.Where("username = ?", req.Username).First(&existing).Error == nil {
			c.JSON(http.StatusConflict, apierr.Conflict("用户名已存在"))
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal("密码处理失败"))
			return
		}
		newUser := model.User{Username: req.Username, PasswordHash: string(hash), SystemRole: "user"}
		if err := h.db.Create(&newUser).Error; err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal("注册失败"))
			return
		}
		// Auto-create personal org for new user
		if err := createPersonalOrg(h.db, &newUser); err != nil {
			// non-fatal
		}
		user = &newUser
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		var existing model.OrganizationMember
		if tx.Where("org_id = ? AND user_id = ?", inv.OrgID, user.ID).First(&existing).Error == nil {
			return nil // already a member, idempotent
		}
		member := model.OrganizationMember{OrgID: inv.OrgID, UserID: user.ID, Role: inv.Role}
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&inv).Updates(map[string]any{"used_by": user.ID, "used_at": now}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("加入组织失败"))
		return
	}

	actorID := user.ID
	audit.Record(c, h.db, audit.Event{
		Action: "org.invitation_accepted", TargetType: "org_invitation", TargetID: audit.TargetID(inv.ID),
		ActorID: &actorID, Metadata: map[string]any{"org_id": inv.OrgID},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true, "org_id": inv.OrgID})
}

// ── User Groups ───────────────────────────────────────────────────────────────

func (h *OrgHandler) ListGroups(c *gin.Context) {
	orgID := currentOrgMember(c).OrgID
	var groups []model.UserGroup
	if err := h.db.Preload("Members.User").Where("org_id = ?", orgID).Find(&groups).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询用户组失败"))
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (h *OrgHandler) CreateGroup(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	group := model.UserGroup{OrgID: caller.OrgID, Name: req.Name}
	if err := h.db.Create(&group).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建用户组失败"))
		return
	}
	c.JSON(http.StatusCreated, group)
}

func (h *OrgHandler) AddGroupMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	groupID := parseID(c.Param("groupId"))
	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	gm := model.UserGroupMember{GroupID: groupID, UserID: req.UserID}
	if err := h.db.Create(&gm).Error; err != nil {
		if isDuplicateKey(err) {
			c.JSON(http.StatusConflict, apierr.Conflict("该用户已在组内"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("添加失败"))
		return
	}
	c.JSON(http.StatusCreated, gm)
}

func (h *OrgHandler) RemoveGroupMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}
	groupID := parseID(c.Param("groupId"))
	userID := parseID(c.Param("userId"))
	if err := h.db.Where("group_id = ? AND user_id = ?", groupID, userID).Delete(&model.UserGroupMember{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("移除失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Org Usage ─────────────────────────────────────────────────────────────────

func (h *OrgHandler) GetUsage(c *gin.Context) {
	caller := currentOrgMember(c)
	if !isOrgAdminOrAbove(caller.Role) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
		return
	}

	type userUsage struct {
		UserID   uint    `json:"user_id"`
		Username string  `json:"username"`
		Cost     float64 `json:"cost"`
		Tokens   int     `json:"tokens"`
	}

	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var rows []struct {
		UserID       uint
		Username     string
		TotalCost    float64
		TotalTokens  int
	}
	h.db.Table("usage_logs ul").
		Select("ul.user_id, u.username, SUM(ul.cost) as total_cost, SUM(ul.input_tokens + ul.output_tokens) as total_tokens").
		Joins("JOIN users u ON u.id = ul.user_id").
		Where("ul.org_id = ? AND ul.created_at >= ? AND ul.deleted_at IS NULL", caller.OrgID, startOfMonth).
		Group("ul.user_id, u.username").
		Scan(&rows)

	result := make([]userUsage, 0, len(rows))
	for _, r := range rows {
		result = append(result, userUsage{UserID: r.UserID, Username: r.Username, Cost: r.TotalCost, Tokens: r.TotalTokens})
	}
	c.JSON(http.StatusOK, gin.H{"month": startOfMonth.Format("2006-01"), "by_user": result})
}

// ── createPersonalOrg is shared with auth handler ─────────────────────────────

func createPersonalOrg(db *gorm.DB, user *model.User) error {
	slug := user.Username
	// ensure slug uniqueness by appending user ID if needed
	var count int64
	db.Model(&model.Organization{}).Where("slug = ?", slug).Count(&count)
	if count > 0 {
		slug = slug + "-" + audit.TargetID(user.ID)
	}

	org := model.Organization{
		Name:       user.Username,
		Slug:       slug,
		IsPersonal: true,
		CreatedBy:  user.ID,
	}
	if err := db.Create(&org).Error; err != nil {
		return err
	}
	member := model.OrganizationMember{OrgID: org.ID, UserID: user.ID, Role: "owner"}
	return db.Create(&member).Error
}

// isDuplicateKey checks for unique constraint violations across postgres and sqlite.
func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "duplicate key") || contains(msg, "UNIQUE constraint failed") || contains(msg, "unique_violation")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
