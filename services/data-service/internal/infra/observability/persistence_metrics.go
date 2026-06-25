package observability

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

var defaultDBMetrics = NewDBMetrics()
var defaultObjectStorageMetrics = NewObjectStorageMetrics()

type DBQuerySample struct {
	Operation string
	Status    string
	Duration  time.Duration
}

type ObjectStorageOperationSample struct {
	Backend   string
	Operation string
	Status    string
	Duration  time.Duration
	Bytes     int64
}

type DBMetrics struct {
	mu      sync.RWMutex
	queries map[persistenceOperationKey]*durationStats
}

type ObjectStorageMetrics struct {
	mu         sync.RWMutex
	operations map[objectStorageOperationKey]*durationStats
	bytes      map[objectStorageOperationKey]*numericStats
}

type persistenceOperationKey struct {
	operation string
	status    string
}

type objectStorageOperationKey struct {
	backend   string
	operation string
	status    string
}

type durationStats struct {
	count uint64
	sum   time.Duration
	max   time.Duration
}

type numericStats struct {
	count uint64
	sum   float64
	max   float64
}

func NewDBMetrics() *DBMetrics {
	return &DBMetrics{queries: map[persistenceOperationKey]*durationStats{}}
}

func DefaultDBMetrics() *DBMetrics {
	return defaultDBMetrics
}

func (m *DBMetrics) RecordQuery(sample DBQuerySample) {
	if m == nil {
		return
	}
	operation := normalizePersistenceLabel(sample.Operation, "unknown")
	status := normalizePersistenceLabel(sample.Status, "success")
	if sample.Duration < 0 {
		sample.Duration = 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	key := persistenceOperationKey{operation: operation, status: status}
	stats := m.queries[key]
	if stats == nil {
		stats = &durationStats{}
		m.queries[key] = stats
	}
	recordDurationStats(stats, sample.Duration)
}

func (m *DBMetrics) PrometheusText() string {
	if m == nil {
		return ""
	}
	m.mu.RLock()
	keys := make([]persistenceOperationKey, 0, len(m.queries))
	for key := range m.queries {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].operation == keys[j].operation {
			return keys[i].status < keys[j].status
		}
		return keys[i].operation < keys[j].operation
	})
	snapshots := make([]struct {
		key   persistenceOperationKey
		stats durationStats
	}, 0, len(keys))
	for _, key := range keys {
		snapshots = append(snapshots, struct {
			key   persistenceOperationKey
			stats durationStats
		}{key: key, stats: *m.queries[key]})
	}
	m.mu.RUnlock()

	var b bytes.Buffer
	b.WriteString("# HELP movscript_db_queries_total Total database queries by operation and status.\n")
	b.WriteString("# TYPE movscript_db_queries_total counter\n")
	for _, item := range snapshots {
		fmt.Fprintf(&b, "movscript_db_queries_total{operation=%q,status=%q} %d\n", escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.stats.count)
	}
	b.WriteString("# HELP movscript_db_query_duration_milliseconds Database query duration in milliseconds.\n")
	b.WriteString("# TYPE movscript_db_query_duration_milliseconds summary\n")
	for _, item := range snapshots {
		fmt.Fprintf(&b, "movscript_db_query_duration_milliseconds_count{operation=%q,status=%q} %d\n", escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.stats.count)
		fmt.Fprintf(&b, "movscript_db_query_duration_milliseconds_sum{operation=%q,status=%q} %.3f\n", escapePromLabel(item.key.operation), escapePromLabel(item.key.status), durationMS(item.stats.sum))
		fmt.Fprintf(&b, "movscript_db_query_duration_milliseconds_max{operation=%q,status=%q} %.3f\n", escapePromLabel(item.key.operation), escapePromLabel(item.key.status), durationMS(item.stats.max))
	}
	return b.String()
}

func NewObjectStorageMetrics() *ObjectStorageMetrics {
	return &ObjectStorageMetrics{
		operations: map[objectStorageOperationKey]*durationStats{},
		bytes:      map[objectStorageOperationKey]*numericStats{},
	}
}

func DefaultObjectStorageMetrics() *ObjectStorageMetrics {
	return defaultObjectStorageMetrics
}

