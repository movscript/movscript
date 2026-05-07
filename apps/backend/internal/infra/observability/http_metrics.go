package observability

import (
	"bytes"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var defaultHTTPMetrics = NewHTTPMetrics(HTTPMetricsConfig{})

type HTTPMetricsConfig struct {
	SlowThreshold  time.Duration
	MaxSlowSamples int
	Buckets        []time.Duration
}

type HTTPMetrics struct {
	mu             sync.RWMutex
	routes         map[httpRouteKey]*httpRouteStats
	buckets        []time.Duration
	slowThreshold  time.Duration
	maxSlowSamples int
	slowRequests   []SlowHTTPRequest
	startedAt      time.Time
}

type HTTPRequestSample struct {
	Method    string
	Route     string
	Path      string
	Status    int
	Latency   time.Duration
	RequestID string
	Time      time.Time
}

type SlowHTTPRequest struct {
	Method    string  `json:"method"`
	Route     string  `json:"route"`
	Path      string  `json:"path,omitempty"`
	Status    int     `json:"status"`
	LatencyMS float64 `json:"latency_ms"`
	RequestID string  `json:"request_id,omitempty"`
	At        string  `json:"at"`
}

type HTTPMetricsSnapshot struct {
	StartedAt    string                 `json:"started_at"`
	GeneratedAt  string                 `json:"generated_at"`
	Requests     uint64                 `json:"requests"`
	Errors       uint64                 `json:"errors"`
	Routes       []HTTPRouteSnapshot    `json:"routes"`
	SlowRequests []SlowHTTPRequest      `json:"slow_requests"`
	BucketsMS    []float64              `json:"buckets_ms"`
	Summary      map[string]interface{} `json:"summary"`
}

type HTTPRouteSnapshot struct {
	Method       string            `json:"method"`
	Route        string            `json:"route"`
	Requests     uint64            `json:"requests"`
	Errors       uint64            `json:"errors"`
	StatusCounts map[string]uint64 `json:"status_counts"`
	LatencyMS    LatencySnapshot   `json:"latency_ms"`
	Buckets      map[string]uint64 `json:"buckets"`
}

type LatencySnapshot struct {
	Min float64 `json:"min"`
	Max float64 `json:"max"`
	Avg float64 `json:"avg"`
}

type httpRouteKey struct {
	method string
	route  string
}

type httpRouteStats struct {
	requests     uint64
	errors       uint64
	statusCounts map[int]uint64
	latencySum   time.Duration
	latencyMin   time.Duration
	latencyMax   time.Duration
	bucketCounts []uint64
}

func NewHTTPMetrics(cfg HTTPMetricsConfig) *HTTPMetrics {
	buckets := cfg.Buckets
	if len(buckets) == 0 {
		buckets = []time.Duration{
			5 * time.Millisecond,
			10 * time.Millisecond,
			25 * time.Millisecond,
			50 * time.Millisecond,
			100 * time.Millisecond,
			250 * time.Millisecond,
			500 * time.Millisecond,
			time.Second,
			2500 * time.Millisecond,
			5 * time.Second,
			10 * time.Second,
		}
	}
	buckets = append([]time.Duration(nil), buckets...)
	sort.Slice(buckets, func(i, j int) bool { return buckets[i] < buckets[j] })

	slowThreshold := cfg.SlowThreshold
	if slowThreshold <= 0 {
		slowThreshold = time.Second
	}
	maxSlowSamples := cfg.MaxSlowSamples
	if maxSlowSamples <= 0 {
		maxSlowSamples = 50
	}

	return &HTTPMetrics{
		routes:         make(map[httpRouteKey]*httpRouteStats),
		buckets:        buckets,
		slowThreshold:  slowThreshold,
		maxSlowSamples: maxSlowSamples,
		startedAt:      time.Now().UTC(),
	}
}

func DefaultHTTPMetrics() *HTTPMetrics {
	return defaultHTTPMetrics
}

func RequestMetrics(recorder *HTTPMetrics) gin.HandlerFunc {
	if recorder == nil {
		recorder = defaultHTTPMetrics
	}
	return func(c *gin.Context) {
		start := time.Now()
		defer func() {
			route := c.FullPath()
			if route == "" {
				route = "unmatched"
			}
			status := c.Writer.Status()
			if status == 0 {
				status = http.StatusOK
			}
			recorder.Record(HTTPRequestSample{
				Method:    c.Request.Method,
				Route:     route,
				Path:      c.Request.URL.Path,
				Status:    status,
				Latency:   time.Since(start),
				RequestID: RequestIDFromContext(c.Request.Context()),
				Time:      time.Now().UTC(),
			})
		}()

		c.Next()
	}
}

func (m *HTTPMetrics) Record(sample HTTPRequestSample) {
	if m == nil {
		return
	}
	if sample.Method == "" {
		sample.Method = "UNKNOWN"
	}
	if sample.Route == "" {
		sample.Route = "unmatched"
	}
	if sample.Status == 0 {
		sample.Status = http.StatusOK
	}
	if sample.Time.IsZero() {
		sample.Time = time.Now().UTC()
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	key := httpRouteKey{method: sample.Method, route: sample.Route}
	stats := m.routes[key]
	if stats == nil {
		stats = &httpRouteStats{
			statusCounts: make(map[int]uint64),
			bucketCounts: make([]uint64, len(m.buckets)+1),
		}
		m.routes[key] = stats
	}
	stats.requests++
	if sample.Status >= 500 {
		stats.errors++
	}
	stats.statusCounts[sample.Status]++
	stats.latencySum += sample.Latency
	if stats.latencyMin == 0 || sample.Latency < stats.latencyMin {
		stats.latencyMin = sample.Latency
	}
	if sample.Latency > stats.latencyMax {
		stats.latencyMax = sample.Latency
	}
	stats.bucketCounts[bucketIndex(sample.Latency, m.buckets)]++

	if sample.Latency >= m.slowThreshold {
		m.slowRequests = append(m.slowRequests, SlowHTTPRequest{
			Method:    sample.Method,
			Route:     sample.Route,
			Path:      sample.Path,
			Status:    sample.Status,
			LatencyMS: durationMS(sample.Latency),
			RequestID: sample.RequestID,
			At:        sample.Time.Format(time.RFC3339Nano),
		})
		if len(m.slowRequests) > m.maxSlowSamples {
			copy(m.slowRequests, m.slowRequests[len(m.slowRequests)-m.maxSlowSamples:])
			m.slowRequests = m.slowRequests[:m.maxSlowSamples]
		}
	}
}

func (m *HTTPMetrics) Snapshot() HTTPMetricsSnapshot {
	if m == nil {
		return HTTPMetricsSnapshot{}
	}
	m.mu.RLock()
	defer m.mu.RUnlock()

	routes := make([]HTTPRouteSnapshot, 0, len(m.routes))
	var requests uint64
	var errors uint64
	for key, stats := range m.routes {
		requests += stats.requests
		errors += stats.errors
		routes = append(routes, buildRouteSnapshot(key, stats, m.buckets))
	}
	sort.Slice(routes, func(i, j int) bool {
		if routes[i].LatencyMS.Max == routes[j].LatencyMS.Max {
			if routes[i].Route == routes[j].Route {
				return routes[i].Method < routes[j].Method
			}
			return routes[i].Route < routes[j].Route
		}
		return routes[i].LatencyMS.Max > routes[j].LatencyMS.Max
	})

	slow := append([]SlowHTTPRequest(nil), m.slowRequests...)
	bucketsMS := make([]float64, 0, len(m.buckets))
	for _, bucket := range m.buckets {
		bucketsMS = append(bucketsMS, durationMS(bucket))
	}
	now := time.Now().UTC()
	return HTTPMetricsSnapshot{
		StartedAt:    m.startedAt.Format(time.RFC3339Nano),
		GeneratedAt:  now.Format(time.RFC3339Nano),
		Requests:     requests,
		Errors:       errors,
		Routes:       routes,
		SlowRequests: slow,
		BucketsMS:    bucketsMS,
		Summary: map[string]interface{}{
			"route_count":          len(routes),
			"slow_threshold_ms":    durationMS(m.slowThreshold),
			"slow_sample_capacity": m.maxSlowSamples,
			"uptime_seconds":       now.Sub(m.startedAt).Seconds(),
		},
	}
}

func (m *HTTPMetrics) PrometheusText() string {
	snapshot := m.Snapshot()
	var b bytes.Buffer
	b.WriteString("# HELP movscript_http_requests_total Total HTTP requests by method, route, status, and status class.\n")
	b.WriteString("# TYPE movscript_http_requests_total counter\n")
	for _, route := range snapshot.Routes {
		statuses := make([]string, 0, len(route.StatusCounts))
		for status := range route.StatusCounts {
			statuses = append(statuses, status)
		}
		sort.Strings(statuses)
		for _, status := range statuses {
			count := route.StatusCounts[status]
			fmt.Fprintf(
				&b,
				"movscript_http_requests_total{method=%q,route=%q,status=%q,status_class=%q} %d\n",
				escapePromLabel(route.Method),
				escapePromLabel(route.Route),
				status,
				statusClass(status),
				count,
			)
		}
	}

	b.WriteString("# HELP movscript_http_request_duration_milliseconds HTTP request latency histogram in milliseconds.\n")
	b.WriteString("# TYPE movscript_http_request_duration_milliseconds histogram\n")
	for _, route := range snapshot.Routes {
		var cumulative uint64
		for _, bucket := range sortedBucketLabels(route.Buckets) {
			cumulative += route.Buckets[bucket]
			fmt.Fprintf(
				&b,
				"movscript_http_request_duration_milliseconds_bucket{method=%q,route=%q,le=%q} %d\n",
				escapePromLabel(route.Method),
				escapePromLabel(route.Route),
				bucket,
				cumulative,
			)
		}
		fmt.Fprintf(&b, "movscript_http_request_duration_milliseconds_count{method=%q,route=%q} %d\n", escapePromLabel(route.Method), escapePromLabel(route.Route), route.Requests)
		fmt.Fprintf(&b, "movscript_http_request_duration_milliseconds_sum{method=%q,route=%q} %.3f\n", escapePromLabel(route.Method), escapePromLabel(route.Route), route.LatencyMS.Avg*float64(route.Requests))
	}

	b.WriteString("# HELP movscript_http_route_errors_total Total HTTP 5xx responses by method and route.\n")
	b.WriteString("# TYPE movscript_http_route_errors_total counter\n")
	for _, route := range snapshot.Routes {
		fmt.Fprintf(&b, "movscript_http_route_errors_total{method=%q,route=%q} %d\n", escapePromLabel(route.Method), escapePromLabel(route.Route), route.Errors)
	}
	return b.String()
}

func MetricsHandler(recorder *HTTPMetrics) gin.HandlerFunc {
	if recorder == nil {
		recorder = defaultHTTPMetrics
	}
	return func(c *gin.Context) {
		c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(recorder.PrometheusText()))
	}
}

func MetricsSnapshotHandler(recorder *HTTPMetrics) gin.HandlerFunc {
	if recorder == nil {
		recorder = defaultHTTPMetrics
	}
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, recorder.Snapshot())
	}
}

