package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	adminuser "github.com/movscript/movscript/internal/app/admin/user"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type UserAdminHandler struct {
	identity authidentity.Reader
	service  *adminuser.Service
}

func NewUserAdminHandler(db *gorm.DB, identity authidentity.Reader) *UserAdminHandler {
	return &UserAdminHandler{identity: identity, service: adminuser.NewService(db)}
}

func (h *UserAdminHandler) Detail(c *gin.Context) {
	if h.identity == nil {
		c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		return
	}
	userID := parseID(c.Param("id"))
	profile, err := h.identity.UserProfile(c.Request.Context(), userID)
	if err != nil {
		writeAuthIdentityUserError(c, err, "查询用户详情失败")
		return
	}
	result := adminuser.Detail{User: profile}
	if local, err := h.service.Detail(c.Request.Context(), userID); err == nil {
		result.Projects = local.Projects
		result.Usage = local.Usage
		result.Audit = local.Audit
	}
	if memberships, err := h.identity.OrgMemberships(c.Request.Context(), userID); err == nil {
		result.Orgs = make([]adminuser.OrgMembership, 0, len(memberships))
		for _, membership := range memberships {
			result.Orgs = append(result.Orgs, adminuser.OrgMembership{
				ID:     membership.OrgID,
				Name:   membership.OrgName,
				Slug:   membership.OrgSlug,
				Plan:   membership.Plan,
				Status: membership.Status,
				Role:   membership.Role,
			})
		}
	}
	c.JSON(http.StatusOK, result)
}

func writeAuthIdentityUserError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, authidentity.ErrUserNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("用户不存在"))
	case errors.Is(err, authidentity.ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
	case errors.Is(err, authidentity.ErrBadRequest):
		c.JSON(http.StatusBadRequest, api.InvalidInput("用户身份请求无效"))
	case errors.Is(err, authidentity.ErrConflict):
		c.JSON(http.StatusConflict, api.Conflict("用户身份数据冲突"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal(fallback))
	}
}
