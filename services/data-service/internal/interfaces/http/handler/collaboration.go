package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

type UserHandler struct {
	identity authidentity.UserDirectory
}

func NewUserHandler(identity authidentity.UserDirectory) *UserHandler {
	return &UserHandler{identity: identity}
}

func (h *UserHandler) List(c *gin.Context) {
	if h.identity == nil {
		c.JSON(http.StatusServiceUnavailable, api.Internal("Auth Service identity manager 未配置"))
		return
	}
	page, err := h.identity.ListUsers(c.Request.Context(), authidentity.ListUsersFilter{
		Query:    c.Query("q"),
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		writeAuthIdentityUserError(c, err, "查询用户失败")
		return
	}
	c.JSON(http.StatusOK, page.Items)
}
