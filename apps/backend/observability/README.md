# Movscript Backend Observability

The backend exposes Prometheus metrics at `GET /metrics`. This stack starts Prometheus and Grafana with provisioned dashboards for the backend, provider-session and app-server behavior, frontend health, infrastructure pressure, and alerts.

## Start

Start the community backend with the provisioned observability stack from the repository root:

```bash
docker compose --profile observability up --build
```

Ports:

- Prometheus: `http://127.0.0.1:9091`
- Grafana: `http://127.0.0.1:3002`
- Backend metrics target inside compose: `http://backend:8765/metrics`
- Optional local provider-session app-server target from compose: `http://host.docker.internal:28765/metrics`
- Host metrics target inside compose: `http://node-exporter:9100/metrics`
- Container metrics target inside compose: `http://cadvisor:8080/metrics`

You can also run the standalone local-dev stack when the backend is already running on the host.

Start the backend first:

```bash
cd apps/backend
go run ./cmd/server
```

Start the observability stack from the repository root:

```bash
docker compose -f apps/backend/observability/docker-compose.yml up -d
```

Ports:

- Prometheus: `http://127.0.0.1:9091`
- Grafana: `http://127.0.0.1:3002`
- Backend metrics target: `http://host.docker.internal:8765/metrics`
- Optional local provider-session app-server target: `http://host.docker.internal:28765/metrics`
- Host metrics target: `http://127.0.0.1:9100/metrics`
- Container metrics target: `http://127.0.0.1:8081/metrics`

Grafana anonymous admin access is enabled for local development. The default dashboard is provisioned under the `Movscript` folder.

The local-dev stack includes `node_exporter` and `cAdvisor`. On Docker Desktop these provide useful host/container pressure signals, but some low-level filesystem or cgroup metrics can vary by OS. Prometheus still marks each scrape target in Grafana so missing local-only targets are visible.

## Prometheus Alert Rules

Prometheus loads `rules/movscript-alerts.yml` automatically in both the root `docker compose --profile observability` stack and the standalone observability compose file. The default rules cover:

- Backend scrape availability
- HTTP 5xx spikes and route p95 latency
- Agent telemetry rejected batches
- Agent frontend network latency and frontend errors
- Centralized provider-session failed spans and slow provider stages
- Web Vitals thresholds for LCP, INP, and CLS
- Infrastructure exporter availability, host memory pressure, and host disk pressure

The rules intentionally use the same low-cardinality labels as the dashboards, so new routes, Agent stages, and operation kinds remain visible without editing the rule file unless they need a new threshold.

## Grafana Dashboards

Grafana provisions all JSON dashboards under `grafana/dashboards`. The current dashboard set is organized by the question an engineer is trying to answer:

- `MovScript Overview`: first-screen system health, HTTP/Agent/frontend status, and active alerts.
- `Mova`: assistant client operations, provider spans, phase latency, slow stages, local storage/trace store health, and failure evidence.
- `MovScript Frontend`: Web Vitals, frontend errors, network latency, Long Task, frontend storage latency, Agent send-stage latency, and composer input latency.
- `MovScript Backend`: HTTP traffic, route latency/errors, DB query latency, object storage latency, shot vector metrics, and app-server compatibility panels.
- `MovScript Infrastructure`: host CPU/memory/disk/network, container CPU/memory, and scrape target health.
- `MovScript Alerts`: firing/pending alerts, telemetry rejection, down targets, and alert evidence.
- `Movscript Backend`: legacy combined dashboard retained temporarily for compatibility while the split dashboards settle.

The dashboards intentionally avoid hardcoded route or phase lists. New backend routes, Agent operation kinds, Agent stages, and frontend areas appear automatically as long as they use the existing low-cardinality metric labels.

Frontend and Agent telemetry share the same generic sample shape for extensibility:

```json
{
  "metrics": [
    {
      "name": "frontend_agent_network_request_duration_ms",
      "unit": "ms",
      "value": 35,
      "labels": {
        "method": "POST",
        "route_group": "/threads/:id/runs",
        "status_class": "2xx",
        "transport": "http"
      }
    }
  ],
  "logs": [
    {
      "level": "error",
      "area": "agent_frontend",
      "kind": "window_error"
    }
  ]
}
```

The desktop frontend telemetry contract lives in `packages/core/src/agent/protocol.ts`: `AGENT_CLIENT_TELEMETRY_SCHEMA`, `AGENT_TELEMETRY_LABEL_KEYS`, `AGENT_TELEMETRY_REPORTABLE_METRICS`, `createAgentTelemetryMetricSample`, `createAgentTelemetryLogSample`, and `isAgentTelemetryReportableMetricName`. Frontend and provider collectors should keep provider-specific observation code separate, then adapt samples through this shared runtime contract instead of introducing one-off metric payloads. The backend keeps only allowlisted low-cardinality labels and drops arbitrary labels.

The desktop frontend also polls the local provider-session app-server telemetry snapshot after authentication and forwards reportable provider metrics through the same backend telemetry endpoint. This keeps Enterprise and community Grafana dashboards useful even when Prometheus cannot directly scrape a user's local app-server process.

