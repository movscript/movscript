package handler

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	usageadmin "github.com/movscript/movscript/internal/app/usageadmin"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

type UsageAdminHandler struct {
	service *usageadmin.Service
}

func NewUsageAdminHandler(db *gorm.DB) *UsageAdminHandler {
	return &UsageAdminHandler{service: usageadmin.NewService(db)}
}

func (h *UsageAdminHandler) List(c *gin.Context) {
	filter, ok := h.parseFilter(c)
	if !ok {
		return
	}
	result, err := h.service.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询用量日志失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *UsageAdminHandler) Export(c *gin.Context) {
	filter, ok := h.parseFilter(c)
	if !ok {
		return
	}
	rows, err := h.service.Export(c.Request.Context(), filter, parsePositiveInt(c.Query("limit"), 1000))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("导出用量日志失败"))
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="usage-logs.csv"`)
	writeUsageCSV(c.Writer, rows)
}

func (h *UsageAdminHandler) Summary(c *gin.Context) {
	filter, ok := h.parseFilter(c)
	if !ok {
		return
	}
	result, err := h.service.Summary(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询用量汇总失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *UsageAdminHandler) parseFilter(c *gin.Context) (usageadmin.ListFilter, bool) {
	since, ok := parseOptionalRFC3339(c, "since")
	if !ok {
		return usageadmin.ListFilter{}, false
	}
	until, ok := parseOptionalRFC3339(c, "until")
	if !ok {
		return usageadmin.ListFilter{}, false
	}

	return usageadmin.ListFilter{
		UserID:        c.Query("user_id"),
		OrgID:         c.Query("org_id"),
		ProjectID:     c.Query("project_id"),
		ModelConfigID: c.Query("model_config_id"),
		ProviderID:    c.Query("provider_id"),
		OperationType: c.Query("operation_type"),
		Since:         since,
		Until:         until,
		Page:          parsePositiveInt(c.Query("page"), 1),
		PageSize:      parsePositiveInt(c.Query("page_size"), 50),
	}, true
}

func parseOptionalRFC3339(c *gin.Context, key string) (*time.Time, bool) {
	raw := c.Query(key)
	if raw == "" {
		return nil, true
	}
	value, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(key+" must be RFC3339"))
		return nil, false
	}
	return &value, true
}

func writeUsageCSV(w http.ResponseWriter, rows []usageadmin.Log) {
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"id", "created_at", "user_id", "username", "org_id", "project_id", "model_config_id", "model", "operation_type", "input_tokens", "output_tokens", "duration_sec", "image_count", "cost", "usage_reservation_id", "gateway_api_key_id"})
	for _, row := range rows {
		model := ""
		if row.AIModelConfig != nil {
			model = row.AIModelConfig.ShortName
			if model == "" {
				model = row.AIModelConfig.CustomDisplayName
			}
			if model == "" {
				model = row.AIModelConfig.ModelIDOverride
			}
			if model == "" {
				model = row.AIModelConfig.ModelDefID
			}
		}
		username := ""
		if row.User != nil {
			username = row.User.Username
		}
		_ = cw.Write([]string{
			uintCSV(row.ID),
			row.CreatedAt.Format(time.RFC3339),
			uintCSV(row.UserID),
			csvCell(username),
			uintPtrCSV(row.OrgID),
			uintPtrCSV(row.ProjectID),
			uintCSV(row.AIModelConfigID),
			csvCell(model),
			csvCell(row.OperationType),
			strconv.Itoa(row.InputTokens),
			strconv.Itoa(row.OutputTokens),
			strconv.Itoa(row.DurationSec),
			strconv.Itoa(row.ImageCount),
			strconv.FormatFloat(row.Cost, 'f', -1, 64),
			uintPtrCSV(row.UsageReservationID),
			uintPtrCSV(row.GatewayAPIKeyID),
		})
	}
	cw.Flush()
}

func uintCSV(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}

func uintPtrCSV(value *uint) string {
	if value == nil {
		return ""
	}
	return uintCSV(*value)
}

func csvCell(value string) string {
	if value == "" {
		return ""
	}
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if trimmed == "" {
		return value
	}
	switch trimmed[0] {
	case '=', '+', '-', '@':
		return "'" + value
	default:
		return value
	}
}
