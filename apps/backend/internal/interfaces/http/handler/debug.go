package handler

import (
	"context"
	"errors"
	"net/http"
	neturl "net/url"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/adminsettings"
	debugapp "github.com/movscript/movscript/internal/app/debug"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
	"gorm.io/gorm"
)

type DebugHandler struct {
	db       *gorm.DB
	service  *debugapp.Service
	settings *adminsettings.Service
}

func NewDebugHandler(db *gorm.DB, encryptionKey []byte) *DebugHandler {
	return &DebugHandler{db: db, service: debugapp.NewService(db, encryptionKey), settings: adminsettings.NewService(db)}
}

// RawCall sends an arbitrary HTTP request from the backend and returns full details.
// Optionally uses a stored credential to fill in auth headers.
// POST /admin/debug/raw-call
func (h *DebugHandler) RawCall(c *gin.Context) {
	var req struct {
		CredentialID *uint             `json:"credential_id"` // optional: fill auth from stored cred
		URL          string            `json:"url" binding:"required"`
		Method       string            `json:"method" binding:"required"` // GET|POST|PUT|DELETE
		Headers      map[string]string `json:"headers"`
		Body         string            `json:"body"` // raw string (JSON or otherwise)
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	result := h.service.RawCall(ctx, debugapp.RawCallInput{
		CredentialID: req.CredentialID,
		URL:          req.URL,
		Method:       req.Method,
		Headers:      req.Headers,
		Body:         req.Body,
	})
	audit.Record(c, h.db, audit.Event{
		Action:     "debug.raw_call.admin_executed",
		TargetType: "debug_raw_call",
		TargetID:   "",
		Metadata: map[string]any{
			"url":               redactAuditURL(result.URL),
			"method":            result.Method,
			"credential_id":     req.CredentialID,
			"has_body":          req.Body != "",
			"response_status":   result.ResponseStatus,
			"latency_ms":        result.LatencyMs,
			"error":             result.Error,
			"request_headers":   redactHeaderNames(req.Headers),
			"response_body_len": len(result.ResponseBody),
		},
	})
	c.JSON(http.StatusOK, result)
}

// ListJobs returns Jobs with full debug info for the job monitor.
// GET /admin/debug/jobs?status=&limit=&offset=
func (h *DebugHandler) ListJobs(c *gin.Context) {
	status := c.Query("status") // optional filter
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	items, total, err := h.service.ListJobDetails(c.Request.Context(), status, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	c.JSON(http.StatusOK, items)
}

func (h *DebugHandler) JobStats(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("recent_limit", "10"))
	stats, err := h.service.JobStats(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *DebugHandler) SystemHealth(c *gin.Context) {
	stats, err := h.service.JobStats(c.Request.Context(), 10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	thresholds, err := h.settings.SystemHealthThresholds(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("读取系统健康阈值失败"))
		return
	}
	c.JSON(http.StatusOK, buildSystemHealth(observability.DefaultHTTPMetrics().Snapshot(), stats, thresholds))
}

func (h *DebugHandler) GetHealthSettings(c *gin.Context) {
	thresholds, err := h.settings.SystemHealthThresholds(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("读取系统健康阈值失败"))
		return
	}
	c.JSON(http.StatusOK, thresholds)
}

func (h *DebugHandler) UpdateHealthSettings(c *gin.Context) {
	var req adminsettings.SystemHealthThresholds
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	thresholds, err := h.settings.UpdateSystemHealthThresholds(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidSystemHealthThresholds) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("健康阈值必须非负，且 critical 不小于 warning"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("保存系统健康阈值失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "debug.health_settings.admin_updated",
		TargetType: "debug_health_settings",
		TargetID:   adminsettings.SystemHealthThresholdsKey,
		Metadata:   systemHealthThresholdsAuditMetadata(thresholds),
	})
	c.JSON(http.StatusOK, thresholds)
}

// ProviderCall builds a temporary provider from caller-supplied credentials and
// calls the given capability. The backend never stores these credentials.
// POST /admin/debug/provider-call
func (h *DebugHandler) ProviderCall(c *gin.Context) {
	var req struct {
		AdapterType string         `json:"adapter_type" binding:"required"`
		BaseURL     string         `json:"base_url"`
		APIKey      string         `json:"api_key"`      // plain-text; never persisted
		EndpointURL string         `json:"endpoint_url"` // full URL; capability inferred from path
		Capability  string         `json:"capability"`   // text|image|video; ignored when endpoint_url is set
		Model       string         `json:"model"`
		Prompt      string         `json:"prompt"`
		Params      map[string]any `json:"params"`  // capability-specific extra params
		DryRun      bool           `json:"dry_run"` // if true, build request but do not send
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	result := h.service.ProviderCall(ctx, debugapp.ProviderCallInput{
		AdapterType: req.AdapterType,
		BaseURL:     req.BaseURL,
		APIKey:      req.APIKey,
		EndpointURL: req.EndpointURL,
		Capability:  req.Capability,
		Model:       req.Model,
		Prompt:      req.Prompt,
		Params:      req.Params,
		DryRun:      req.DryRun,
	})
	audit.Record(c, h.db, audit.Event{
		Action:     "debug.provider_call.admin_executed",
		TargetType: "debug_provider_call",
		TargetID:   "",
		Metadata:   providerCallAuditMetadata(req.AdapterType, req.BaseURL, req.EndpointURL, req.Capability, req.Model, req.Params, req.DryRun, result),
	})
	c.JSON(http.StatusOK, result)
}

// GetJob returns a single Job with full debug info.
// GET /admin/debug/jobs/:id
func (h *DebugHandler) GetJob(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.service.GetJobDetail(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}

	c.JSON(http.StatusOK, detail)
}

func redactHeaderNames(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return map[string]string{}
	}
	out := make(map[string]string, len(headers))
	for key, value := range headers {
		if key == "" {
			continue
		}
		if len(value) > 0 {
			out[key] = "[set]"
			continue
		}
		out[key] = ""
	}
	return out
}

func providerCallAuditMetadata(adapterType string, baseURL string, endpointURL string, capability string, model string, params map[string]any, dryRun bool, result ai.DebugCallResult) map[string]any {
	paramKeys := make([]string, 0, len(params))
	for key := range params {
		paramKeys = append(paramKeys, key)
	}
	sort.Strings(paramKeys)
	return map[string]any{
		"adapter_type":    adapterType,
		"base_url":        redactAuditURL(baseURL),
		"endpoint_url":    redactAuditURL(endpointURL),
		"capability":      capability,
		"model":           model,
		"param_keys":      paramKeys,
		"dry_run":         dryRun,
		"success":         result.Success,
		"endpoint":        redactAuditURL(result.Endpoint),
		"method":          result.Method,
		"response_status": result.ResponseStatus,
		"latency_ms":      result.LatencyMs,
		"error":           result.Error,
	}
}

func systemHealthThresholdsAuditMetadata(thresholds adminsettings.SystemHealthThresholds) map[string]any {
	return map[string]any{
		"error_rate_warn":        thresholds.ErrorRateWarn,
		"error_rate_critical":    thresholds.ErrorRateCritical,
		"failed_jobs_warn":       thresholds.FailedJobsWarn,
		"failed_jobs_critical":   thresholds.FailedJobsCritical,
		"slow_requests_warn":     thresholds.SlowRequestsWarn,
		"slow_requests_critical": thresholds.SlowRequestsCritical,
	}
}

func redactAuditURL(raw string) string {
	parsed, err := neturl.Parse(raw)
	if err != nil {
		return raw
	}
	parsed.RawQuery = ""
	parsed.ForceQuery = false
	parsed.Fragment = ""
	return parsed.String()
}

type systemHealthMetricSummary struct {
	Requests      uint64  `json:"requests"`
	Errors        uint64  `json:"errors"`
	ErrorRate     float64 `json:"error_rate"`
	FailedJobs    int64   `json:"failed_jobs"`
	SlowRequests  int64   `json:"slow_requests"`
	UptimeSeconds float64 `json:"uptime_seconds"`
}

type systemHealthIssue struct {
	Key       string  `json:"key"`
	Severity  string  `json:"severity"`
	Value     float64 `json:"value"`
	Threshold float64 `json:"threshold"`
}

type systemHealthSnapshot struct {
	Status     string                               `json:"status"`
	Metrics    systemHealthMetricSummary            `json:"metrics"`
	Thresholds adminsettings.SystemHealthThresholds `json:"thresholds"`
	Issues     []systemHealthIssue                  `json:"issues"`
}

func buildSystemHealth(metrics observability.HTTPMetricsSnapshot, stats debugapp.JobStats, thresholds adminsettings.SystemHealthThresholds) systemHealthSnapshot {
	errorRate := 0.0
	if metrics.Requests > 0 {
		errorRate = (float64(metrics.Errors) / float64(metrics.Requests)) * 100
	}
	failedJobs := int64(0)
	for _, item := range stats.ByStatus {
		if item.Status == "failed" {
			failedJobs = item.Count
			break
		}
	}
	uptimeSeconds := 0.0
	if raw, ok := metrics.Summary["uptime_seconds"]; ok {
		switch value := raw.(type) {
		case float64:
			uptimeSeconds = value
		case int:
			uptimeSeconds = float64(value)
		case int64:
			uptimeSeconds = float64(value)
		}
	}
	health := systemHealthSnapshot{
		Status:     "ok",
		Thresholds: thresholds,
		Metrics: systemHealthMetricSummary{
			Requests:      metrics.Requests,
			Errors:        metrics.Errors,
			ErrorRate:     errorRate,
			FailedJobs:    failedJobs,
			SlowRequests:  int64(len(metrics.SlowRequests)),
			UptimeSeconds: uptimeSeconds,
		},
		Issues: []systemHealthIssue{},
	}
	health.addIssue("error_rate", errorRate, thresholds.ErrorRateWarn, thresholds.ErrorRateCritical)
	health.addIssue("failed_jobs", float64(failedJobs), float64(thresholds.FailedJobsWarn), float64(thresholds.FailedJobsCritical))
	health.addIssue("slow_requests", float64(len(metrics.SlowRequests)), float64(thresholds.SlowRequestsWarn), float64(thresholds.SlowRequestsCritical))
	return health
}

func (h *systemHealthSnapshot) addIssue(key string, value float64, warnThreshold float64, criticalThreshold float64) {
	if value >= criticalThreshold && criticalThreshold >= 0 {
		h.Issues = append(h.Issues, systemHealthIssue{Key: key, Severity: "critical", Value: value, Threshold: criticalThreshold})
		h.Status = "critical"
		return
	}
	if value >= warnThreshold && warnThreshold >= 0 {
		h.Issues = append(h.Issues, systemHealthIssue{Key: key, Severity: "warning", Value: value, Threshold: warnThreshold})
		if h.Status == "ok" {
			h.Status = "warning"
		}
	}
}
