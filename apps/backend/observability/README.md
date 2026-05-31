# Movscript Backend Observability

The backend exposes Prometheus metrics at `GET /metrics`. This stack starts Prometheus and Grafana with a preloaded dashboard for HTTP traffic and shot vector operations.

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

## Useful Queries

```promql
sum(rate(movscript_http_requests_total[5m])) by (route, status_class)
histogram_quantile(0.95, sum(rate(movscript_http_request_duration_milliseconds_bucket[5m])) by (le, route))
sum(rate(movscript_shot_vector_operations_total[5m])) by (operation, status)
sum(rate(movscript_shot_vector_documents_processed_total[5m])) by (operation)
```

The vector metrics are emitted around the retrieval boundary. They remain useful if the local hash embedding implementation is replaced by an external embedding model or a dedicated ANN store because the labels describe operations rather than a storage engine.
