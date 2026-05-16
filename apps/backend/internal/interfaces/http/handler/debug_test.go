package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/adminsettings"
	debugapp "github.com/movscript/movscript/internal/app/debug"
	"github.com/movscript/movscript/internal/infra/observability"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestDebugRawCallWritesAuditWithoutBodyOrHeaderValues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestDebugRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/admin/debug/raw-call", strings.NewReader(`{
		"url":"http://127.0.0.1:8765/health?api_key=query-secret",
		"method":"POST",
		"headers":{"Authorization":"Bearer secret-token","X-Debug":"visible"},
		"body":"{\"secret\":\"body-secret\"}"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected raw call response, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "debug.raw_call.admin_executed") != 1 {
		t.Fatalf("expected raw call audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "debug.raw_call.admin_executed", "secret-token")
	assertAuditMetadataDoesNotContain(t, db, "debug.raw_call.admin_executed", "body-secret")
	assertAuditMetadataDoesNotContain(t, db, "debug.raw_call.admin_executed", "query-secret")
}

func TestDebugProviderCallWritesAuditWithoutKeyOrPrompt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestDebugRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/admin/debug/provider-call", strings.NewReader(`{
		"adapter_type":"openai_compat",
		"base_url":"https://93.184.216.34/v1?api_key=base-query-secret",
		"api_key":"sk-provider-secret",
		"endpoint_url":"https://93.184.216.34/v1/chat/completions?token=endpoint-query-secret",
		"capability":"text",
		"model":"debug-model",
		"prompt":"prompt-secret",
		"params":{"temperature":0.2},
		"dry_run":true
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected provider call response, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "debug.provider_call.admin_executed") != 1 {
		t.Fatalf("expected provider call audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "debug.provider_call.admin_executed", "sk-provider-secret")
	assertAuditMetadataDoesNotContain(t, db, "debug.provider_call.admin_executed", "prompt-secret")
	assertAuditMetadataDoesNotContain(t, db, "debug.provider_call.admin_executed", "base-query-secret")
	assertAuditMetadataDoesNotContain(t, db, "debug.provider_call.admin_executed", "endpoint-query-secret")
}

func TestSystemHealthEscalatesByThresholds(t *testing.T) {
	health := buildSystemHealth(
		observability.HTTPMetricsSnapshot{
			Requests:     100,
			Errors:       7,
			SlowRequests: make([]observability.SlowHTTPRequest, 2),
			Summary:      map[string]interface{}{"uptime_seconds": 30.0},
		},
		debugapp.JobStats{
			Total:    12,
			ByStatus: []debugapp.JobStatusCount{{Status: "failed", Count: 3}},
		},
		adminsettings.SystemHealthThresholds{
			ErrorRateWarn:        5,
			ErrorRateCritical:    20,
			FailedJobsWarn:       1,
			FailedJobsCritical:   3,
			SlowRequestsWarn:     5,
			SlowRequestsCritical: 10,
		},
	)

	if health.Status != "critical" {
		t.Fatalf("expected critical health, got %q", health.Status)
	}
	if health.Metrics.ErrorRate < 6.99 || health.Metrics.ErrorRate > 7.01 {
		t.Fatalf("expected error rate 7, got %v", health.Metrics.ErrorRate)
	}
	if len(health.Issues) != 2 {
		t.Fatalf("expected error-rate warning and failed-job critical issues, got %#v", health.Issues)
	}
	if health.Issues[1].Key != "failed_jobs" || health.Issues[1].Severity != "critical" {
		t.Fatalf("expected failed jobs critical issue, got %#v", health.Issues[1])
	}
}

func TestDebugHealthSettingsPersistAndAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestDebugRouter(t)

	getDefault := httptest.NewRecorder()
	router.ServeHTTP(getDefault, httptest.NewRequest(http.MethodGet, "/admin/debug/health-settings", nil))
	if getDefault.Code != http.StatusOK {
		t.Fatalf("expected default health settings, got %d: %s", getDefault.Code, getDefault.Body.String())
	}
	var defaults adminsettings.SystemHealthThresholds
	if err := json.Unmarshal(getDefault.Body.Bytes(), &defaults); err != nil {
		t.Fatalf("decode defaults: %v", err)
	}
	if defaults != adminsettings.DefaultSystemHealthThresholds() {
		t.Fatalf("defaults = %#v, want %#v", defaults, adminsettings.DefaultSystemHealthThresholds())
	}

	req := httptest.NewRequest(http.MethodPut, "/admin/debug/health-settings", strings.NewReader(`{
		"error_rate_warn":4,
		"error_rate_critical":12,
		"failed_jobs_warn":2,
		"failed_jobs_critical":7,
		"slow_requests_warn":3,
		"slow_requests_critical":9
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected settings update, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "debug.health_settings.admin_updated") != 1 {
		t.Fatalf("expected health settings audit log")
	}

	getSaved := httptest.NewRecorder()
	router.ServeHTTP(getSaved, httptest.NewRequest(http.MethodGet, "/admin/debug/health-settings", nil))
	if getSaved.Code != http.StatusOK {
		t.Fatalf("expected saved health settings, got %d: %s", getSaved.Code, getSaved.Body.String())
	}
	var saved adminsettings.SystemHealthThresholds
	if err := json.Unmarshal(getSaved.Body.Bytes(), &saved); err != nil {
		t.Fatalf("decode saved: %v", err)
	}
	if saved.ErrorRateWarn != 4 || saved.FailedJobsCritical != 7 || saved.SlowRequestsCritical != 9 {
		t.Fatalf("unexpected saved settings: %#v", saved)
	}

	invalidReq := httptest.NewRequest(http.MethodPut, "/admin/debug/health-settings", strings.NewReader(`{
		"error_rate_warn":20,
		"error_rate_critical":10,
		"failed_jobs_warn":1,
		"failed_jobs_critical":2,
		"slow_requests_warn":1,
		"slow_requests_critical":2
	}`))
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRes, invalidReq)
	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid settings rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "debug.health_settings.admin_updated") != 1 {
		t.Fatalf("invalid settings should not add audit log")
	}
}

func newTestDebugRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-debug.db", &persistencemodel.AuditLog{}, &persistencemodel.AICredential{}, &persistencemodel.AdminSetting{})
	h := NewDebugHandler(db.Session(&gorm.Session{SkipHooks: true}), []byte("test-encryption-key-32-bytes----"))

	router := gin.New()
	router.POST("/admin/debug/raw-call", h.RawCall)
	router.POST("/admin/debug/provider-call", h.ProviderCall)
	router.GET("/admin/debug/health-settings", h.GetHealthSettings)
	router.PUT("/admin/debug/health-settings", h.UpdateHealthSettings)
	return router, db
}
