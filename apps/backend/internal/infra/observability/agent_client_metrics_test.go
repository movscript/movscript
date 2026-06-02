package observability

import (
	"strings"
	"testing"
	"time"
)

func TestAgentClientMetricsSnapshotAndPrometheusText(t *testing.T) {
	metrics := NewAgentClientMetrics()
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
	metrics.RecordStorage(AgentClientStorageSample{TotalBytes: 2048})

	snapshot := metrics.Snapshot()
	if snapshot.Summary.Operations != 2 || snapshot.Summary.Errors != 1 || snapshot.Summary.Slow != 1 || snapshot.Summary.LongTasks != 1 {
		t.Fatalf("summary = %+v, want 2 operations, 1 error, 1 slow, 1 long task", snapshot.Summary)
	}
	if snapshot.Storage.LatestBytes != 2048 || snapshot.Storage.MaxBytes != 2048 {
		t.Fatalf("storage = %+v, want latest/max 2048", snapshot.Storage)
	}

	text := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_agent_client_operations_total{kind="send",status="success"} 1`,
		`movscript_agent_client_operation_duration_milliseconds_sum{kind="send",status="success"} 120.000`,
		`movscript_agent_client_slow_operations_total{kind="send",status="success"} 1`,
		`movscript_agent_client_operation_phase_delta_milliseconds_sum{kind="send",phase="request_start"} 80.000`,
		`movscript_agent_client_long_task_duration_milliseconds_sum 250.000`,
		`movscript_agent_client_storage_bytes{kind="latest"} 2048`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Prometheus text missing %q in:\n%s", want, text)
		}
	}
}
