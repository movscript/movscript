package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	adminorg "github.com/movscript/movscript/internal/app/admin/org"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type OrgAdminHandler struct {
	db      *gorm.DB
	service *adminorg.Service
}

func NewOrgAdminHandler(db *gorm.DB, identity authidentity.OrgMemberDirectory) *OrgAdminHandler {
	return &OrgAdminHandler{db: db, service: adminorg.NewServiceWithIdentity(db, identity)}
}

func (h *OrgAdminHandler) Detail(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	detail, err := h.service.Detail(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, adminorg.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
		case errors.Is(err, adminorg.ErrIdentityUnavailable):
			c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("查询组织详情失败"))
		}
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *OrgAdminHandler) ListInvitations(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	invitations, err := h.service.ListInvitations(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, adminorg.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("查询组织邀请失败"))
		}
		return
	}
	c.JSON(http.StatusOK, invitations)
}

func (h *OrgAdminHandler) CreateInvitation(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	var req adminorg.CreateInvitationInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var creatorID uint
	if user := currentUser(c); user != nil {
		creatorID = user.ID
	}
	invitation, err := h.service.CreateInvitation(c.Request.Context(), orgID, creatorID, req)
	if err != nil {
		switch {
		case errors.Is(err, adminorg.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
		case errors.Is(err, adminorg.ErrOrgInactive):
			c.JSON(http.StatusBadRequest, api.InvalidInput("组织已暂停，不能创建邀请"))
		case errors.Is(err, adminorg.ErrInvalidMemberRole):
			c.JSON(http.StatusBadRequest, api.InvalidInput("role 必须是 owner、admin、member 或 viewer"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("创建组织邀请失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.invitation.admin_created",
		TargetType: "org_invitation",
		TargetID:   audit.TargetID(invitation.ID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":        orgID,
			"invitation_id": invitation.ID,
			"role":          invitation.Role,
			"expires_at":    invitation.ExpiresAt,
		},
	})
	c.JSON(http.StatusCreated, invitation)
}

func (h *OrgAdminHandler) RevokeInvitation(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	invitationID := parseID(c.Param("invitationId"))
	if err := h.service.RevokeInvitation(c.Request.Context(), orgID, invitationID); err != nil {
		switch {
		case errors.Is(err, adminorg.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
		case errors.Is(err, adminorg.ErrInvitationNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("邀请不存在"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("撤销组织邀请失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.invitation.admin_revoked",
		TargetType: "org_invitation",
		TargetID:   audit.TargetID(invitationID),
		OrgID:      &orgID,
		Metadata: map[string]any{
			"org_id":        orgID,
			"invitation_id": invitationID,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *OrgAdminHandler) RotateJoinCode(c *gin.Context) {
	orgID := parseID(c.Param("id"))
	updated, err := h.service.RotateJoinCode(c.Request.Context(), orgID)
	if err != nil {
		switch {
		case errors.Is(err, adminorg.ErrOrgNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
		case errors.Is(err, adminorg.ErrPersonalOrgJoinCode):
			c.JSON(http.StatusConflict, api.Conflict("个人组织不能轮换加入码"))
		case errors.Is(err, adminorg.ErrIdentityUnavailable):
			c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal("轮换组织加入码失败"))
		}
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "org.join_code.admin_rotated",
		TargetType: "organization",
		TargetID:   audit.TargetID(updated.ID),
		OrgID:      &updated.ID,
		Metadata: map[string]any{
			"org_id": updated.ID,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func writeAuthIdentityOrgError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, authidentity.ErrOrgNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("组织不存在"))
	case errors.Is(err, authidentity.ErrUserNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
	case errors.Is(err, authidentity.ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
	case errors.Is(err, authidentity.ErrBadRequest):
		c.JSON(http.StatusBadRequest, api.InvalidInput("组织身份请求无效"))
	case errors.Is(err, authidentity.ErrConflict):
		c.JSON(http.StatusConflict, api.Conflict("组织身份数据冲突"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal(fallback))
	}
}
