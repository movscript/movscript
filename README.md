# Movscript

[简体中文](README.zh-CN.md)

Movscript is an open-source, local-first desktop workspace for short drama production and AI-assisted video creation. It brings project planning, scripts, assets, storyboards, shots, generation jobs, model administration, plugins, and provider-backed assistant workflows into one application.

The project is still early. APIs, plugin manifests, and provider behavior may change before a stable release.

## Repository Layout

```text
movscript/
├── apps/backend/          Go API server, database models, AI adapters, job worker
├── apps/frontend/         Electron + Vite + React desktop application
├── apps/admin/            Admin console for credentials, models, routing, and users
├── apps/cli/              MovScript command-line tool
├── packages/              Shared UI, tokens, and domain packages
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

Local desktop startup uses the `MOVSCRIPT_DEPENDENCY_PROFILE=local` backend dependency profile: SQLite, filesystem object storage, the local Git HTTP backend provider, local AI gateway mode, and memory cache. External service mode is selected with `MOVSCRIPT_DEPENDENCY_PROFILE=external`: PostgreSQL, MinIO, Gitea, new-api, and Redis. Individual provider env vars such as `DB_DRIVER`, `STORAGE_BACKEND`, `MOVSCRIPT_WORKSPACE_STORAGE_BACKEND`, `MOVSCRIPT_AI_GATEWAY_PROVIDER`, and `CACHE_BACKEND` can still override the profile defaults.

If you want to run the backend separately:

```bash
cp apps/backend/.env.example apps/backend/.env
docker compose up -d db
pnpm --filter @movscript/backend dev
```

Then start the desktop frontend in another terminal:

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm --filter @movscript/desktop dev
```

Backend health check:

```bash
curl http://localhost:8765/health
```

Start the community observability stack with the backend, Prometheus, and Grafana:

```bash
docker compose --profile observability up --build
```

Grafana is available at `http://localhost:3002` by default. Prometheus scrapes the backend `/metrics` endpoint automatically, including HTTP route metrics, shot vector metrics, assistant frontend phases, provider network latency, Web Vitals, frontend errors, and privacy-safe telemetry ingest health. The same profile also loads Prometheus alert rules for backend availability, HTTP latency/errors, assistant telemetry rejection, provider latency/failures, frontend errors, and Web Vitals thresholds.

When working on assistant flows, start the desktop app with an isolated debug workspace:

```bash
pnpm --filter @movscript/desktop dev:workspace
```

This stores local debug state under `.movscript-dev`. To isolate a specific debugging run, point the app at another workspace:

```bash
MOVSCRIPT_WORKSPACE_DIR=/tmp/movscript-debug pnpm --filter @movscript/desktop dev:workspace
```

## Workspace Model

MovScript treats each project Git repository as the project workspace. Business source files live under `edit/`; successful interprets write the current effective state under `.interpret/`. The `.movscript/` directory inside the repo is only the local control directory for app/provider configuration and backend auth.

```text
project.json
workspace.json
edit/                       Editable business files
.interpret/
├── current/                Last successful interpreted state
├── indexes/                Derived domain indexes
├── reviews/                Review evidence
└── manifests/              Interpret manifests
.movscript/
├── manifest.json           Local workspace control contract
├── providers/              Provider configs, sessions, runs, and cache
└── backend/                Local backend auth and connection config
```

Workspace tools are `movscript_workspace_get_model`, `movscript_workspace_review`, and `movscript_workspace_interpret`. Review compares `.interpret/current` to `edit/`; interpret validates `edit/`, updates `.interpret/current`, and writes indexes/manifests. Git commit/push persists a successful interpret step in repo history.

See [docs/workspace-ontology.zh-CN.md](docs/workspace-ontology.zh-CN.md) for the current workspace ontology.

The desktop UI connects to configured assistant providers. Normal development does not require starting a standalone local provider service.

## Common Commands

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter @movscript/backend test
pnpm --filter @movscript/cli dev -- workspace review --workspace /path/to/project-repo
pnpm --filter "./plugins/*" build
```

## License

Movscript is licensed under the [Apache License 2.0](LICENSE).
