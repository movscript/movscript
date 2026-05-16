package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	adminoverview "github.com/movscript/movscript/internal/app/admin/overview"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type AdminOverviewHandler struct {
	service *adminoverview.Service
}

func NewAdminOverviewHandler(db *gorm.DB) *AdminOverviewHandler {
	return &AdminOverviewHandler{service: adminoverview.NewService(db)}
}

func (h *AdminOverviewHandler) Summary(c *gin.Context) {
	summary, err := h.service.Summary(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询后台概览失败"))
		return
	}
	c.JSON(http.StatusOK, summary)
}
