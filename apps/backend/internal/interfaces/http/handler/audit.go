package handler

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	auditapp "github.com/movscript/movscript/internal/app/audit"
	domainaudit "github.com/movscript/movscript/internal/domain/audit"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type AuditHandler struct {
	service *auditapp.Service
}

func NewAuditHandler(db *gorm.DB) *AuditHandler {
	return &AuditHandler{service: auditapp.NewService(db)}
}

func (h *AuditHandler) List(c *gin.Context) {
	filter, ok := h.parseFilter(c)
	if !ok {
		return
	}
	result, err := h.service.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询审计日志失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AuditHandler) Export(c *gin.Context) {
	filter, ok := h.parseFilter(c)
	if !ok {
		return
	}
	rows, err := h.service.Export(c.Request.Context(), filter, parsePositiveInt(c.Query("limit"), 1000))
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("导出审计日志失败"))
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="audit-logs.csv"`)
	writeAuditCSV(c.Writer, rows)
}

func (h *AuditHandler) Summary(c *gin.Context) {
	filter, ok := h.parseFilter(c)
	if !ok {
		return
	}
	result, err := h.service.Summary(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询审计日志汇总失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func writeAuditCSV(w http.ResponseWriter, rows []domainaudit.Log) {
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"id", "created_at", "actor_id", "action", "target_type", "target_id", "org_id", "project_id", "request_id", "ip_address", "user_agent", "metadata"})
	for _, row := range rows {
		_ = cw.Write([]string{
			uintCSV(row.ID),
			row.CreatedAt.Format(time.RFC3339),
			uintPtrCSV(row.ActorID),
			csvCell(row.Action),
			csvCell(row.TargetType),
			csvCell(row.TargetID),
			uintPtrCSV(row.OrgID),
			uintPtrCSV(row.ProjectID),
			csvCell(row.RequestID),
			csvCell(row.IPAddress),
			csvCell(row.UserAgent),
			csvCell(row.Metadata),
		})
	}
	cw.Flush()
}

func (h *AuditHandler) parseFilter(c *gin.Context) (auditapp.ListFilter, bool) {
	var since *time.Time
	if v := c.Query("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, api.InvalidInput("since must be RFC3339"))
			return auditapp.ListFilter{}, false
		}
		since = &t
	}
	var until *time.Time
	if v := c.Query("until"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, api.InvalidInput("until must be RFC3339"))
			return auditapp.ListFilter{}, false
		}
		until = &t
	}

	return auditapp.ListFilter{
		ActorID:    c.Query("actor_id"),
		Action:     c.Query("action"),
		TargetType: c.Query("target_type"),
		TargetID:   c.Query("target_id"),
		OrgID:      c.Query("org_id"),
		ProjectID:  c.Query("project_id"),
		Since:      since,
		Until:      until,
		Page:       parsePositiveInt(c.Query("page"), 1),
		PageSize:   parsePositiveInt(c.Query("page_size"), 50),
	}, true
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
