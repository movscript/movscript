package observability

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

var defaultAgentClientMetrics = NewAgentClientMetrics()

type AgentClientOperationSample struct {
	Kind        string
	Status      string
	Duration    time.Duration
	Slow        bool
	PhaseDeltas map[string]time.Duration
}

type AgentClientLongTaskSample struct {
	Duration time.Duration
}

type AgentClientStorageSample struct {
	TotalBytes int64
}

type AgentClientMetricsSnapshot struct {
	GeneratedAt string                         `json:"generated_at"`
	Operations  []AgentClientOperationSnapshot `json:"operations"`
	Phases      []AgentClientPhaseSnapshot     `json:"phases"`
	LongTasks   AgentClientDurationSnapshot    `json:"long_tasks"`
	Storage     AgentClientStorageSnapshot     `json:"storage"`
	Summary     AgentClientMetricsSummary      `json:"summary"`
}

type AgentClientMetricsSummary struct {
	Operations uint64 `json:"operations"`
	Errors     uint64 `json:"errors"`
	Slow       uint64 `json:"slow"`
	LongTasks  uint64 `json:"long_tasks"`
}

type AgentClientOperationSnapshot struct {
	Kind       string          `json:"kind"`
	Status     string          `json:"status"`
	Count      uint64          `json:"count"`
	Slow       uint64          `json:"slow"`
	DurationMS DurationSummary `json:"duration_ms"`
}

type AgentClientPhaseSnapshot struct {
	Kind       string          `json:"kind"`
	Phase      string          `json:"phase"`
	Count      uint64          `json:"count"`
	DurationMS DurationSummary `json:"duration_ms"`
}

type AgentClientDurationSnapshot struct {
	Count      uint64          `json:"count"`
	DurationMS DurationSummary `json:"duration_ms"`
}

type AgentClientStorageSnapshot struct {
	Count       uint64 `json:"count"`
	LatestBytes int64  `json:"latest_bytes"`
	MaxBytes    int64  `json:"max_bytes"`
}

type AgentClientMetrics struct {
	mu         sync.RWMutex
	operations map[agentClientOperationKey]*agentClientOperationStats
	phases     map[agentClientPhaseKey]*agentClientDurationStats
	longTasks  agentClientDurationStats
	storage    agentClientStorageStats
}

type agentClientOperationKey struct {
	kind   string
	status string
}

type agentClientPhaseKey struct {
	kind  string
	phase string
}

type agentClientOperationStats struct {
	agentClientDurationStats
	slow uint64
}

type agentClientDurationStats struct {
	count       uint64
	durationSum time.Duration
	durationMax time.Duration
}

type agentClientStorageStats struct {
	count       uint64
	latestBytes int64
	maxBytes    int64
}

func NewAgentClientMetrics() *AgentClientMetrics {
	return &AgentClientMetrics{
		operations: map[agentClientOperationKey]*agentClientOperationStats{},
		phases:     map[agentClientPhaseKey]*agentClientDurationStats{},
	}
}

func DefaultAgentClientMetrics() *AgentClientMetrics {
	return defaultAgentClientMetrics
}

