package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
)

func TestAgentTelemetryHandlerRecordsBatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	metrics := observability.NewAgentClientMetrics()
	h := NewAgentTelemetryHandler(metrics)
	r := gin.New()
	r.POST("/agent/telemetry", h.Record)

	req := httptest.NewRequest(http.MethodPost, "/agent/telemetry", strings.NewReader(`{
		"schema":"movscript.agent.client-telemetry.v1",
		"operations":[{
			"kind":"send",
			"status":"success",
			"durationMs":120,
			"slow":true,
			"phases":[{"name":"request_start","durationFromPreviousMs":80}]
		}],
		"longTasks":[{"durationMs":250}],
		"storageSnapshots":[{"totalBytes":2048}]
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d; body = %s", res.Code, http.StatusAccepted, res.Body.String())
	}
	text := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_agent_client_operations_total{kind="send",status="success"} 1`,
		`movscript_agent_client_operation_phase_delta_milliseconds_sum{kind="send",phase="request_start"} 80.000`,
		`movscript_agent_client_long_task_duration_milliseconds_sum 250.000`,
		`movscript_agent_client_storage_bytes{kind="latest"} 2048`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Prometheus text missing %q in:\n%s", want, text)
		}
	}
}

func TestAgentTelemetryHandlerRejectsUnsupportedSchema(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewAgentTelemetryHandler(observability.NewAgentClientMetrics())
	r := gin.New()
	r.POST("/agent/telemetry", h.Record)

	req := httptest.NewRequest(http.MethodPost, "/agent/telemetry", strings.NewReader(`{"schema":"unsupported"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadRequest)
	}
}
