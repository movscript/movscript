package observability

import (
	"bytes"
	"fmt"
	"math"
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

type AgentClientMetricSample struct {
	Name   string
	Unit   string
	Value  float64
	Labels map[string]string
}

type AgentClientLogSample struct {
	Level string
	Area  string
	Kind  string
}

type AgentClientMetricsSnapshot struct {
	GeneratedAt string                         `json:"generated_at"`
	Ingest      []AgentClientIngestSnapshot    `json:"ingest"`
	Operations  []AgentClientOperationSnapshot `json:"operations"`
	Phases      []AgentClientPhaseSnapshot     `json:"phases"`
	Metrics     []AgentClientMetricSnapshot    `json:"metrics"`
	Logs        []AgentClientLogSnapshot       `json:"logs"`
	LongTasks   AgentClientDurationSnapshot    `json:"long_tasks"`
	Summary     AgentClientMetricsSummary      `json:"summary"`
}

type AgentClientMetricsSummary struct {
	Operations uint64 `json:"operations"`
	Errors     uint64 `json:"errors"`
	Slow       uint64 `json:"slow"`
	LongTasks  uint64 `json:"long_tasks"`
	Batches    uint64 `json:"batches"`
	Samples    uint64 `json:"samples"`
	Rejected   uint64 `json:"rejected"`
	Metrics    uint64 `json:"metrics"`
	Logs       uint64 `json:"logs"`
}

type AgentClientIngestSnapshot struct {
	Status  string `json:"status"`
	Batches uint64 `json:"batches"`
	Samples uint64 `json:"samples"`
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

type AgentClientMetricSnapshot struct {
	Name   string            `json:"name"`
	Unit   string            `json:"unit"`
	Labels map[string]string `json:"labels"`
	Count  uint64            `json:"count"`
	Value  NumericSummary    `json:"value"`
}

type NumericSummary struct {
	Avg float64 `json:"avg"`
	Max float64 `json:"max"`
	Sum float64 `json:"sum"`
}

type AgentClientLogSnapshot struct {
	Level string `json:"level"`
	Area  string `json:"area"`
	Kind  string `json:"kind"`
	Count uint64 `json:"count"`
}

type AgentClientDurationSnapshot struct {
	Count      uint64          `json:"count"`
	DurationMS DurationSummary `json:"duration_ms"`
}

type AgentClientMetrics struct {
	mu         sync.RWMutex
	ingest     map[string]*agentClientIngestStats
	operations map[agentClientOperationKey]*agentClientOperationStats
	phases     map[agentClientPhaseKey]*agentClientDurationStats
	metrics    map[agentClientMetricKey]*agentClientMetricStats
	logs       map[agentClientLogKey]uint64
	longTasks  agentClientDurationStats
}

type agentClientOperationKey struct {
	kind   string
	status string
}

type agentClientPhaseKey struct {
	kind  string
	phase string
}

type agentClientMetricKey struct {
	name   string
	unit   string
	labels string
}

type agentClientLogKey struct {
	level string
	area  string
	kind  string
}

type agentClientOperationStats struct {
	agentClientDurationStats
	slow uint64
}

type agentClientIngestStats struct {
	batches uint64
	samples uint64
}

type agentClientDurationStats struct {
	count       uint64
	durationSum time.Duration
	durationMax time.Duration
}

type agentClientMetricStats struct {
	labels map[string]string
	count  uint64
	sum    float64
	max    float64
}

func NewAgentClientMetrics() *AgentClientMetrics {
	return &AgentClientMetrics{
		ingest:     map[string]*agentClientIngestStats{},
		operations: map[agentClientOperationKey]*agentClientOperationStats{},
		phases:     map[agentClientPhaseKey]*agentClientDurationStats{},
		metrics:    map[agentClientMetricKey]*agentClientMetricStats{},
		logs:       map[agentClientLogKey]uint64{},
	}
}

func DefaultAgentClientMetrics() *AgentClientMetrics {
	return defaultAgentClientMetrics
}

func (m *AgentClientMetrics) RecordIngest(status string, samples int) {
	if m == nil {
		return
	}
	status = normalizeAgentMetricLabel(status, "accepted")
	if samples < 0 {
		samples = 0
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	stats := m.ingest[status]
	if stats == nil {
		stats = &agentClientIngestStats{}
		m.ingest[status] = stats
	}
	stats.batches++
	stats.samples += uint64(samples)
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

func (m *AgentClientMetrics) RecordMetric(sample AgentClientMetricSample) {
	if m == nil {
		return
	}
	name := normalizeAgentMetricName(sample.Name)
	unit := normalizeAgentMetricUnit(sample.Unit)
	if sample.Value < 0 {
		sample.Value = 0
	}
	if !isFiniteFloat(sample.Value) {
		sample.Value = 0
	}
	labels := normalizeAgentMetricLabels(sample.Labels)
	labelKey := stableAgentMetricLabels(labels)

	m.mu.Lock()
	defer m.mu.Unlock()

	key := agentClientMetricKey{name: name, unit: unit, labels: labelKey}
	stats := m.metrics[key]
	if stats == nil {
		stats = &agentClientMetricStats{labels: labels}
		m.metrics[key] = stats
	}
	stats.count++
	stats.sum += sample.Value
	if sample.Value > stats.max {
		stats.max = sample.Value
	}
}

func (m *AgentClientMetrics) RecordLog(sample AgentClientLogSample) {
	if m == nil {
		return
	}
	key := agentClientLogKey{
		level: normalizeAgentMetricLabel(sample.Level, "error"),
		area:  normalizeAgentMetricLabel(sample.Area, "agent_frontend"),
		kind:  normalizeAgentMetricLabel(sample.Kind, "unknown"),
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logs[key]++
}

func (m *AgentClientMetrics) Snapshot() AgentClientMetricsSnapshot {
	if m == nil {
		return AgentClientMetricsSnapshot{}
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	ingestKeys := make([]string, 0, len(m.ingest))
	for key := range m.ingest {
		ingestKeys = append(ingestKeys, key)
	}
	sort.Strings(ingestKeys)
	ingest := make([]AgentClientIngestSnapshot, 0, len(ingestKeys))
	summary := AgentClientMetricsSummary{}
	for _, key := range ingestKeys {
		stats := m.ingest[key]
		summary.Batches += stats.batches
		summary.Samples += stats.samples
		if key != "accepted" {
			summary.Rejected += stats.batches
		}
		ingest = append(ingest, AgentClientIngestSnapshot{
			Status:  key,
			Batches: stats.batches,
			Samples: stats.samples,
		})
	}

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
	metricKeys := make([]agentClientMetricKey, 0, len(m.metrics))
	for key := range m.metrics {
		metricKeys = append(metricKeys, key)
	}
	sort.Slice(metricKeys, func(i, j int) bool {
		if metricKeys[i].name == metricKeys[j].name {
			if metricKeys[i].unit == metricKeys[j].unit {
				return metricKeys[i].labels < metricKeys[j].labels
			}
			return metricKeys[i].unit < metricKeys[j].unit
		}
		return metricKeys[i].name < metricKeys[j].name
	})
	metrics := make([]AgentClientMetricSnapshot, 0, len(metricKeys))
	for _, key := range metricKeys {
		stats := m.metrics[key]
		summary.Metrics += stats.count
		metrics = append(metrics, AgentClientMetricSnapshot{
			Name:   key.name,
			Unit:   key.unit,
			Labels: copyStringMap(stats.labels),
			Count:  stats.count,
			Value:  numericSummary(stats.count, stats.sum, stats.max),
		})
	}

	logKeys := make([]agentClientLogKey, 0, len(m.logs))
	for key := range m.logs {
		logKeys = append(logKeys, key)
	}
	sort.Slice(logKeys, func(i, j int) bool {
		if logKeys[i].level == logKeys[j].level {
			if logKeys[i].area == logKeys[j].area {
				return logKeys[i].kind < logKeys[j].kind
			}
			return logKeys[i].area < logKeys[j].area
		}
		return logKeys[i].level < logKeys[j].level
	})
	logs := make([]AgentClientLogSnapshot, 0, len(logKeys))
	for _, key := range logKeys {
		count := m.logs[key]
		summary.Logs += count
		logs = append(logs, AgentClientLogSnapshot{
			Level: key.level,
			Area:  key.area,
			Kind:  key.kind,
			Count: count,
		})
	}

	return AgentClientMetricsSnapshot{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Ingest:      ingest,
		Operations:  operations,
		Phases:      phases,
		Metrics:     metrics,
		Logs:        logs,
		LongTasks: AgentClientDurationSnapshot{
			Count:      m.longTasks.count,
			DurationMS: durationSummary(m.longTasks),
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
	b.WriteString("# HELP movscript_agent_client_telemetry_batches_total Total frontend agent telemetry batches received by the backend.\n")
	b.WriteString("# TYPE movscript_agent_client_telemetry_batches_total counter\n")
	for _, item := range snapshot.Ingest {
		fmt.Fprintf(&b, "movscript_agent_client_telemetry_batches_total{status=%q} %d\n", escapePromLabel(item.Status), item.Batches)
	}
	b.WriteString("# HELP movscript_agent_client_telemetry_samples_total Total frontend agent telemetry samples received by the backend.\n")
	b.WriteString("# TYPE movscript_agent_client_telemetry_samples_total counter\n")
	for _, item := range snapshot.Ingest {
		fmt.Fprintf(&b, "movscript_agent_client_telemetry_samples_total{status=%q} %d\n", escapePromLabel(item.Status), item.Samples)
	}
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
	b.WriteString("# HELP movscript_agent_client_metric_milliseconds Frontend or Agent telemetry metric values in milliseconds.\n")
	b.WriteString("# TYPE movscript_agent_client_metric_milliseconds summary\n")
	for _, item := range snapshot.Metrics {
		if item.Unit != "ms" {
			continue
		}
		labels := agentMetricPromLabels(item.Name, item.Labels)
		fmt.Fprintf(&b, "movscript_agent_client_metric_milliseconds_count%s %d\n", labels, item.Count)
		fmt.Fprintf(&b, "movscript_agent_client_metric_milliseconds_sum%s %.3f\n", labels, item.Value.Sum)
		fmt.Fprintf(&b, "movscript_agent_client_metric_milliseconds_max%s %.3f\n", labels, item.Value.Max)
	}
	b.WriteString("# HELP movscript_agent_client_metric_bytes Frontend or Agent telemetry metric values in bytes.\n")
	b.WriteString("# TYPE movscript_agent_client_metric_bytes summary\n")
	for _, item := range snapshot.Metrics {
		if item.Unit != "bytes" {
			continue
		}
		labels := agentMetricPromLabels(item.Name, item.Labels)
		fmt.Fprintf(&b, "movscript_agent_client_metric_bytes_count%s %d\n", labels, item.Count)
		fmt.Fprintf(&b, "movscript_agent_client_metric_bytes_sum%s %.3f\n", labels, item.Value.Sum)
		fmt.Fprintf(&b, "movscript_agent_client_metric_bytes_max%s %.3f\n", labels, item.Value.Max)
	}
	b.WriteString("# HELP movscript_agent_client_metric_count_total Frontend or Agent telemetry count metric totals.\n")
	b.WriteString("# TYPE movscript_agent_client_metric_count_total counter\n")
	for _, item := range snapshot.Metrics {
		if item.Unit != "count" {
			continue
		}
		labels := agentMetricPromLabels(item.Name, item.Labels)
		fmt.Fprintf(&b, "movscript_agent_client_metric_count_total%s %.3f\n", labels, item.Value.Sum)
	}
	b.WriteString("# HELP movscript_agent_client_metric_score Frontend or Agent telemetry score values.\n")
	b.WriteString("# TYPE movscript_agent_client_metric_score summary\n")
	for _, item := range snapshot.Metrics {
		if item.Unit != "score" {
			continue
		}
		labels := agentMetricPromLabels(item.Name, item.Labels)
		fmt.Fprintf(&b, "movscript_agent_client_metric_score_count%s %d\n", labels, item.Count)
		fmt.Fprintf(&b, "movscript_agent_client_metric_score_sum%s %.3f\n", labels, item.Value.Sum)
		fmt.Fprintf(&b, "movscript_agent_client_metric_score_max%s %.3f\n", labels, item.Value.Max)
	}
	b.WriteString("# HELP movscript_agent_client_logs_total Frontend or Agent diagnostic log totals by low-cardinality class.\n")
	b.WriteString("# TYPE movscript_agent_client_logs_total counter\n")
	for _, item := range snapshot.Logs {
		fmt.Fprintf(&b, "movscript_agent_client_logs_total{level=%q,area=%q,kind=%q} %d\n", escapePromLabel(item.Level), escapePromLabel(item.Area), escapePromLabel(item.Kind), item.Count)
	}
	b.WriteString("# HELP movscript_agent_client_long_task_duration_milliseconds Browser Long Task duration reported by clients.\n")
	b.WriteString("# TYPE movscript_agent_client_long_task_duration_milliseconds summary\n")
	fmt.Fprintf(&b, "movscript_agent_client_long_task_duration_milliseconds_count %d\n", snapshot.LongTasks.Count)
	fmt.Fprintf(&b, "movscript_agent_client_long_task_duration_milliseconds_sum %.3f\n", snapshot.LongTasks.DurationMS.Sum)
	fmt.Fprintf(&b, "movscript_agent_client_long_task_duration_milliseconds_max %.3f\n", snapshot.LongTasks.DurationMS.Max)
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

func numericSummary(count uint64, sum float64, max float64) NumericSummary {
	avg := 0.0
	if count > 0 {
		avg = sum / float64(count)
	}
	return NumericSummary{
		Avg: avg,
		Max: max,
		Sum: sum,
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
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '/' || r == ':' || r == '.' {
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

func normalizeAgentMetricName(value string) string {
	return normalizeAgentMetricLabel(value, "unknown")
}

func normalizeAgentMetricUnit(value string) string {
	switch normalizeAgentMetricLabel(value, "count") {
	case "ms":
		return "ms"
	case "bytes":
		return "bytes"
	case "score":
		return "score"
	default:
		return "count"
	}
}

func normalizeAgentMetricLabels(labels map[string]string) map[string]string {
	if len(labels) == 0 {
		return nil
	}
	allowed := map[string]struct{}{
		"area":         {},
		"component":    {},
		"kind":         {},
		"level":        {},
		"method":       {},
		"route_group":  {},
		"role":         {},
		"stage":        {},
		"status":       {},
		"status_class": {},
		"tool_name":    {},
		"transport":    {},
		"vital":        {},
	}
	keys := make([]string, 0, len(labels))
	for key := range labels {
		normalizedKey := normalizeAgentMetricLabel(key, "")
		if _, ok := allowed[normalizedKey]; ok {
			keys = append(keys, normalizedKey)
		}
	}
	sort.Strings(keys)
	result := make(map[string]string, len(keys))
	for _, key := range keys {
		value := labels[key]
		if value == "" {
			for rawKey, rawValue := range labels {
				if normalizeAgentMetricLabel(rawKey, "") == key {
					value = rawValue
					break
				}
			}
		}
		result[key] = normalizeAgentMetricLabel(value, "unknown")
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func stableAgentMetricLabels(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}
	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+labels[key])
	}
	return strings.Join(parts, ",")
}

func agentMetricPromLabels(metric string, labels map[string]string) string {
	parts := []string{fmt.Sprintf("metric=%q", escapePromLabel(metric))}
	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%q", normalizeAgentMetricLabel(key, "label"), escapePromLabel(labels[key])))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func copyStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}
	result := make(map[string]string, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func isFiniteFloat(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
