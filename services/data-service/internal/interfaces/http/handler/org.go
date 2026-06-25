package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	orgapp "github.com/movscript/movscript/internal/app/org"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type OrgHandler struct {
	service  *orgapp.Service
	db       *gorm.DB
	identity orgHandlerIdentity
}

type orgHandlerIdentity interface {
	authidentity.Reader
	authidentity.UserDirectory
	authidentity.UserWithPasswordCreator
	authidentity.OrgMemberDirectory
	authidentity.OrgMemberWriter
}

func NewOrgHandler(db *gorm.DB, identity orgHandlerIdentity) *OrgHandler {
	return &OrgHandler{service: orgapp.NewServiceWithIdentity(db, identity), db: db, identity: identity}
}

func isOrgForbidden(err error) bool {
	return err == orgapp.ErrForbidden || err == orgapp.ErrPersonalOrg
}

type orgListItem struct {
	domainorg.Organization
	Role string `json:"role"`
}

func (h *OrgHandler) List(c *gin.Context) {
	if h.identity == nil {
		c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		return
	}
	items, err := h.identity.OrgMemberships(c.Request.Context(), currentUser(c).ID)
	if err != nil {
		writeAuthIdentityOrgError(c, err, "查询组织失败")
		return
	}
	response := make([]orgListItem, 0, len(items))
	for _, item := range items {
		response = append(response, orgListItem{
			Organization: domainorg.Organization{
				ID:         item.OrgID,
				Name:       item.OrgName,
				Slug:       item.OrgSlug,
				IsPersonal: item.IsPersonal,
				Plan:       item.Plan,
				Status:     item.Status,
			},
			Role: item.Role,
		})
	}
	c.JSON(http.StatusOK, response)
}

