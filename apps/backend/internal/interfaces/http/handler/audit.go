package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	auditapp "github.com/movscript/movscript/internal/app/audit"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

type AuditHandler struct {
	service *auditapp.Service
}

func NewAuditHandler(db *gorm.DB) *AuditHandler {
	return &AuditHandler{service: auditapp.NewService(db)}
}

func (h *AuditHandler) List(c *gin.Context) {
	var since *time.Time
	if v := c.Query("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("since must be RFC3339"))
			return
		}
		since = &t
	}
	var until *time.Time
	if v := c.Query("until"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("until must be RFC3339"))
			return
		}
		until = &t
	}

	result, err := h.service.List(c.Request.Context(), auditapp.ListFilter{
		ActorID:    c.Query("actor_id"),
		Action:     c.Query("action"),
		TargetType: c.Query("target_type"),
		TargetID:   c.Query("target_id"),
		ProjectID:  c.Query("project_id"),
		Since:      since,
		Until:      until,
		Page:       parsePositiveInt(c.Query("page"), 1),
		PageSize:   parsePositiveInt(c.Query("page_size"), 50),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询审计日志失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func parsePositiveInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