## Agent Client Metrics

The desktop Agent UI reports a small, privacy-safe telemetry batch to `POST /api/v1/agent/telemetry` after authentication. The payload contains only low-cardinality performance data:

- operation kind, status, duration, and slow-operation flag
- phase names and phase durations
- browser Long Task duration
- frontend send-stage latency, local provider-session storage latency, trace-store latency, and storage file sizes
- sampled composer input latency and bounded telemetry queues so monitoring cannot grow without limit during degraded network conditions

It does not report prompts, tool arguments, model responses, user text, run IDs, or request IDs. The backend aggregates the batch in memory and emits Prometheus metrics from `GET /metrics`, so Grafana reads the same backend scrape target as the rest of the observability stack. The old user-facing Agent performance page is not required for normal users.

## Useful Queries

```promql
sum(rate(movscript_http_requests_total[5m])) by (route, status_class)
histogram_quantile(0.95, sum(rate(movscript_http_request_duration_milliseconds_bucket[5m])) by (le, route))
sum(rate(movscript_shot_vector_operations_total[5m])) by (operation, status)
sum(rate(movscript_shot_vector_documents_processed_total[5m])) by (operation)
sum(rate(movscript_db_query_duration_milliseconds_sum[5m])) by (operation, status)
  / sum(rate(movscript_db_query_duration_milliseconds_count[5m])) by (operation, status)
sum(rate(movscript_object_storage_operation_duration_milliseconds_sum[5m])) by (backend, operation, status)
  / sum(rate(movscript_object_storage_operation_duration_milliseconds_count[5m])) by (backend, operation, status)
sum(rate(movscript_agent_client_operations_total[5m])) by (kind, status)
sum(rate(movscript_agent_client_telemetry_batches_total[5m])) by (status)
sum(rate(movscript_agent_client_telemetry_samples_total[5m])) by (status)
sum(rate(movscript_agent_client_metric_milliseconds_sum{metric="frontend_agent_network_request_duration_ms"}[5m])) by (route_group, status_class)
  / sum(rate(movscript_agent_client_metric_milliseconds_count{metric="frontend_agent_network_request_duration_ms"}[5m])) by (route_group, status_class)
sum(rate(movscript_agent_client_metric_milliseconds_sum{metric="frontend_agent_send_stage_latency_ms"}[5m])) by (component, kind, stage, status)
  / sum(rate(movscript_agent_client_metric_milliseconds_count{metric="frontend_agent_send_stage_latency_ms"}[5m])) by (component, kind, stage, status)
sum(rate(movscript_agent_client_metric_milliseconds_sum{metric=~"frontend_agent_composer_(input_latency|serialize)_ms"}[5m])) by (metric, kind, stage)
  / sum(rate(movscript_agent_client_metric_milliseconds_count{metric=~"frontend_agent_composer_(input_latency|serialize)_ms"}[5m])) by (metric, kind, stage)
max(movscript_agent_client_metric_milliseconds_max{metric=~"frontend_web_vital_.*_ms"}) by (metric, vital)
max(movscript_agent_client_metric_score_max{metric="frontend_web_vital_cls_score"}) by (metric, vital)
sum(rate(movscript_agent_client_metric_count_total{metric="frontend_ui_errors_total"}[5m])) by (area, kind, level)
sum(rate(movscript_agent_client_metric_milliseconds_sum{metric="movscript_agent_trace_span_duration_ms"}[5m])) by (kind, status)
  / sum(rate(movscript_agent_client_metric_milliseconds_count{metric="movscript_agent_trace_span_duration_ms"}[5m])) by (kind, status)
sum(rate(movscript_agent_client_metric_milliseconds_sum{metric=~"movscript_agent_(storage_flush_duration_ms|storage_operation_duration_ms|trace_store_operation_duration_ms)"}[5m])) by (metric, component, kind, stage, status)
  / sum(rate(movscript_agent_client_metric_milliseconds_count{metric=~"movscript_agent_(storage_flush_duration_ms|storage_operation_duration_ms|trace_store_operation_duration_ms)"}[5m])) by (metric, component, kind, stage, status)
sum(rate(movscript_agent_client_slow_operations_total[5m])) by (kind, status)
sum(rate(movscript_agent_client_operation_duration_milliseconds_sum[5m])) by (kind, status)
  / sum(rate(movscript_agent_client_operation_duration_milliseconds_count[5m])) by (kind, status)
sum(rate(movscript_agent_client_operation_phase_delta_milliseconds_sum[5m])) by (kind, phase)
  / sum(rate(movscript_agent_client_operation_phase_delta_milliseconds_count[5m])) by (kind, phase)
movscript_agent_client_long_task_duration_milliseconds_max
1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)
1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
container_memory_working_set_bytes{container_label_com_docker_compose_service!=""}
```

The vector metrics are emitted around the retrieval boundary. They remain useful if the local hash embedding implementation is replaced by an external embedding model or a dedicated ANN store because the labels describe operations rather than a storage engine.
