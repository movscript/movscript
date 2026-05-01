# Movscript Architecture Guide

This is the short orientation document for contributors. The broader architecture index is in [docs/architecture.md](docs/architecture.md).

## Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33, Electron Vite |
| Frontend | React 18, React Router v6, TanStack Query v5, Zustand, Tailwind CSS |
| Backend | Go 1.25, Gin, GORM, PostgreSQL |
| Storage | MinIO/S3-compatible object storage |
| AI | Adapter layer for OpenAI-compatible APIs, Anthropic, Gemini, Kling, Volcengine, and dry-run |
| Agent | Standalone TypeScript HTTP service using MCP-shaped client tools |
| Plugins | Backend-stored plugin manifests plus frontend/runtime plugin surfaces |

Default backend origin: `http://localhost:8765`. The frontend builds API v1 URLs from `VITE_API_BASE_URL`.

## Main Process Boundaries

```text
Electron frontend
  -> Axios client
  -> Go Gin API
  -> PostgreSQL relational state
  -> MinIO-compatible object storage for media
  -> AI provider adapters and async generation worker

Local agent server
  -> MCP-shaped endpoint exposed by the desktop side
  -> local thread/run/memory files
  -> optional Movscript model gateway or OpenAI-compatible model endpoint
```

## Directory Responsibilities

```text
apps/backend/
  cmd/server/              Backend entry point
  internal/ai/             Provider interfaces, adapters, catalogs, feature routing
  internal/config/         Environment loading
  internal/crypto/         AES-256-GCM helpers for provider credentials
  internal/db/             GORM connection and AutoMigrate
  internal/job/         Async generation state machine and worker
  internal/handler/        HTTP handlers
  internal/model/          GORM models
  internal/pluginkit/      Plugin manifest parsing and import logic
  internal/router/         Route registration
  internal/storage/        Object storage abstraction

apps/frontend/
  electron/                Electron main, preload, backend helper, MCP bridge
  src/components/          Layout, shared components, detail panels, forms
  src/i18n/                i18next setup and locale JSON files
  src/lib/                 API client, plugin bridge, config, utilities
  src/pages/               Product pages and workspaces
  src/store/               Zustand stores
  src/types/               Frontend API and domain types

apps/agent/
  src/server.ts            Local agent HTTP server
  src/runtime/             Thread/run lifecycle, planner, policy, memory, manifest logic

apps/movcli/
  src/commands/            CLI commands for plugins and local agent smoke tests
```

## Core Domain Model

```text
Project
  ├─ Scripts
  ├─ Settings
  ├─ Assets
  │   └─ AssetViews
  ├─ Episodes
  │   └─ EpisodeScene links
  ├─ Scenes
  │   └─ Storyboards
  │       └─ Shots
  ├─ PipelineNodes and PipelineEdges
  └─ Canvases
      ├─ CanvasNodes
      ├─ CanvasEdges
      └─ CanvasRuns / CanvasTasks
```

Raw media is stored as `RawResource` rows with object-storage keys and optional folder permissions.

## Key Patterns

### Backend Handlers

Handlers live in `apps/backend/internal/handler/`. Most handlers directly use `h.db` and GORM models. If you add a route, update the handler and `apps/backend/internal/router/router.go`.

### AI Routing

AI feature keys and capability constants live in `apps/backend/internal/ai/feature.go`. Admin model configuration resolves into runtime `ModelDef` values. Generation jobs go through `apps/backend/internal/job` and provider implementations in `apps/backend/internal/ai`.

### Frontend API Access

Use the shared Axios client from `apps/frontend/src/lib/api.ts`. Keep query keys stable and invalidate the narrowest relevant key after mutations.

### Frontend Workspace Pages

Entity management and creation pages are in `apps/frontend/src/pages/`. Shared creation forms, resource attachments, model selectors, and generation cards live in `apps/frontend/src/components/shared/`.

### Plugins

Plugin manifests are parsed by `apps/backend/internal/pluginkit` and stored by `/api/v1/plugins`. Frontend plugin pages and runtime helpers live in `apps/frontend/src/pages/plugins/` and `apps/frontend/src/lib/`.

### Agent Runtime

The local agent server owns thread/run lifecycle, policy checks, tool metadata, skill catalog loading, and local memory. It should be treated as an HTTP service by Electron and CLI callers.

## Where To Change Things

| Goal | Main files |
| --- | --- |
| Add or change a backend route | `apps/backend/internal/handler/*`, `apps/backend/internal/router/router.go` |
| Add a database-backed entity | `apps/backend/internal/model/*`, handler, router, frontend types |
| Add an AI provider | `apps/backend/internal/ai/adapter_*.go`, `registry.go`, catalog/debug tests |
| Change model/feature configuration | `apps/backend/internal/ai/feature.go`, `catalog.go`, admin frontend pages |
| Change generation job behavior | `apps/backend/internal/job/*`, `apps/backend/internal/ai/*` |
| Change object storage behavior | `apps/backend/internal/storage/*`, `internal/cloudup/*` |
| Change frontend API types | `apps/frontend/src/types/index.ts` |
| Change i18n copy | `apps/frontend/src/i18n/locales/*.json` |
| Change canvas behavior | `apps/frontend/src/pages/canvas/*`, `apps/backend/internal/handler/canvas*.go` |
| Change plugin manifest/runtime behavior | `apps/backend/internal/pluginkit/*`, `apps/frontend/src/lib/*Plugin*`, `docs/plugins.md` |
| Change local agent behavior | `apps/agent/src/runtime/*`, `apps/agent/src/server.ts` |
