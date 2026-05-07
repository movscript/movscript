package observability

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestHTTPMetricsRecordsRouteStatsAndSlowRequests(t *testing.T) {
	metrics := NewHTTPMetrics(HTTPMetricsConfig{
		SlowThreshold:  100 * time.Millisecond,
		MaxSlowSamples: 2,
		Buckets:        []time.Duration{10 * time.Millisecond, 100 * time.Millisecond},
	})

	metrics.Record(HTTPRequestSample{
		Method:  http.MethodGet,
		Route:   "/api/v1/projects/:id",
		Path:    "/api/v1/projects/42",
		Status:  http.StatusOK,
		Latency: 8 * time.Millisecond,
		Time:    time.Unix(10, 0).UTC(),
	})
	metrics.Record(HTTPRequestSample{
		Method:    http.MethodGet,
		Route:     "/api/v1/projects/:id",
		Path:      "/api/v1/projects/42",
		Status:    http.StatusInternalServerError,
		Latency:   150 * time.Millisecond,
		RequestID: "req_1",
		Time:      time.Unix(11, 0).UTC(),
	})

	snapshot := metrics.Snapshot()
	if snapshot.Requests != 2 {
		t.Fatalf("requests = %d, want 2", snapshot.Requests)
	}
	if snapshot.Errors != 1 {
		t.Fatalf("errors = %d, want 1", snapshot.Errors)
	}
	if len(snapshot.Routes) != 1 {
		t.Fatalf("routes length = %d, want 1", len(snapshot.Routes))
	}
	route := snapshot.Routes[0]
	if route.Method != http.MethodGet || route.Route != "/api/v1/projects/:id" {
		t.Fatalf("route = %s %s, want GET /api/v1/projects/:id", route.Method, route.Route)
	}
	if route.StatusCounts["200"] != 1 || route.StatusCounts["500"] != 1 {
		t.Fatalf("status counts = %#v, want one 200 and one 500", route.StatusCounts)
	}
	if route.LatencyMS.Min != 8 || route.LatencyMS.Max != 150 || route.LatencyMS.Avg != 79 {
		t.Fatalf("latency = %#v, want min 8 max 150 avg 79", route.LatencyMS)
	}
	if len(snapshot.SlowRequests) != 1 {
		t.Fatalf("slow requests length = %d, want 1", len(snapshot.SlowRequests))
	}
	if snapshot.SlowRequests[0].RequestID != "req_1" {
		t.Fatalf("slow request id = %q, want req_1", snapshot.SlowRequests[0].RequestID)
	}
}

func TestHTTPMetricsPrometheusText(t *testing.T) {
	metrics := NewHTTPMetrics(HTTPMetricsConfig{Buckets: []time.Duration{50 * time.Millisecond}})
	metrics.Record(HTTPRequestSample{
		Method:  http.MethodPost,
		Route:   "/v1/chat/completions",
		Status:  http.StatusBadGateway,
		Latency: 75 * time.Millisecond,
	})

	text := metrics.PrometheusText()
	for _, want := range []string{
		`movscript_http_requests_total{method="POST",route="/v1/chat/completions",status="502",status_class="5xx"} 1`,
		`movscript_http_request_duration_milliseconds_bucket{method="POST",route="/v1/chat/completions",le="+Inf"} 1`,
		`movscript_http_route_errors_total{method="POST",route="/v1/chat/completions"} 1`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Prometheus text missing %q in:\n%s", want, text)
		}
	}
}
