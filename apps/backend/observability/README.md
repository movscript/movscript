# Movscript Backend Observability

The backend exposes Prometheus metrics at `GET /metrics`. This stack starts Prometheus and Grafana with a preloaded dashboard for HTTP traffic, shot vector operations, and Agent client performance.

## Start

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

Grafana anonymous admin access is enabled for local development. The default dashboard is provisioned under the `Movscript` folder.

## Agent Client Metrics

The desktop Agent UI reports a small, privacy-safe telemetry batch to `POST /api/v1/agent/telemetry` after authentication. The payload contains only low-cardinality performance data:

- operation kind, status, duration, and slow-operation flag
- phase names and phase durations
- browser Long Task duration
- Agent local state storage size

It does not report prompts, tool arguments, model responses, user text, run IDs, or request IDs. The backend aggregates the batch in memory and emits Prometheus metrics from `GET /metrics`, so Grafana reads the same backend scrape target as the rest of the observability stack. The old user-facing Agent performance page is not required for normal users.

## Useful Queries

```promql
sum(rate(movscript_http_requests_total[5m])) by (route, status_class)
histogram_quantile(0.95, sum(rate(movscript_http_request_duration_milliseconds_bucket[5m])) by (le, route))
sum(rate(movscript_shot_vector_operations_total[5m])) by (operation, status)
sum(rate(movscript_shot_vector_documents_processed_total[5m])) by (operation)
sum(rate(movscript_agent_client_operations_total[5m])) by (kind, status)
sum(rate(movscript_agent_client_slow_operations_total[5m])) by (kind, status)
sum(rate(movscript_agent_client_operation_duration_milliseconds_sum[5m])) by (kind, status)
  / sum(rate(movscript_agent_client_operation_duration_milliseconds_count[5m])) by (kind, status)
sum(rate(movscript_agent_client_operation_phase_delta_milliseconds_sum[5m])) by (kind, phase)
  / sum(rate(movscript_agent_client_operation_phase_delta_milliseconds_count[5m])) by (kind, phase)
movscript_agent_client_long_task_duration_milliseconds_max
movscript_agent_client_storage_bytes{kind="latest"}
```

The vector metrics are emitted around the retrieval boundary. They remain useful if the local hash embedding implementation is replaced by an external embedding model or a dedicated ANN store because the labels describe operations rather than a storage engine.
