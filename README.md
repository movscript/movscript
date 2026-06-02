# Movscript

[简体中文](README.zh-CN.md)

Movscript is an open-source, local-first desktop workspace for short drama production and AI-assisted video creation. It brings project planning, scripts, assets, storyboards, shots, generation jobs, model administration, plugins, and a local agent into one application.

The project is still early. APIs, plugin manifests, and agent behavior may change before a stable release.

## Repository Layout

```text
movscript/
├── apps/backend/          Go API server, database models, AI adapters, job worker
├── apps/frontend/         Electron + Vite + React desktop application
├── apps/admin/            Admin console for credentials, models, routing, and users
├── apps/agent/            Local agent service
├── apps/movcli/           CLI for plugin scaffolding and packaging
├── packages/              Shared SDKs, UI, tokens, and domain packages
├── plugins/               First-party plugin examples
├── contracts/             Machine-readable API and schema contracts
└── docker-compose.yml     Optional local PostgreSQL and MinIO services
```

## Requirements

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker and Docker Compose, only when using PostgreSQL or MinIO locally

## Run Locally

Install dependencies:

```bash
pnpm install
```

Start the local desktop app:

```bash
make dev-frontend-local
```

This mode lets Electron start the backend at `http://localhost:8766`, uses SQLite and local filesystem storage by default, and serves the admin console at:

```text
http://localhost:8766/admin
```

If you want to run the backend separately:

```bash
cp apps/backend/.env.example apps/backend/.env
docker compose up -d db
pnpm --filter movscript-backend dev
```

Then start the desktop frontend in another terminal:

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm --filter movscript-frontend dev
```

Backend health check:

```bash
curl http://localhost:8765/health
```

Start the community observability stack with the backend, Prometheus, and Grafana:

```bash
docker compose --profile observability up --build
```

Grafana is available at `http://localhost:3002` by default. Prometheus scrapes the backend `/metrics` endpoint automatically, including HTTP route metrics, shot vector metrics, Agent frontend phases, Agent network latency, Web Vitals, frontend errors, and privacy-safe telemetry ingest health. The same profile also loads Prometheus alert rules for backend availability, HTTP latency/errors, Agent telemetry rejection, Agent runtime latency/failures, frontend errors, and Web Vitals thresholds.

Start the local agent when working on agent flows:

```bash
pnpm --filter movscript-agent dev
```

## Common Commands

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter movscript-backend test
pnpm --filter "./plugins/*" build
```

## License

Movscript is licensed under the [Apache License 2.0](LICENSE).