func (h *OrgHandler) Create(c *gin.Context) {
	u := currentUser(c)
	var req struct {
		Name string `json:"name" binding:"required"`
		Slug string `json:"slug" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	org, err := h.service.Create(c.Request.Context(), u.ID, orgapp.CreateInput{Name: req.Name, Slug: req.Slug})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("创建组织失败"))
		return
	}
	actorID := u.ID
	audit.Record(c, h.db, audit.Event{Action: "org.create", TargetType: "organization", TargetID: audit.TargetID(org.ID), ActorID: &actorID})
	c.JSON(http.StatusCreated, org)
}

func (h *OrgHandler) Get(c *gin.Context) {
	org, err := h.service.Get(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
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
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if err := h.service.Update(c.Request.Context(), *member, req.Name); err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("更新失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) ListMembers(c *gin.Context) {
	members, err := h.service.ListMembers(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要团队工作区"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询成员失败"))
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
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if req.UserID == 0 && req.Username == "" {
		c.JSON(http.StatusBadRequest, api.InvalidInput("user_id or username is required"))
		return
	}
	targetUser, ok := h.resolveMemberUser(c, req.UserID, req.Username)
	if !ok {
		return
	}
	member, err := h.service.AddMember(c.Request.Context(), *caller, targetUser, orgapp.MemberInput{Role: req.Role})
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		if err == orgapp.ErrInvalidRole {
			c.JSON(http.StatusBadRequest, api.InvalidInput("角色无效"))
			return
		}
		if orgapp.IsDuplicateKey(err) || err == orgapp.ErrConflict {
			c.JSON(http.StatusConflict, api.Conflict("该用户已是成员"))
			return
		}
		if err == orgapp.ErrNotFound {
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
			return
		}
		if err == orgapp.ErrUserInactive {
			c.JSON(http.StatusBadRequest, api.InvalidInput("用户未激活，不能加入组织"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("添加成员失败"))
		return
	}
	actorID := currentUser(c).ID
	audit.Record(c, h.db, audit.Event{
		Action:     "org.member_added",
		TargetType: "org_member",
		TargetID:   audit.TargetID(member.ID),
		ActorID:    &actorID,
		OrgID:      &caller.OrgID,
		Metadata: map[string]any{
			"org_id":  caller.OrgID,
			"user_id": member.UserID,
			"role":    member.Role,
		},
	})
	c.JSON(http.StatusCreated, member)
}

func (h *OrgHandler) resolveMemberUser(c *gin.Context, userID uint, username string) (domainorg.User, bool) {
	if h.identity == nil {
		c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		return domainorg.User{}, false
	}
	if userID != 0 {
		profile, err := h.identity.UserProfile(c.Request.Context(), userID)
		if err != nil {
			writeAuthIdentityUserError(c, err, "查询用户失败")
			return domainorg.User{}, false
		}
		return domainUserFromIdentityProfile(profile), true
	}
	username = strings.TrimSpace(username)
	if username == "" {
		c.JSON(http.StatusBadRequest, api.InvalidInput("user_id or username is required"))
		return domainorg.User{}, false
	}
	page, err := h.identity.ListUsers(c.Request.Context(), authidentity.ListUsersFilter{
		Query:    username,
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		writeAuthIdentityUserError(c, err, "查询用户失败")
		return domainorg.User{}, false
	}
	for _, profile := range page.Items {
		if profile.Username == username {
			return domainUserFromIdentityProfile(profile), true
		}
	}
	c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
	return domainorg.User{}, false
}

func (h *OrgHandler) UpdateMember(c *gin.Context) {
	caller := currentOrgMember(c)
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if err := h.service.UpdateMember(c.Request.Context(), *caller, parseID(c.Param("userId")), req.Role); err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		if err == orgapp.ErrInvalidRole {
			c.JSON(http.StatusBadRequest, api.InvalidInput("角色无效"))
			return
		}
		if err == orgapp.ErrLastOwner {
			c.JSON(http.StatusConflict, api.Conflict("组织至少需要保留一名所有者"))
			return
		}
		if err == orgapp.ErrConflict {
			c.JSON(http.StatusConflict, api.Conflict("成员关系冲突"))
			return
		}
		if err == orgapp.ErrNotFound {
			c.JSON(http.StatusNotFound, api.NotFound("成员不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("更新角色失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) RemoveMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if err := h.service.RemoveMember(c.Request.Context(), *caller, parseID(c.Param("userId"))); err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		if err == orgapp.ErrLastOwner {
			c.JSON(http.StatusConflict, api.Conflict("组织至少需要保留一名所有者"))
			return
		}
		if err == orgapp.ErrNotFound {
			c.JSON(http.StatusNotFound, api.NotFound("成员不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("移除成员失败"))
		return
	}
	actorID := currentUser(c).ID
	userID := parseID(c.Param("userId"))
	audit.Record(c, h.db, audit.Event{
		Action:     "org.member_removed",
		TargetType: "org_member",
		TargetID:   audit.TargetID(userID),
		ActorID:    &actorID,
		OrgID:      &caller.OrgID,
		Metadata: map[string]any{
			"org_id":  caller.OrgID,
			"user_id": userID,
		},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) ListInvitations(c *gin.Context) {
	items, err := h.service.ListInvitations(c.Request.Context(), currentDomainOrgMember(c))
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询邀请失败"))
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
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	inv, err := h.service.CreateInvitation(c.Request.Context(), *caller, currentUser(c).ID, orgapp.InvitationInput{Role: req.Role, Note: req.Note})
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		if err == orgapp.ErrInvalidRole {
			c.JSON(http.StatusBadRequest, api.InvalidInput("角色无效"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("创建邀请失败"))
		return
	}
	c.JSON(http.StatusCreated, inv)
}

func (h *OrgHandler) RevokeInvitation(c *gin.Context) {
	caller := currentOrgMember(c)
	if err := h.service.RevokeInvitation(c.Request.Context(), *caller, parseID(c.Param("invId"))); err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("撤销邀请失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) GetInvitation(c *gin.Context) {
	inv, org, err := h.service.GetInvitation(c.Request.Context(), c.Param("token"))
	if err != nil {
		if err == orgapp.ErrPersonalOrg {
			c.JSON(http.StatusForbidden, api.Forbidden("个人工作区不能作为团队邀请目标"))
			return
		}
		switch err {
		case orgapp.ErrInviteNotFound:
			c.JSON(http.StatusNotFound, api.NotFound("邀请不存在或已失效"))
		case orgapp.ErrInviteUsed:
			c.JSON(http.StatusGone, api.Conflict("邀请已被使用"))
		case orgapp.ErrInviteExpired:
			c.JSON(http.StatusGone, api.Conflict("邀请已过期"))
		case orgapp.ErrSuspended:
			c.JSON(http.StatusForbidden, api.Forbidden("组织已暂停"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("查询邀请失败"))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"invitation": inv, "org_name": org.Name, "org_slug": org.Slug})
}

func (h *OrgHandler) AcceptInvitation(c *gin.Context) {
	user := currentDomainUser(c)
	if user == nil {
		h.acceptInvitationWithNewIdentity(c)
		return
	}
	orgID, _, err := h.service.AcceptInvitation(c.Request.Context(), c.Param("token"), user)
	if err != nil {
		writeInviteAcceptError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "org_id": orgID})
}

func (h *OrgHandler) acceptInvitationWithNewIdentity(c *gin.Context) {
	if h.identity == nil {
		c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		return
	}
	var body struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	activeStatus := domainidentity.UserStatusActive
	updated, err := h.identity.CreateUserWithPassword(c.Request.Context(), authidentity.CreateUserInput{
		Username: body.Username,
		Status:   &activeStatus,
	}, body.Password)
	if err != nil {
		writeInviteIdentityError(c, err, "创建邀请用户失败")
		return
	}
	accepted := domainUserFromIdentityProfile(updated)
	orgID, acceptedUser, err := h.service.AcceptInvitation(c.Request.Context(), c.Param("token"), &accepted)
	if err != nil {
		writeInviteAcceptError(c, err)
		return
	}
	if acceptedUser == nil {
		acceptedUser = &accepted
	}
	h.respondWithInviteCredential(c, *acceptedUser, orgID)
}

func writeInviteIdentityError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, authidentity.ErrConflict):
		c.JSON(http.StatusConflict, api.Conflict("用户名已存在"))
	case errors.Is(err, authidentity.ErrBadRequest):
		c.JSON(http.StatusBadRequest, api.InvalidInput("用户身份请求无效"))
	case errors.Is(err, authidentity.ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
	case errors.Is(err, authidentity.ErrUserNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal(fallback))
	}
}

func writeInviteAcceptError(c *gin.Context, err error) {
	switch err {
	case orgapp.ErrInviteNotFound:
		c.JSON(http.StatusNotFound, api.NotFound("邀请不存在或已失效"))
	case orgapp.ErrInviteUsed:
		c.JSON(http.StatusGone, api.Conflict("邀请已被使用"))
	case orgapp.ErrInviteExpired:
		c.JSON(http.StatusGone, api.Conflict("邀请已过期"))
	case orgapp.ErrConflict:
		c.JSON(http.StatusConflict, api.Conflict("用户名已存在"))
	case orgapp.ErrSuspended:
		c.JSON(http.StatusForbidden, api.Forbidden("组织已暂停"))
	case orgapp.ErrUserInactive:
		c.JSON(http.StatusBadRequest, api.InvalidInput("用户未激活，不能加入组织"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal("加入组织失败"))
	}
}

func (h *OrgHandler) respondWithInviteCredential(c *gin.Context, user domainorg.User, orgID uint) {
	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"org_id": orgID,
		"user": gin.H{
			"id":            user.ID,
			"username":      user.Username,
			"displayName":   user.DisplayName,
			"avatarUrl":     user.AvatarURL,
			"primaryEmail":  user.PrimaryEmail,
			"primaryPhone":  user.PrimaryPhone,
			"locale":        user.Locale,
			"systemRole":    user.SystemRole,
			"emailVerified": user.EmailVerifiedAt != nil,
		},
	})
}

func (h *OrgHandler) JoinByCode(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	user := currentDomainUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	orgID, err := h.service.JoinByCode(c.Request.Context(), req.Code, *user)
	if err != nil {
		switch err {
		case orgapp.ErrInvalidCode:
			c.JSON(http.StatusNotFound, api.NotFound("组织码不存在或已失效"))
		case orgapp.ErrSuspended:
			c.JSON(http.StatusForbidden, api.Forbidden("组织已暂停"))
		case orgapp.ErrUserInactive:
			c.JSON(http.StatusBadRequest, api.InvalidInput("用户未激活，不能加入组织"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("加入组织失败"))
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
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要团队工作区"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询用户组失败"))
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
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	group, err := h.service.CreateGroup(c.Request.Context(), *caller, orgapp.GroupInput{Name: req.Name})
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("创建用户组失败"))
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
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	targetUser, ok := h.resolveMemberUser(c, req.UserID, "")
	if !ok {
		return
	}
	gm, err := h.service.AddGroupMember(c.Request.Context(), *caller, parseID(c.Param("groupId")), targetUser)
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		if orgapp.IsDuplicateKey(err) {
			c.JSON(http.StatusConflict, api.Conflict("该用户已在组内"))
			return
		}
		if err == orgapp.ErrNotFound {
			c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
			return
		}
		if err == orgapp.ErrUserInactive {
			c.JSON(http.StatusBadRequest, api.InvalidInput("用户未激活，不能加入用户组"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("添加失败"))
		return
	}
	c.JSON(http.StatusCreated, gm)
}

func (h *OrgHandler) RemoveGroupMember(c *gin.Context) {
	caller := currentOrgMember(c)
	if err := h.service.RemoveGroupMember(c.Request.Context(), *caller, parseID(c.Param("groupId")), parseID(c.Param("userId"))); err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要管理员权限"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("移除失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *OrgHandler) GetUsage(c *gin.Context) {
	result, err := h.service.GetUsage(c.Request.Context(), currentOrgMember(c).OrgID)
	if err != nil {
		if isOrgForbidden(err) {
			c.JSON(http.StatusForbidden, api.Forbidden("需要团队工作区"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询组织用量失败"))
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
		rows = append(rows, userUsage{UserID: row.UserID, Username: h.usageUsername(c, row.UserID, row.Username), Cost: row.TotalCost, Tokens: row.TotalTokens})
	}
	c.JSON(http.StatusOK, gin.H{"month": result.Month, "by_user": rows})
}

func (h *OrgHandler) usageUsername(c *gin.Context, userID uint, fallback string) string {
	if strings.TrimSpace(fallback) != "" {
		return fallback
	}
	if h.identity == nil || userID == 0 {
		return ""
	}
	profile, err := h.identity.UserProfile(c.Request.Context(), userID)
	if err != nil {
		return ""
	}
	return profile.Username
}
