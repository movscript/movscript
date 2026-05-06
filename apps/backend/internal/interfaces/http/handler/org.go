package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	orgapp "github.com/movscript/movscript/internal/app/org"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

type OrgHandler struct {
	service    *orgapp.Service
	commercial orgCommercialDeps
	db         *gorm.DB
}

func NewOrgHandler(db *gorm.DB) *OrgHandler {
	return &OrgHandler{service: orgapp.NewService(db), commercial: newOrgCommercialDeps(db), db: db}
}

func currentOrgMember(c *gin.Context) *model.OrganizationMember {
	m, _ := c.Get(middleware.ContextOrgMemberKey)
	return m.(*model.OrganizationMember)
}

func (h *OrgHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), currentUser(c).ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织失败"))
		return
	}
	c.JSON(http.StatusOK, items)
}

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
	org, err := h.service.Create(c.Request.Context(), u.ID, orgapp.CreateInput{Name: req.Name, Slug: req.Slug})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建组织失败"))
		return
	}
	actorID := u.ID
	audit.Record(c, h.db, audit.Event{Action: "org.create", TargetType: "organization", TargetID: audit.TargetID(org.ID), ActorID: &actorID})
	c.JSON(http.StatusCreated, org)
}

func (h *OrgHandler) Get(c *gin.Context) {
	org, err := h.service.Get(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
		return
	}
	c.JSON(http.StatusOK, org)
}

