# Movscript

Movscript is an open-source desktop production workspace for short drama and AI-assisted video creation. It combines story planning, production assets, episode and scene breakdowns, storyboards, shots, canvas workflows, generation jobs, model administration, and plugin/agent experiments in one local-first application.

> The project is still early. APIs, plugin manifests, and agent runtime contracts may change before a stable release.

## What You Can Build With It

- Organize short-drama projects with scripts, assets, episodes, scenes, storyboards, and shots.
- Attach media resources to project entities and store files through MinIO/S3-compatible object storage.
- Configure AI credentials, model capabilities, feature routing, credit pricing, and debug calls from the admin UI.
- Run text, image, image-edit, video, image-to-video, and video-to-video generation jobs asynchronously.
- Compose reusable canvas workflows with manual media nodes, AI nodes, tool nodes, approvals, and plugin-provided nodes.
- Extend the desktop experience with local plugins and a standalone local agent runtime.

## Repository Layout

```text
movscript/
├── apps/backend/          Go API server, database models, AI adapters, job worker
├── apps/frontend/         Electron + Vite + React desktop application
├── apps/agent/            Local agent HTTP service and runtime experiments
├── apps/movcli/           CLI for plugin packaging and local agent smoke tests
├── packages/plugin-sdk/   TypeScript plugin SDK
├── packages/tokens/       Shared design tokens
├── packages/ui/           Shared React UI primitives
├── plugins/               First-party plugin examples
├── docs/                  User, operator, developer, API, plugin, and agent docs
├── memory/                Maintainer notes and design-history records
└── docker-compose.yml     Local PostgreSQL, MinIO, and backend stack
```

## Quick Start

### Requirements

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker and Docker Compose

### 1. Install Node Dependencies

```bash
pnpm install
```

### 2. Start Local Infrastructure

```bash
docker compose up -d db minio createbuckets
```

This starts PostgreSQL on `localhost:5432`, MinIO on `localhost:9000`, and the MinIO console on `localhost:9001`.

### 3. Configure the Backend

```bash
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
```

Paste the generated 64-character value into `ENCRYPTION_KEY` in `apps/backend/.env`.

### 4. Run the Backend and Frontend

```bash
make dev-backend
```

In another terminal:

```bash
cp apps/frontend/.env.example apps/frontend/.env
make dev-frontend
```

Backend health check:

```bash
curl http://localhost:8765/health
```

## Common Commands

```bash
make dev-backend          # Go API server
make dev-frontend         # Electron desktop app
make dev-agent            # Local agent server
make test                 # Backend tests + workspace typechecks
make build                # Backend, packages, apps, and plugins
pnpm run typecheck        # TypeScript typechecks where available
```

## Documentation

Start with the documentation index: [docs/README.md](docs/README.md).

Primary guides:

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Development](docs/development.md)
- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [AI providers](docs/ai-providers.md)
- [Plugins](docs/plugins.md)
- [Deployment](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)

Chinese entry point: [README.zh-CN.md](README.zh-CN.md).

## Open Source

Movscript is released under the [MIT License](LICENSE). Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
