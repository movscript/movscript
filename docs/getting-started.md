# Getting Started

This guide starts Movscript in local development mode.

## Requirements

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker and Docker Compose

## 1. Install Dependencies

```bash
pnpm install
```

## 2. Start PostgreSQL and MinIO

```bash
docker compose up -d db minio createbuckets
```

Default local services:

| Service | URL |
| --- | --- |
| PostgreSQL | `localhost:5432` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

The default MinIO credentials are `minioadmin` / `minioadmin`.

## 3. Configure the Backend

```bash
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
```

Copy the generated 64-character hex string into `ENCRYPTION_KEY` in `apps/backend/.env`.

For the Compose services above, the other defaults in `apps/backend/.env.example` work as-is.

## 4. Run the Backend

```bash
make dev-backend
```

Verify the server:

```bash
curl http://localhost:8765/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## 5. Run the Frontend

```bash
cp apps/frontend/.env.example apps/frontend/.env
make dev-frontend
```

`VITE_API_BASE_URL` should point at the backend origin, for example `http://localhost:8765`.

## 6. Optional Local Agent

The local agent is a separate HTTP service:

```bash
make dev-agent
```

Default endpoint:

```text
http://127.0.0.1:28765
```

See [agent/README.md](agent/README.md) for runtime and API details.

## 7. Validate the Workspace

```bash
make test
make build
```

If these fail, check [troubleshooting.md](troubleshooting.md) first.
