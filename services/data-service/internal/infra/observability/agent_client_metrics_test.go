package observability

import (
	"strings"
	"testing"
	"time"
)

func TestAgentClientMetricsSnapshotAndPrometheusText(t *testing.T) {
	metrics := NewAgentClientMetrics()
	metrics.RecordIngest("accepted", 3)
	metrics.RecordIngest("unsupported_schema", 0)
	metrics.RecordOperation(AgentClientOperationSample{
		Kind:     "send",
		Status:   "success",
		Duration: 120 * time.Millisecond,
		Slow:     true,
		PhaseDeltas: map[string]time.Duration{
			"request_start": 80 * time.Millisecond,
		},
	})
	metrics.RecordOperation(AgentClientOperationSample{
		Kind:     "approval",
		Status:   "error",
		Duration: 50 * time.Millisecond,
	})
	metrics.RecordLongTask(AgentClientLongTaskSample{Duration: 250 * time.Millisecond})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "frontend_agent_network_request_duration_ms",
		Unit:  "ms",
		Value: 35,
		Labels: map[string]string{
			"method":       "POST",
			"route_group":  "/threads/:id/runs",
			"status_class": "2xx",
			"ignored_id":   "run_secret",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "frontend_ui_errors_total",
		Unit:  "count",
		Value: 1,
		Labels: map[string]string{
			"area":  "agent_frontend",
			"kind":  "window_error",
			"level": "error",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "frontend_web_vital_cls_score",
		Unit:  "score",
		Value: 0.12,
		Labels: map[string]string{
			"vital": "cls",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "frontend_storage_operation_duration_ms",
		Unit:  "ms",
		Value: 7,
		Labels: map[string]string{
			"component":  "agent_panel",
			"kind":       "agent_store",
			"stage":      "set",
			"status":     "success",
			"request_id": "must_drop",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "frontend_storage_payload_bytes",
		Unit:  "bytes",
		Value: 2048,
		Labels: map[string]string{
			"component": "agent_panel",
			"kind":      "agent_store",
			"stage":     "set",
			"status":    "success",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "movscript_agent_storage_flush_duration_ms",
		Unit:  "ms",
		Value: 11,
		Labels: map[string]string{
			"component": "runtime_store",
			"kind":      "runtime_log",
			"stage":     "flush",
			"status":    "success",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "movscript_agent_trace_store_operation_duration_ms",
		Unit:  "ms",
		Value: 5,
		Labels: map[string]string{
			"component": "trace_store",
			"kind":      "trace_file",
			"stage":     "append",
			"status":    "success",
		},
	})
	metrics.RecordMetric(AgentClientMetricSample{
		Name:  "movscript_agent_storage_file_bytes",
		Unit:  "bytes",
		Value: 4096,
		Labels: map[string]string{
			"component": "runtime_store",
			"kind":      "runtime_log",
			"stage":     "flush",
			"status":    "success",
		},
	})
	metrics.RecordLog(AgentClientLogSample{Level: "error", Area: "agent_frontend", Kind: "window_error"})

	snapshot := metrics.Snapshot()
	if snapshot.Summary.Operations != 2 || snapshot.Summary.Errors != 1 || snapshot.Summary.Slow != 1 || snapshot.Summary.LongTasks != 1 {
		t.Fatalf("summary = %+v, want 2 operations, 1 error, 1 slow, 1 long task", snapshot.Summary)
	}
	if snapshot.Summary.Batches != 2 || snapshot.Summary.Samples != 3 || snapshot.Summary.Rejected != 1 {
		t.Fatalf("summary ingest = %+v, want 2 batches, 3 samples, 1 rejected", snapshot.Summary)
	}
	text := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_agent_client_telemetry_batches_total{status="accepted"} 1`,
		`movscript_agent_client_telemetry_samples_total{status="accepted"} 3`,
		`movscript_agent_client_telemetry_batches_total{status="unsupported_schema"} 1`,
		`movscript_agent_client_operations_total{kind="send",status="success"} 1`,
		`movscript_agent_client_operation_duration_milliseconds_sum{kind="send",status="success"} 120.000`,
		`movscript_agent_client_slow_operations_total{kind="send",status="success"} 1`,
		`movscript_agent_client_operation_phase_delta_milliseconds_sum{kind="send",phase="request_start"} 80.000`,
		`movscript_agent_client_metric_milliseconds_sum{metric="frontend_agent_network_request_duration_ms",method="post",route_group="/threads/:id/runs",status_class="2xx"} 35.000`,
		`movscript_agent_client_metric_count_total{metric="frontend_ui_errors_total",area="agent_frontend",kind="window_error",level="error"} 1.000`,
		`movscript_agent_client_metric_score_max{metric="frontend_web_vital_cls_score",vital="cls"} 0.120`,
		`movscript_agent_client_metric_milliseconds_sum{metric="frontend_storage_operation_duration_ms",component="agent_panel",kind="agent_store",stage="set",status="success"} 7.000`,
		`movscript_agent_client_metric_bytes_sum{metric="frontend_storage_payload_bytes",component="agent_panel",kind="agent_store",stage="set",status="success"} 2048.000`,
		`movscript_agent_client_metric_milliseconds_sum{metric="movscript_agent_storage_flush_duration_ms",component="runtime_store",kind="runtime_log",stage="flush",status="success"} 11.000`,
		`movscript_agent_client_metric_milliseconds_sum{metric="movscript_agent_trace_store_operation_duration_ms",component="trace_store",kind="trace_file",stage="append",status="success"} 5.000`,
		`movscript_agent_client_metric_bytes_sum{metric="movscript_agent_storage_file_bytes",component="runtime_store",kind="runtime_log",stage="flush",status="success"} 4096.000`,
		`movscript_agent_client_logs_total{level="error",area="agent_frontend",kind="window_error"} 1`,
		`movscript_agent_client_long_task_duration_milliseconds_sum 250.000`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Prometheus text missing %q in:\n%s", want, text)
		}
	}
}