func buildRouteSnapshot(key httpRouteKey, stats *httpRouteStats, buckets []time.Duration) HTTPRouteSnapshot {
	statusCounts := make(map[string]uint64, len(stats.statusCounts))
	for status, count := range stats.statusCounts {
		statusCounts[fmt.Sprintf("%d", status)] = count
	}
	routeBuckets := make(map[string]uint64, len(stats.bucketCounts))
	for i, count := range stats.bucketCounts {
		if i < len(buckets) {
			routeBuckets[formatBucket(buckets[i])] = count
		} else {
			routeBuckets["+Inf"] = count
		}
	}
	avg := 0.0
	if stats.requests > 0 {
		avg = durationMS(stats.latencySum) / float64(stats.requests)
	}
	return HTTPRouteSnapshot{
		Method:       key.method,
		Route:        key.route,
		Requests:     stats.requests,
		Errors:       stats.errors,
		StatusCounts: statusCounts,
		LatencyMS: LatencySnapshot{
			Min: durationMS(stats.latencyMin),
			Max: durationMS(stats.latencyMax),
			Avg: avg,
		},
		Buckets: routeBuckets,
	}
}

func bucketIndex(latency time.Duration, buckets []time.Duration) int {
	for i, bucket := range buckets {
		if latency <= bucket {
			return i
		}
	}
	return len(buckets)
}

func durationMS(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000.0
}

func formatBucket(bucket time.Duration) string {
	ms := durationMS(bucket)
	if math.Trunc(ms) == ms {
		return fmt.Sprintf("%.0f", ms)
	}
	return fmt.Sprintf("%.3f", ms)
}

func sortedBucketLabels(buckets map[string]uint64) []string {
	labels := make([]string, 0, len(buckets))
	for label := range buckets {
		labels = append(labels, label)
	}
	sort.Slice(labels, func(i, j int) bool {
		if labels[i] == "+Inf" {
			return false
		}
		if labels[j] == "+Inf" {
			return true
		}
		return parseBucketLabel(labels[i]) < parseBucketLabel(labels[j])
	})
	return labels
}

func parseBucketLabel(label string) float64 {
	v := 0.0
	_, _ = fmt.Sscanf(label, "%f", &v)
	return v
}

func statusClass(status string) string {
	if len(status) == 0 {
		return "unknown"
	}
	return status[:1] + "xx"
}

func escapePromLabel(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "\n", "\\n")
	value = strings.ReplaceAll(value, "\"", "\\\"")
	return value
}