func (h *OrgHandler) Update(c *gin.Context) {
	member := currentOrgMember(c)
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if err := h.service.Update(c.Request.Context(), *member, req.Name); err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("更新失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) ListMembers(c *gin.Context) {
	members, err := h.service.ListMembers(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询成员失败"))
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *OrgHandler) AddMember(c *gin.Context) {
	caller := currentOrgMember(c)
	var req struct {
		UserID   uint   `json:"user_id"`
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.UserID == 0 && req.Username != "" {
		var target model.User
		if err := h.db.WithContext(c.Request.Context()).Where("username = ?", req.Username).First(&target).Error; err != nil {
			c.JSON(http.StatusNotFound, apierr.NotFound("用户不存在"))
			return
		}
		req.UserID = target.ID
	}
	if req.UserID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("user_id or username is required"))
		return
	}
	member, err := h.service.AddMember(c.Request.Context(), *caller, orgapp.MemberInput{UserID: req.UserID, Role: req.Role})
	if err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		if orgapp.IsDuplicateKey(err) {
			c.JSON(http.StatusConflict, apierr.Conflict("该用户已是成员"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("添加成员失败"))
		return
	}
	actorID := currentUser(c).ID
	audit.Record(c, h.db, audit.Event{Action: "org.member_added", TargetType: "org_member", TargetID: audit.TargetID(member.ID), ActorID: &actorID, Metadata: map[string]any{"org_id": caller.OrgID, "user_id": req.UserID, "role": req.Role}})
	c.JSON(http.StatusCreated, member)
}

func (h *OrgHandler) UpdateMember(c *gin.Context) {
	caller := currentOrgMember(c)
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if err := h.service.UpdateMember(c.Request.Context(), *caller, parseID(c.Param("userId")), req.Role); err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("更新角色失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) RemoveMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if err := h.service.RemoveMember(c.Request.Context(), *caller, parseID(c.Param("userId"))); err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("移除成员失败"))
		return
	}
	actorID := currentUser(c).ID
	audit.Record(c, h.db, audit.Event{Action: "org.member_removed", TargetType: "org_member", TargetID: audit.TargetID(parseID(c.Param("userId"))), ActorID: &actorID, Metadata: map[string]any{"org_id": caller.OrgID}})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) ListInvitations(c *gin.Context) {
	items, err := h.service.ListInvitations(c.Request.Context(), *currentOrgMember(c))
	if err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询邀请失败"))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *OrgHandler) CreateInvitation(c *gin.Context) {
	caller := currentOrgMember(c)
	var req struct {
		Role string `json:"role"`
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	inv, err := h.service.CreateInvitation(c.Request.Context(), *caller, currentUser(c).ID, orgapp.InvitationInput{Role: req.Role, Note: req.Note})
	if err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建邀请失败"))
		return
	}
	c.JSON(http.StatusCreated, inv)
}

func (h *OrgHandler) RevokeInvitation(c *gin.Context) {
	caller := currentOrgMember(c)
	if err := h.service.RevokeInvitation(c.Request.Context(), *caller, parseID(c.Param("invId"))); err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("撤销邀请失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) GetInvitation(c *gin.Context) {
	inv, org, err := h.service.GetInvitation(c.Request.Context(), c.Param("token"))
	if err != nil {
		switch err {
		case orgapp.ErrInviteNotFound:
			c.JSON(http.StatusNotFound, apierr.NotFound("邀请不存在或已失效"))
		case orgapp.ErrInviteUsed:
			c.JSON(http.StatusGone, apierr.Conflict("邀请已被使用"))
		case orgapp.ErrInviteExpired:
			c.JSON(http.StatusGone, apierr.Conflict("邀请已过期"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("查询邀请失败"))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"invitation": inv, "org_name": org.Name, "org_slug": org.Slug})
}

func (h *OrgHandler) AcceptInvitation(c *gin.Context) {
	var user *model.User
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		user = u.(*model.User)
	}
	var req orgapp.RegistrationInput
	if user == nil {
		var body struct {
			Username string `json:"username" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
			return
		}
		req = orgapp.RegistrationInput{Username: body.Username, Password: body.Password}
	}
	orgID, err := h.service.AcceptInvitation(c.Request.Context(), c.Param("token"), user, &req)
	if err != nil {
		switch err {
		case orgapp.ErrInviteNotFound:
			c.JSON(http.StatusNotFound, apierr.NotFound("邀请不存在或已失效"))
		case orgapp.ErrInviteUsed:
			c.JSON(http.StatusGone, apierr.Conflict("邀请已被使用"))
		case orgapp.ErrInviteExpired:
			c.JSON(http.StatusGone, apierr.Conflict("邀请已过期"))
		case orgapp.ErrConflict:
			c.JSON(http.StatusConflict, apierr.Conflict("用户名已存在"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("加入组织失败"))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "org_id": orgID})
}

func (h *OrgHandler) JoinByCode(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	orgID, err := h.service.JoinByCode(c.Request.Context(), req.Code, *currentUser(c))
	if err != nil {
		switch err {
		case orgapp.ErrInvalidCode:
			c.JSON(http.StatusNotFound, apierr.NotFound("组织码不存在或已失效"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal("加入组织失败"))
		}
		return
	}
	actorID := currentUser(c).ID
	audit.Record(c, h.db, audit.Event{Action: "org.join_by_code", TargetType: "organization", TargetID: audit.TargetID(orgID), ActorID: &actorID})
	c.JSON(http.StatusOK, gin.H{"ok": true, "org_id": orgID})
}

func (h *OrgHandler) ListGroups(c *gin.Context) {
	items, err := h.service.ListGroups(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询用户组失败"))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *OrgHandler) CreateGroup(c *gin.Context) {
	caller := currentOrgMember(c)
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	group, err := h.service.CreateGroup(c.Request.Context(), *caller, orgapp.GroupInput{Name: req.Name})
	if err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("创建用户组失败"))
		return
	}
	c.JSON(http.StatusCreated, group)
}

func (h *OrgHandler) AddGroupMember(c *gin.Context) {
	caller := currentOrgMember(c)
	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	gm, err := h.service.AddGroupMember(c.Request.Context(), *caller, parseID(c.Param("groupId")), req.UserID)
	if err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		if orgapp.IsDuplicateKey(err) {
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
	if err := h.service.RemoveGroupMember(c.Request.Context(), *caller, parseID(c.Param("groupId")), parseID(c.Param("userId"))); err != nil {
		if err == orgapp.ErrForbidden {
			c.JSON(http.StatusForbidden, apierr.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("移除失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) GetUsage(c *gin.Context) {
	result, err := h.service.GetUsage(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织用量失败"))
		return
	}
	type userUsage struct {
		UserID   uint    `json:"user_id"`
		Username string  `json:"username"`
		Cost     float64 `json:"cost"`
		Tokens   int     `json:"tokens"`
	}
	rows := make([]userUsage, 0, len(result.Rows))
	for _, row := range result.Rows {
		rows = append(rows, userUsage{UserID: row.UserID, Username: row.Username, Cost: row.TotalCost, Tokens: row.TotalTokens})
	}
	c.JSON(http.StatusOK, gin.H{"month": result.Month, "by_user": rows})
}
