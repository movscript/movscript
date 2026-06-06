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
├── apps/cli/              CLI for plugin scaffolding and packaging
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

MovScript treats the selected launch directory as the workspace root. The `.movscript/` directory inside that root is the MovScript control directory, not a generic cache folder.

```text
.movscript/
├── manifest.json          Workspace root contract
├── data/                  Database-backed project projections
├── reviews/               Preview and frontend-review evidence
├── sync/                  Projection hashes and conflict metadata
├── providers/             Provider configs, sessions, runs, and cache
├── .mova/                 Managed Mova provider home
└── .codex/                Managed Codex provider home for compatibility
```

The MovScript workspace root is the local folder selected by the desktop client or provided through `MOVSCRIPT_WORKSPACE_DIR`; `.movscript/` is its control directory. Business projections such as `production_workspace`, `setting_workspace`, `project_standards_workspace`, `content_unit_workspace`, `asset_workspace`, `project.json`, script `script.md` files, and the read-only user `projects.index.json` live under `.movscript/data`. Production-scoped projections live under `users/{userId}/projects/{projectId}/productions/{productionId}`, with content unit projections separated by `scene_moments/{sceneMomentId}/content_units/{contentUnitId}` when a single unit is targeted. Each projection has a sidecar `.meta.json` file for dirty, preview, materialized, and conflict state, plus a mirrored `.movscript/sync` record with the projection hash and latest sync state. Workspace tools operate on projection file or folder paths: `workspace_update(path)` refreshes from the backend database and overwrites local changes, `workspace_apply_review(path)` previews backend effects, and `workspace_apply(path)` submits supported writable local projection changes to the backend database. Provider sessions use the selected `.movscript/data/...` projection folder as their real `cwd` so file editing tools modify the same files that workspace apply reads. When both `path` and `cwd` are omitted, tools use the current MCP focus project/production as the default projection folder. Preview and apply evidence may be written under `.movscript/reviews`. Provider configuration, cache/run directories, and provider session indexes live under `.movscript/providers/{profile}`; older `.movscript/{profile}/config.json` files are copied forward when a profile is initialized. Provider homes such as `.movscript/.mova` and `.movscript/.codex` are app-server compatibility homes only; they do not own MovScript business files or workspace-level session indexes.

See [docs/movscript-workspace-topology.md](docs/movscript-workspace-topology.md) for the current naming and directory invariants used by the codebase. The target design for path-first provider-session editing is documented in [docs/workdir-file-projection-design.zh-CN.md](docs/workdir-file-projection-design.zh-CN.md).

The desktop UI connects to configured assistant providers. Normal development does not require starting a standalone local provider service.

## Common Commands

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter @movscript/backend test
pnpm --filter "./plugins/*" build
```

## License

Movscript is licensed under the [Apache License 2.0](LICENSE).
