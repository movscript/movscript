<p align="center">
  <img src="assets/logo.png" alt="Movscript" width="96" />
</p>

<h1 align="center">Movscript</h1>

<p align="center">
  Local-first desktop workspace for short drama production and AI-assisted video creation.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> | English
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#features">Features</a> |
  <a href="#workspace-model">Workspace Model</a> |
  <a href="#development">Development</a> |
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20-43853d" />
  <img alt="Go" src="https://img.shields.io/badge/go-%3E%3D1.25-00add8" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-10.32.1-f69220" />
</p>

## What is Movscript?

Movscript is an open-source community edition of a desktop production workspace for creator teams. It brings project planning, scripts, assets, storyboards, shots, generation jobs, model administration, plugins, and provider-backed assistant workflows into one application.

The project is still early. APIs, plugin manifests, workspace contracts, and provider behavior may change before a stable release. Today it is best suited for local development, workflow exploration, plugin integration, and community feedback.

## Quick Start

### Requirements

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker and Docker Compose, only when using PostgreSQL, MinIO, Redis, Gitea, or the observability stack locally

### Start the desktop app

```bash
pnpm install
make dev-frontend-local
```

This recommended local mode lets Electron start the backend at `http://localhost:8766`. It uses SQLite, filesystem object storage, the local Git HTTP backend provider, local AI gateway mode, and memory cache by default.

The admin console is available from the backend:

```text
http://localhost:8766/admin
```

## Features

| Area | Community edition |
| --- | --- |
| Desktop workspace | Electron + Vite + React application for local production work |
| Backend API | Go API server, database models, AI adapters, generation jobs, and worker paths |
| Creative production model | Projects, scripts, assets, storyboards, shots, keyframes, audio cues, and content units |
| Assistant workflows | Provider-backed sessions, model routing, domain tools, resource tools, and generation tools |
| Workspace engine | Source review, interpretation, diagnostics, and deterministic read-model refresh |
| Admin console | Credentials, models, routing, users, and operational settings |
| Plugin system | First-party app-server plugin example with MCP bridge, skills, and manifests |
| Local dependencies | SQLite and filesystem storage by default; PostgreSQL, MinIO, Redis, and Gitea available for external profile testing |
| Observability | Optional Prometheus and Grafana stack with backend, frontend, provider, and Web Vitals signals |

## Repository Layout

```text
movscript/
├── apps/backend/          Go API server, database models, AI adapters, job worker
├── apps/frontend/         Electron + Vite + React desktop application
├── apps/admin/            Admin console for credentials, models, routing, and users
├── apps/cli/              Movscript command-line tool
├── packages/              Shared UI, tokens, workspace, interpreter, and domain packages
├── plugins/               First-party app-server plugin example
├── contracts/             Machine-readable API, media, agent, and telemetry contracts
├── docs/                  Architecture notes, audits, and prototypes
└── docker-compose.yml     Optional local PostgreSQL, MinIO, Redis, Gitea, Prometheus, and Grafana services
```

## Workspace Model

Movscript treats a selected local folder as the project workspace root. In Git-backed project workflows, that root is the project repository. Product state should live in source files plus structured Movscript domain APIs; generated interpreter/debug artifacts are not the source of truth.

```text
project-workspace/
├── project.json
├── project_standards.json
├── settings/
├── scripts/
├── content_units/
├── productions/
├── .movscript/
│   ├── manifest.json       Local workspace control contract
│   ├── providers/          Provider configs, sessions, runs, and cache
│   └── backend/            Local backend auth and connection config
└── .interpret/             Optional interpreter diagnostics and debug output
```

Agents and product code should use source files plus Movscript domain APIs for durable state. The `.movscript/` directory is local control state, and `.interpret/` is optional debug output that can be regenerated.

## Advanced Local Setup

### Run backend and frontend separately

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

### Dependency profiles

Local desktop startup uses `MOVSCRIPT_DEPENDENCY_PROFILE=local` by default:

| Dependency | Local profile |
| --- | --- |
| Database | SQLite |
| Object storage | Filesystem |
| Workspace backend | Local Git HTTP backend provider |
| AI gateway | Local mode |
| Cache | Memory |

Use `MOVSCRIPT_DEPENDENCY_PROFILE=external` to exercise service-backed integrations:

| Dependency | External profile |
| --- | --- |
| Database | PostgreSQL |
| Object storage | MinIO |
| Workspace backend | Gitea |
| AI gateway | new-api |
| Cache | Redis |

Individual environment variables such as `DB_DRIVER`, `STORAGE_BACKEND`, `MOVSCRIPT_WORKSPACE_STORAGE_BACKEND`, `MOVSCRIPT_AI_GATEWAY_PROVIDER`, and `CACHE_BACKEND` can still override profile defaults.

### Observability

Start the community observability stack with the backend, Prometheus, Grafana, node-exporter, and cAdvisor:

```bash
docker compose --profile observability up --build
```

Grafana is available at `http://localhost:3002` by default. Prometheus scrapes backend `/metrics`, including HTTP route metrics, shot vector metrics, assistant frontend phases, provider network latency, Web Vitals, frontend errors, and privacy-safe telemetry ingest health.

### Isolated debug workspace

When working on assistant flows, start the desktop app with an isolated debug workspace:

```bash
pnpm --filter @movscript/desktop dev:workspace
```

This stores local debug state under `.movscript-dev`. To isolate a specific run, point the app at another workspace:

```bash
MOVSCRIPT_WORKSPACE_DIR=/tmp/movscript-debug pnpm --filter @movscript/desktop dev:workspace
```

## Development

Common commands:

```bash
pnpm run test
pnpm run build
pnpm run typecheck
pnpm --filter @movscript/backend test
pnpm --filter @movscript/cli dev -- workspace review --workspace /path/to/project-repo
pnpm --filter "./plugins/*" build
```

Install the bundled app-server plugin locally:

```bash
pnpm app-server:install-plugin -- --provider mova
```

Verify app-server startup for the desktop-managed path:

```bash
pnpm --filter @movscript/desktop verify:app-server -- --provider mova
```

## Documentation

| Topic | Link |
| --- | --- |
| CLI | [apps/cli/README.md](apps/cli/README.md) |
| Workspace package | [packages/workspace/README.md](packages/workspace/README.md) |
| Engine package | [packages/engine/README.md](packages/engine/README.md) |
| Interpreter package | [packages/interpreter/README.md](packages/interpreter/README.md) |
| Prompt package | [packages/prompt/README.md](packages/prompt/README.md) |
| Decision package | [packages/decision/README.md](packages/decision/README.md) |
| App-server plugin | [plugins/movscript/README.md](plugins/movscript/README.md) |
| Observability | [apps/backend/observability/README.md](apps/backend/observability/README.md) |
| Architecture notes | [docs/](docs/) |
| Machine-readable contracts | [contracts/](contracts/) |

## Community Scope

This README describes the open-source community edition. Enterprise overlays, hosted operations, organization-specific workflows, and private deployment policy are intentionally outside this document unless they are released into the community tree.

Contributions are welcome through issues and pull requests. Useful contributions include bug reports, workflow feedback, documentation improvements, provider integrations, plugin examples, tests, and focused fixes.

## License

Movscript is licensed under the [Apache License 2.0](LICENSE).
