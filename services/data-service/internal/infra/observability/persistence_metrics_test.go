package observability

import (
	"strings"
	"testing"
	"time"
)

func TestDBMetricsPrometheusText(t *testing.T) {
	metrics := NewDBMetrics()
	metrics.RecordQuery(DBQuerySample{Operation: "SELECT", Status: "success", Duration: 12 * time.Millisecond})

	got := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_db_queries_total{operation="select",status="success"} 1`,
		`movscript_db_query_duration_milliseconds_sum{operation="select",status="success"} 12.000`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("PrometheusText() missing %q in:\n%s", want, got)
		}
	}
}

func TestObjectStorageMetricsPrometheusText(t *testing.T) {
	metrics := NewObjectStorageMetrics()
	metrics.RecordOperation(ObjectStorageOperationSample{
		Backend:   "filesystem",
		Operation: "put",
		Status:    "success",
		Duration:  5 * time.Millisecond,
		Bytes:     123,
	})

	got := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_object_storage_operations_total{backend="filesystem",operation="put",status="success"} 1`,
		`movscript_object_storage_operation_duration_milliseconds_sum{backend="filesystem",operation="put",status="success"} 5.000`,
		`movscript_object_storage_payload_bytes_sum{backend="filesystem",operation="put",status="success"} 123.000`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("PrometheusText() missing %q in:\n%s", want, got)
		}
	}
}

func TestSQLOperationNormalizesFirstToken(t *testing.T) {
	if got := sqlOperation(" \nUPDATE users SET name = 'a'"); got != "UPDATE" {
		t.Fatalf("sqlOperation() = %q, want UPDATE", got)
	}
}
