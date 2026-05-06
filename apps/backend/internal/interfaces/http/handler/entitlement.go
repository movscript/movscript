package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

type EntitlementHandler struct {
	service commercial.EntitlementService
}

func NewEntitlementHandler(service commercial.EntitlementService) *EntitlementHandler {
	return &EntitlementHandler{service: service}
}

func (h *EntitlementHandler) GetCurrent(c *gin.Context) {
	if h.service == nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("权益服务未初始化"))
		return
	}
	user := currentUser(c)
	subject := commercial.SubjectRef{UserID: user.ID}
	if memberValue, ok := c.Get(middleware.ContextOrgMemberKey); ok {
		if member, ok := memberValue.(*model.OrganizationMember); ok {
			subject.OrgID = &member.OrgID
		}
	}
	snapshot, err := h.service.Resolve(c.Request.Context(), subject)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询权益失败"))
		return
	}
	c.JSON(http.StatusOK, snapshot)
}
