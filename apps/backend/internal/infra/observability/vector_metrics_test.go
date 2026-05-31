package observability

import (
	"strings"
	"testing"
	"time"
)

func TestVectorMetricsSnapshotAndPrometheusText(t *testing.T) {
	metrics := NewVectorMetrics()
	metrics.Record(VectorOperationSample{
		Operation: "search",
		Status:    "success",
		Duration:  25 * time.Millisecond,
		Documents: 3,
	})
	metrics.Record(VectorOperationSample{
		Operation: "search",
		Status:    "error",
		Duration:  50 * time.Millisecond,
	})

	snapshot := metrics.Snapshot()
	if snapshot.Summary.Operations != 2 || snapshot.Summary.Errors != 1 || snapshot.Summary.Documents != 3 {
		t.Fatalf("summary = %+v, want 2 operations, 1 error, 3 documents", snapshot.Summary)
	}
	if len(snapshot.Operations) != 2 {
		t.Fatalf("operations length = %d, want 2", len(snapshot.Operations))
	}
	if snapshot.Operations[1].Operation != "search" || snapshot.Operations[1].Status != "success" {
		t.Fatalf("operation ordering = %+v, want search success second", snapshot.Operations)
	}
	if snapshot.Operations[1].DurationMS.Avg != 25 || snapshot.Operations[1].DurationMS.Max != 25 || snapshot.Operations[1].DurationMS.Sum != 25 {
		t.Fatalf("duration summary = %+v, want 25ms avg/max/sum", snapshot.Operations[1].DurationMS)
	}

	text := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_shot_vector_operations_total{operation="search",status="success"} 1`,
		`movscript_shot_vector_operation_duration_milliseconds_sum{operation="search",status="error"} 50.000`,
		`movscript_shot_vector_documents_processed_total{operation="search",status="success"} 3`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Prometheus text missing %q in:\n%s", want, text)
		}
	}
}