func (m *AgentClientMetrics) RecordOperation(sample AgentClientOperationSample) {
	if m == nil {
		return
	}
	kind := normalizeAgentMetricLabel(sample.Kind, "unknown")
	status := normalizeAgentMetricLabel(sample.Status, "success")
	if sample.Duration < 0 {
		sample.Duration = 0
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	key := agentClientOperationKey{kind: kind, status: status}
	stats := m.operations[key]
	if stats == nil {
		stats = &agentClientOperationStats{}
		m.operations[key] = stats
	}
	recordAgentDuration(&stats.agentClientDurationStats, sample.Duration)
	if sample.Slow {
		stats.slow++
	}
	for phase, duration := range sample.PhaseDeltas {
		phase = normalizeAgentMetricLabel(phase, "unknown")
		if duration < 0 {
			duration = 0
		}
		phaseKey := agentClientPhaseKey{kind: kind, phase: phase}
		phaseStats := m.phases[phaseKey]
		if phaseStats == nil {
			phaseStats = &agentClientDurationStats{}
			m.phases[phaseKey] = phaseStats
		}
		recordAgentDuration(phaseStats, duration)
	}
}

func (m *AgentClientMetrics) RecordLongTask(sample AgentClientLongTaskSample) {
	if m == nil {
		return
	}
	if sample.Duration < 0 {
		sample.Duration = 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	recordAgentDuration(&m.longTasks, sample.Duration)
}

func (m *AgentClientMetrics) RecordStorage(sample AgentClientStorageSample) {
	if m == nil {
		return
	}
	if sample.TotalBytes < 0 {
		sample.TotalBytes = 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.storage.count++
	m.storage.latestBytes = sample.TotalBytes
	if sample.TotalBytes > m.storage.maxBytes {
		m.storage.maxBytes = sample.TotalBytes
	}
}

func (m *AgentClientMetrics) Snapshot() AgentClientMetricsSnapshot {
	if m == nil {
		return AgentClientMetricsSnapshot{}
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	operationKeys := make([]agentClientOperationKey, 0, len(m.operations))
	for key := range m.operations {
		operationKeys = append(operationKeys, key)
	}
	sort.Slice(operationKeys, func(i, j int) bool {
		if operationKeys[i].kind == operationKeys[j].kind {
			return operationKeys[i].status < operationKeys[j].status
		}
		return operationKeys[i].kind < operationKeys[j].kind
	})

	operations := make([]AgentClientOperationSnapshot, 0, len(operationKeys))
	summary := AgentClientMetricsSummary{}
	for _, key := range operationKeys {
		stats := m.operations[key]
		summary.Operations += stats.count
		summary.Slow += stats.slow
		if key.status == "error" || key.status == "cancelled" {
			summary.Errors += stats.count
		}
		operations = append(operations, AgentClientOperationSnapshot{
			Kind:       key.kind,
			Status:     key.status,
			Count:      stats.count,
			Slow:       stats.slow,
			DurationMS: durationSummary(stats.agentClientDurationStats),
		})
	}

	phaseKeys := make([]agentClientPhaseKey, 0, len(m.phases))
	for key := range m.phases {
		phaseKeys = append(phaseKeys, key)
	}
	sort.Slice(phaseKeys, func(i, j int) bool {
		if phaseKeys[i].kind == phaseKeys[j].kind {
			return phaseKeys[i].phase < phaseKeys[j].phase
		}
		return phaseKeys[i].kind < phaseKeys[j].kind
	})
	phases := make([]AgentClientPhaseSnapshot, 0, len(phaseKeys))
	for _, key := range phaseKeys {
		stats := m.phases[key]
		phases = append(phases, AgentClientPhaseSnapshot{
			Kind:       key.kind,
			Phase:      key.phase,
			Count:      stats.count,
			DurationMS: durationSummary(*stats),
		})
	}
	summary.LongTasks = m.longTasks.count

	return AgentClientMetricsSnapshot{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Operations:  operations,
		Phases:      phases,
		LongTasks: AgentClientDurationSnapshot{
			Count:      m.longTasks.count,
			DurationMS: durationSummary(m.longTasks),
		},
		Storage: AgentClientStorageSnapshot{
			Count:       m.storage.count,
			LatestBytes: m.storage.latestBytes,
			MaxBytes:    m.storage.maxBytes,
		},
		Summary: summary,
	}
}

func (m *AgentClientMetrics) PrometheusText() string {
	if m == nil {
		return ""
	}
	snapshot := m.Snapshot()
	var b bytes.Buffer
	b.WriteString("# HELP movscript_agent_client_operations_total Total frontend agent operations reported by clients.\n")
	b.WriteString("# TYPE movscript_agent_client_operations_total counter\n")
	for _, item := range snapshot.Operations {
		fmt.Fprintf(&b, "movscript_agent_client_operations_total{kind=%q,status=%q} %d\n", escapePromLabel(item.Kind), escapePromLabel(item.Status), item.Count)
	}
	b.WriteString("# HELP movscript_agent_client_operation_duration_milliseconds Frontend agent operation duration in milliseconds.\n")
	b.WriteString("# TYPE movscript_agent_client_operation_duration_milliseconds summary\n")
	for _, item := range snapshot.Operations {
		fmt.Fprintf(&b, "movscript_agent_client_operation_duration_milliseconds_count{kind=%q,status=%q} %d\n", escapePromLabel(item.Kind), escapePromLabel(item.Status), item.Count)
		fmt.Fprintf(&b, "movscript_agent_client_operation_duration_milliseconds_sum{kind=%q,status=%q} %.3f\n", escapePromLabel(item.Kind), escapePromLabel(item.Status), item.DurationMS.Sum)
		fmt.Fprintf(&b, "movscript_agent_client_operation_duration_milliseconds_max{kind=%q,status=%q} %.3f\n", escapePromLabel(item.Kind), escapePromLabel(item.Status), item.DurationMS.Max)
	}
	b.WriteString("# HELP movscript_agent_client_slow_operations_total Total frontend agent operations marked slow by clients.\n")
	b.WriteString("# TYPE movscript_agent_client_slow_operations_total counter\n")
	for _, item := range snapshot.Operations {
		fmt.Fprintf(&b, "movscript_agent_client_slow_operations_total{kind=%q,status=%q} %d\n", escapePromLabel(item.Kind), escapePromLabel(item.Status), item.Slow)
	}
	b.WriteString("# HELP movscript_agent_client_operation_phase_delta_milliseconds Frontend agent operation phase duration in milliseconds.\n")
	b.WriteString("# TYPE movscript_agent_client_operation_phase_delta_milliseconds summary\n")
	for _, item := range snapshot.Phases {
		fmt.Fprintf(&b, "movscript_agent_client_operation_phase_delta_milliseconds_count{kind=%q,phase=%q} %d\n", escapePromLabel(item.Kind), escapePromLabel(item.Phase), item.Count)
		fmt.Fprintf(&b, "movscript_agent_client_operation_phase_delta_milliseconds_sum{kind=%q,phase=%q} %.3f\n", escapePromLabel(item.Kind), escapePromLabel(item.Phase), item.DurationMS.Sum)
		fmt.Fprintf(&b, "movscript_agent_client_operation_phase_delta_milliseconds_max{kind=%q,phase=%q} %.3f\n", escapePromLabel(item.Kind), escapePromLabel(item.Phase), item.DurationMS.Max)
	}
	b.WriteString("# HELP movscript_agent_client_long_task_duration_milliseconds Browser Long Task duration reported by clients.\n")
	b.WriteString("# TYPE movscript_agent_client_long_task_duration_milliseconds summary\n")
	fmt.Fprintf(&b, "movscript_agent_client_long_task_duration_milliseconds_count %d\n", snapshot.LongTasks.Count)
	fmt.Fprintf(&b, "movscript_agent_client_long_task_duration_milliseconds_sum %.3f\n", snapshot.LongTasks.DurationMS.Sum)
	fmt.Fprintf(&b, "movscript_agent_client_long_task_duration_milliseconds_max %.3f\n", snapshot.LongTasks.DurationMS.Max)
	b.WriteString("# HELP movscript_agent_client_storage_bytes Frontend agent local state storage bytes reported by clients.\n")
	b.WriteString("# TYPE movscript_agent_client_storage_bytes gauge\n")
	fmt.Fprintf(&b, "movscript_agent_client_storage_bytes{kind=\"latest\"} %d\n", snapshot.Storage.LatestBytes)
	fmt.Fprintf(&b, "movscript_agent_client_storage_bytes{kind=\"max\"} %d\n", snapshot.Storage.MaxBytes)
	return b.String()
}

func recordAgentDuration(stats *agentClientDurationStats, duration time.Duration) {
	stats.count++
	stats.durationSum += duration
	if duration > stats.durationMax {
		stats.durationMax = duration
	}
}

func durationSummary(stats agentClientDurationStats) DurationSummary {
	avg := 0.0
	if stats.count > 0 {
		avg = durationMS(stats.durationSum) / float64(stats.count)
	}
	return DurationSummary{
		Avg: avg,
		Max: durationMS(stats.durationMax),
		Sum: durationMS(stats.durationSum),
	}
}

func normalizeAgentMetricLabel(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = fallback
	}
	value = strings.ToLower(value)
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
		if b.Len() >= 80 {
			break
		}
	}
	normalized := strings.Trim(b.String(), "_-")
	if normalized == "" {
		return fallback
	}
	return normalized
}
