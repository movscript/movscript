package observability

import (
	"bytes"
	"fmt"
	"sort"
	"sync"
	"time"
)

var defaultVectorMetrics = NewVectorMetrics()

type VectorOperationSample struct {
	Operation string
	Status    string
	Duration  time.Duration
	Documents int
}

type VectorMetricsSnapshot struct {
	GeneratedAt string                    `json:"generated_at"`
	Operations  []VectorOperationSnapshot `json:"operations"`
	Summary     VectorMetricsSummary      `json:"summary"`
}

type VectorMetricsSummary struct {
	Operations uint64 `json:"operations"`
	Errors     uint64 `json:"errors"`
	Documents  uint64 `json:"documents"`
}

type VectorOperationSnapshot struct {
	Operation  string          `json:"operation"`
	Status     string          `json:"status"`
	Count      uint64          `json:"count"`
	Documents  uint64          `json:"documents"`
	DurationMS DurationSummary `json:"duration_ms"`
}

type DurationSummary struct {
	Avg float64 `json:"avg"`
	Max float64 `json:"max"`
	Sum float64 `json:"sum"`
}

type VectorMetrics struct {
	mu         sync.RWMutex
	operations map[vectorMetricKey]*vectorOperationStats
}

type vectorMetricKey struct {
	operation string
	status    string
}

type vectorOperationStats struct {
	count       uint64
	durationSum time.Duration
	durationMax time.Duration
	documents   uint64
}

func NewVectorMetrics() *VectorMetrics {
	return &VectorMetrics{operations: map[vectorMetricKey]*vectorOperationStats{}}
}

func DefaultVectorMetrics() *VectorMetrics {
	return defaultVectorMetrics
}

func (m *VectorMetrics) Record(sample VectorOperationSample) {
	if m == nil {
		return
	}
	if sample.Operation == "" {
		sample.Operation = "unknown"
	}
	if sample.Status == "" {
		sample.Status = "success"
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	key := vectorMetricKey{operation: sample.Operation, status: sample.Status}
	stats := m.operations[key]
	if stats == nil {
		stats = &vectorOperationStats{}
		m.operations[key] = stats
	}
	stats.count++
	stats.durationSum += sample.Duration
	if sample.Duration > stats.durationMax {
		stats.durationMax = sample.Duration
	}
	if sample.Documents > 0 {
		stats.documents += uint64(sample.Documents)
	}
}

func (m *VectorMetrics) Snapshot() VectorMetricsSnapshot {
	if m == nil {
		return VectorMetricsSnapshot{}
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	keys := make([]vectorMetricKey, 0, len(m.operations))
	for key := range m.operations {
		keys = append(keys, key)
	}
	sortVectorMetricKeys(keys)

	operations := make([]VectorOperationSnapshot, 0, len(keys))
	summary := VectorMetricsSummary{}
	for _, key := range keys {
		stats := m.operations[key]
		avg := 0.0
		if stats.count > 0 {
			avg = durationMS(stats.durationSum) / float64(stats.count)
		}
		if key.status == "error" {
			summary.Errors += stats.count
		}
		summary.Operations += stats.count
		summary.Documents += stats.documents
		operations = append(operations, VectorOperationSnapshot{
			Operation: key.operation,
			Status:    key.status,
			Count:     stats.count,
			Documents: stats.documents,
			DurationMS: DurationSummary{
				Avg: avg,
				Max: durationMS(stats.durationMax),
				Sum: durationMS(stats.durationSum),
			},
		})
	}
	return VectorMetricsSnapshot{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Operations:  operations,
		Summary:     summary,
	}
}

func (m *VectorMetrics) PrometheusText() string {
	if m == nil {
		return ""
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	keys := make([]vectorMetricKey, 0, len(m.operations))
	for key := range m.operations {
		keys = append(keys, key)
	}
	sortVectorMetricKeys(keys)

	var b bytes.Buffer
	b.WriteString("# HELP movscript_shot_vector_operations_total Total shot vector store operations.\n")
	b.WriteString("# TYPE movscript_shot_vector_operations_total counter\n")
	for _, key := range keys {
		stats := m.operations[key]
		fmt.Fprintf(&b, "movscript_shot_vector_operations_total{operation=%q,status=%q} %d\n", escapePromLabel(key.operation), escapePromLabel(key.status), stats.count)
	}
	b.WriteString("# HELP movscript_shot_vector_operation_duration_milliseconds Shot vector store operation latency in milliseconds.\n")
	b.WriteString("# TYPE movscript_shot_vector_operation_duration_milliseconds summary\n")
	for _, key := range keys {
		stats := m.operations[key]
		fmt.Fprintf(&b, "movscript_shot_vector_operation_duration_milliseconds_count{operation=%q,status=%q} %d\n", escapePromLabel(key.operation), escapePromLabel(key.status), stats.count)
		fmt.Fprintf(&b, "movscript_shot_vector_operation_duration_milliseconds_sum{operation=%q,status=%q} %.3f\n", escapePromLabel(key.operation), escapePromLabel(key.status), durationMS(stats.durationSum))
		fmt.Fprintf(&b, "movscript_shot_vector_operation_duration_milliseconds_max{operation=%q,status=%q} %.3f\n", escapePromLabel(key.operation), escapePromLabel(key.status), durationMS(stats.durationMax))
	}
	b.WriteString("# HELP movscript_shot_vector_documents_processed_total Total vector documents processed by operation.\n")
	b.WriteString("# TYPE movscript_shot_vector_documents_processed_total counter\n")
	for _, key := range keys {
		stats := m.operations[key]
		fmt.Fprintf(&b, "movscript_shot_vector_documents_processed_total{operation=%q,status=%q} %d\n", escapePromLabel(key.operation), escapePromLabel(key.status), stats.documents)
	}
	return b.String()
}

func sortVectorMetricKeys(keys []vectorMetricKey) {
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].operation == keys[j].operation {
			return keys[i].status < keys[j].status
		}
		return keys[i].operation < keys[j].operation
	})
}
