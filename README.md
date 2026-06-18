<p align="center">
  <img src="assets/logo.png" alt="Movscript" width="96" />
</p>

<h1 align="center">Movscript</h1>

<p align="center">
  Vibe Motion tool for AI-planned video creation and automatic editing.
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

Movscript is a Vibe Motion tool: a new way to create motion by describing intent, feeling, rhythm, and structure instead of starting from timelines and keyframes. It helps creators move from prompts, scripts, references, and creative direction to a planned, editable, previewable video workflow.

The community edition is a local-first desktop workspace for AI-planned video creation and automatic editing. It brings project planning, scripts, assets, storyboards, shots, generation jobs, model administration, plugins, and provider-backed assistant workflows into one application.

In practice, Movscript focuses on three product ideas:

- **Vibe Motion**: direct the feeling, rhythm, visual intent, and structure of a moving piece.
- **AI-planned cuts**: let AI turn scripts and references into scenes, shots, asset needs, generation tasks, and edit plans.
- **Automatic editing**: assemble generated or imported shots into a rough cut that can be reviewed, revised, and refined.

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
| Vibe Motion model | Intent, rhythm, structure, scripts, assets, storyboards, shots, keyframes, audio cues, and content units |
| AI planning | Script breakdown, shot planning, asset-gap discovery, generation task orchestration, and edit-plan handoff |
| Automatic editing | Workspace structures for rough-cut assembly, candidate review, version selection, and timeline-compatible output |
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
| AI gateway | Local mode |
| Cache | Redis |

Individual environment variables such as `DB_DRIVER`, `STORAGE_BACKEND`, `MOVSCRIPT_WORKSPACE_STORAGE_BACKEND`, and `CACHE_BACKEND` can still override profile defaults. The community edition always uses the local AI gateway; external model gateways, metering, and plan binding belong to the commercial distribution layer.

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

### One-command SDK runtimes

To start the desktop app with the Codex SDK runtime and Claude SDK runtime enabled:

```bash
pnpm run dev:sdk-runtimes
```

This command uses `.movscript-dev/.movscript` as the debug workspace and caches SDK packages under `.movscript-dev/sdk-runtimes`. By default it enables:

- `MOVSCRIPT_CODEX_RUNTIME_API=codex-sdk`
- `@openai/codex-sdk@0.141.0`
- `@anthropic-ai/claude-agent-sdk@0.3.181`

Each SDK version is prepared once and reused on later launches. Package names, versions, and the runtime cache directory can still be overridden:

```bash
MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION=0.141.0 \
MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION=0.3.181 \
MOVSCRIPT_SDK_RUNTIME_DIR=/tmp/movscript-sdk-runtimes \
pnpm run dev:sdk-runtimes
```

Packaged desktop builds bundle these SDK runtimes by default. `pnpm --filter @movscript/desktop dist` runs `scripts/prepare-sdk-runtime-seed.mjs`, prepares the SDKs under `apps/frontend/vendor/sdk-runtimes`, and electron-builder copies them into app resources. On first use, the app copies them into the user's runtime cache, so users do not need to preinstall Codex, the Claude SDK, npm, or other command-line tools.

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
| Release cleanup principles | [docs/release-cleanup-principles.zh-CN.md](docs/release-cleanup-principles.zh-CN.md) |

## Community Scope

This README describes the open-source community edition. Enterprise overlays, hosted operations, organization-specific workflows, and private deployment policy are intentionally outside this document unless they are released into the community tree.

Contributions are welcome through issues and pull requests. Useful contributions include bug reports, workflow feedback, documentation improvements, provider integrations, plugin examples, tests, and focused fixes.

## License

Movscript is licensed under the [Apache License 2.0](LICENSE).
