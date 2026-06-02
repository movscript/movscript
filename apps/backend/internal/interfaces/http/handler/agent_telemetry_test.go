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
		"metrics":[{
			"name":"frontend_agent_network_request_duration_ms",
			"unit":"ms",
			"value":35,
			"labels":{"method":"POST","route_group":"/threads/:id/runs","status_class":"2xx"}
		},{
			"name":"frontend_ui_errors_total",
			"unit":"count",
			"value":1,
			"labels":{"area":"agent_frontend","kind":"window_error","level":"error"}
		},{
			"name":"frontend_storage_operation_duration_ms",
			"unit":"ms",
			"value":7,
			"labels":{"component":"agent_panel","kind":"agent_store","stage":"set","status":"success","request_id":"must_drop"}
		},{
			"name":"movscript_agent_storage_flush_duration_ms",
			"unit":"ms",
			"value":11,
			"labels":{"component":"state_store","kind":"state_file","stage":"flush","status":"success"}
		},{
			"name":"movscript_agent_storage_file_bytes",
			"unit":"bytes",
			"value":4096,
			"labels":{"component":"state_store","kind":"state_file","stage":"flush","status":"success"}
		}],
		"logs":[{"level":"error","area":"agent_frontend","kind":"window_error"}]
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d; body = %s", res.Code, http.StatusAccepted, res.Body.String())
	}
	text := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_agent_client_telemetry_batches_total{status="accepted"} 1`,
		`movscript_agent_client_telemetry_samples_total{status="accepted"} 8`,
		`movscript_agent_client_operations_total{kind="send",status="success"} 1`,
		`movscript_agent_client_operation_phase_delta_milliseconds_sum{kind="send",phase="request_start"} 80.000`,
		`movscript_agent_client_metric_milliseconds_sum{metric="frontend_agent_network_request_duration_ms",method="post",route_group="/threads/:id/runs",status_class="2xx"} 35.000`,
		`movscript_agent_client_metric_count_total{metric="frontend_ui_errors_total",area="agent_frontend",kind="window_error",level="error"} 1.000`,
		`movscript_agent_client_metric_milliseconds_sum{metric="frontend_storage_operation_duration_ms",component="agent_panel",kind="agent_store",stage="set",status="success"} 7.000`,
		`movscript_agent_client_metric_milliseconds_sum{metric="movscript_agent_storage_flush_duration_ms",component="state_store",kind="state_file",stage="flush",status="success"} 11.000`,
		`movscript_agent_client_metric_bytes_sum{metric="movscript_agent_storage_file_bytes",component="state_store",kind="state_file",stage="flush",status="success"} 4096.000`,
		`movscript_agent_client_logs_total{level="error",area="agent_frontend",kind="window_error"} 1`,
		`movscript_agent_client_long_task_duration_milliseconds_sum 250.000`,
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
	text := h.metrics.PrometheusText()
	if !strings.Contains(text, `movscript_agent_client_telemetry_batches_total{status="unsupported_schema"} 1`) {
		t.Fatalf("Prometheus text missing unsupported schema ingest in:\n%s", text)
	}
}