func (m *ObjectStorageMetrics) RecordOperation(sample ObjectStorageOperationSample) {
	if m == nil {
		return
	}
	backend := normalizePersistenceLabel(sample.Backend, "unknown")
	operation := normalizePersistenceLabel(sample.Operation, "unknown")
	status := normalizePersistenceLabel(sample.Status, "success")
	if sample.Duration < 0 {
		sample.Duration = 0
	}
	key := objectStorageOperationKey{backend: backend, operation: operation, status: status}
	m.mu.Lock()
	defer m.mu.Unlock()
	stats := m.operations[key]
	if stats == nil {
		stats = &durationStats{}
		m.operations[key] = stats
	}
	recordDurationStats(stats, sample.Duration)
	if sample.Bytes >= 0 {
		byteStats := m.bytes[key]
		if byteStats == nil {
			byteStats = &numericStats{}
			m.bytes[key] = byteStats
		}
		recordNumericStats(byteStats, float64(sample.Bytes))
	}
}

func (m *ObjectStorageMetrics) PrometheusText() string {
	if m == nil {
		return ""
	}
	m.mu.RLock()
	keys := make([]objectStorageOperationKey, 0, len(m.operations))
	for key := range m.operations {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].backend == keys[j].backend {
			if keys[i].operation == keys[j].operation {
				return keys[i].status < keys[j].status
			}
			return keys[i].operation < keys[j].operation
		}
		return keys[i].backend < keys[j].backend
	})
	snapshots := make([]struct {
		key      objectStorageOperationKey
		duration durationStats
		bytes    *numericStats
	}, 0, len(keys))
	for _, key := range keys {
		var byteStats *numericStats
		if stats := m.bytes[key]; stats != nil {
			copied := *stats
			byteStats = &copied
		}
		snapshots = append(snapshots, struct {
			key      objectStorageOperationKey
			duration durationStats
			bytes    *numericStats
		}{key: key, duration: *m.operations[key], bytes: byteStats})
	}
	m.mu.RUnlock()

	var b bytes.Buffer
	b.WriteString("# HELP movscript_object_storage_operations_total Total object storage operations by backend, operation, and status.\n")
	b.WriteString("# TYPE movscript_object_storage_operations_total counter\n")
	for _, item := range snapshots {
		fmt.Fprintf(&b, "movscript_object_storage_operations_total{backend=%q,operation=%q,status=%q} %d\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.duration.count)
	}
	b.WriteString("# HELP movscript_object_storage_operation_duration_milliseconds Object storage operation duration in milliseconds.\n")
	b.WriteString("# TYPE movscript_object_storage_operation_duration_milliseconds summary\n")
	for _, item := range snapshots {
		fmt.Fprintf(&b, "movscript_object_storage_operation_duration_milliseconds_count{backend=%q,operation=%q,status=%q} %d\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.duration.count)
		fmt.Fprintf(&b, "movscript_object_storage_operation_duration_milliseconds_sum{backend=%q,operation=%q,status=%q} %.3f\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), durationMS(item.duration.sum))
		fmt.Fprintf(&b, "movscript_object_storage_operation_duration_milliseconds_max{backend=%q,operation=%q,status=%q} %.3f\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), durationMS(item.duration.max))
	}
	b.WriteString("# HELP movscript_object_storage_payload_bytes Object storage payload sizes in bytes.\n")
	b.WriteString("# TYPE movscript_object_storage_payload_bytes summary\n")
	for _, item := range snapshots {
		if item.bytes == nil {
			continue
		}
		fmt.Fprintf(&b, "movscript_object_storage_payload_bytes_count{backend=%q,operation=%q,status=%q} %d\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.bytes.count)
		fmt.Fprintf(&b, "movscript_object_storage_payload_bytes_sum{backend=%q,operation=%q,status=%q} %.3f\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.bytes.sum)
		fmt.Fprintf(&b, "movscript_object_storage_payload_bytes_max{backend=%q,operation=%q,status=%q} %.3f\n", escapePromLabel(item.key.backend), escapePromLabel(item.key.operation), escapePromLabel(item.key.status), item.bytes.max)
	}
	return b.String()
}

func recordDurationStats(stats *durationStats, duration time.Duration) {
	stats.count++
	stats.sum += duration
	if duration > stats.max {
		stats.max = duration
	}
}

func recordNumericStats(stats *numericStats, value float64) {
	stats.count++
	stats.sum += value
	if value > stats.max {
		stats.max = value
	}
}

func normalizePersistenceLabel(value string, fallback string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		value = fallback
	}
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
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
