# Movscript

Movscript is an open-source desktop production workspace for short drama and AI-assisted video workflows. It combines script, asset, episode, scene, storyboard, shot, resource, pipeline, canvas, and generation-job management in one Electron application.

## Highlights

- Project workspace for scripts, assets, episodes, scenes, storyboards, and shots
- AI generation tools for text, image, video, reference image, reference video, motion imitation, style transfer, multi-angle views, and brainstorming
- Provider abstraction for OpenAI-compatible, Anthropic, Gemini, Volcengine, Kling, and dry-run adapters
- Local-first desktop frontend built with Electron, Vite, React, TypeScript, Tailwind CSS, and shadcn/ui primitives
- Go API server with Gin, GORM, PostgreSQL, MinIO-compatible object storage, and MCP endpoint support
- Internationalization foundation for Simplified Chinese and English

## Quick Start

### Prerequisites

- Go 1.25+
- Node.js 20+
- Docker and Docker Compose

### Start infrastructure

```bash
docker compose up -d db minio createbuckets
```

### Configure and run the backend

```bash
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
# paste the generated value into ENCRYPTION_KEY
make dev-backend
```

The health endpoint is available at `http://localhost:8765/health`.

### Configure and run the frontend

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm install
pnpm dev:frontend
```

### Build

```bash
make build
```

### Validate

```bash
make test
```

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [AI providers](docs/ai-providers.md)
- [Internationalization](docs/internationalization.md)
- [Troubleshooting](docs/troubleshooting.md)

Chinese documentation entry: [README.zh-CN.md](README.zh-CN.md)

## Project Structure

```text
movscript/
├── apps/backend/          Go API server
├── apps/frontend/         Electron + Vite + React application
├── apps/agent/            Local agent runtime
├── apps/movcli/           MovScript CLI
├── packages/              Shared workspace packages
├── plugins/               First-party plugins
├── docs/             User, developer, and deployment documentation
└── docker-compose.yml
```

## Open Source

Movscript is released under the [MIT License](LICENSE). Contributions are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.
