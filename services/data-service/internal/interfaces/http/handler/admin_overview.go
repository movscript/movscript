package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	adminoverview "github.com/movscript/movscript/internal/app/admin/overview"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type AdminOverviewHandler struct {
	service *adminoverview.Service
}

type adminOverviewIdentityDirectory interface {
	authidentity.UserDirectory
	authidentity.OrgDirectory
}

func NewAdminOverviewHandler(db *gorm.DB, identity adminOverviewIdentityDirectory) *AdminOverviewHandler {
	return &AdminOverviewHandler{service: adminoverview.NewService(db, identity)}
}

func (h *AdminOverviewHandler) Summary(c *gin.Context) {
	summary, err := h.service.Summary(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询后台概览失败"))
		return
	}
	c.JSON(http.StatusOK, summary)
}
