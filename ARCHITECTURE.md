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

Local agent
  -> MCP-shaped endpoint exposed by the desktop side
  -> local thread/run/memory files
  -> optional Movscript model gateway or OpenAI-compatible model endpoint
```

## Directory Responsibilities

```text
apps/backend/
  cmd/server/              Backend entry point
  internal/bootstrap/      Composition root for config, DB, storage, auth, AI services, workers, router
  internal/app/            DDD application layer: use cases grouped by bounded context
  internal/app/dto/        Shared application DTOs; keep transport-only shapes in handlers
  internal/domain/model/   GORM persistence entities shared by application services
  internal/domain/canvasruntime/ Canvas execution value types and runtime helpers used by app/canvas
  internal/domain/workflow/ Entity workflow schema and IO helpers used by semantic/canvas apps
  internal/domain/media/   Media-domain helpers such as video normalization
  internal/infra/ai/       AI provider gateway, adapters, catalogs, feature routing, billing policy support
  internal/infra/auth/     Token and auth infrastructure
  internal/infra/config/   Environment loading
  internal/infra/crypto/   AES-256-GCM helpers for provider credentials
  internal/infra/db/       GORM connection and migration checks
  internal/infra/jobrunner/ Background job execution infrastructure for app/job
  internal/infra/storage/  Object storage abstraction
  internal/infra/cloudup/  Cloud upload adapters
  internal/infra/pluginkit/ Plugin manifest parsing and import helpers
  internal/infra/observability/ Logging, request IDs, redaction
  internal/interfaces/http/router/ Route module registration; no business rules
  internal/interfaces/http/handler/ HTTP adapters: bind requests, call app services, map errors, return JSON
  internal/interfaces/http/middleware/ HTTP middleware for identity, org context, CORS
  internal/interfaces/http/apierr/ HTTP error response helpers
  internal/interfaces/http/auditlog/ HTTP request-scoped audit writer cross-cutting adapter

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
  src/application/         Agent runtime facade and use cases
  src/orchestration/       Agent loop, prompt, context, tool execution
  src/state/               Run/thread/store/state primitives
  src/context/             Input normalization and runtime context shaping
  src/drafts/              Local draft lifecycle and apply preview
  src/memory/              Memory store and manager
  src/manifest/            Agent manifest and plugin catalog
  src/model/               Model config and router
  src/tools/               Tool registry and policy
  src/contracts/           Runtime extension contracts
  src/updates/             Update policy

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

## Creative Source and Production Graphs

Movscript treats production orchestration as linked graphs rather than one large workflow object:

```text
Creative Source Graph
  Scripts, briefs, outlines, treatments, reference boards, product specs, interview transcripts, footage, and prompt seeds.

Story Intent Graph
  Story structure, segments, scene moments, audience intent, selling points, creative references, and continuity constraints.

Production Graph
  Storyboard scripts, content units, asset bindings, generation tasks, preview timelines, and delivery versions.
```

The production graph should reference source and story-intent graph objects instead of duplicating upstream facts. The detailed boundary is recorded in [docs/script-production-graph-architecture.md](docs/script-production-graph-architecture.md).

## Key Patterns

### Backend DDD Boundaries

The backend follows a pragmatic DDD layout inside `apps/backend/internal`:

```text
Interface layer
  interfaces/http/router/ + interfaces/http/handler/ + interfaces/http/middleware/
  Converts HTTP to application calls. It should not own business workflows.

Application layer
  app/<bounded-context>/
  Owns use cases, validation, orchestration, and domain-specific errors.

Persistence model layer
  domain/model/
  Holds GORM entities. Current services use these entities directly; introduce
  separate domain entities only where persistence coupling starts to block the design.

Infrastructure/platform layer
  infra/ai/, infra/storage/, infra/db/, infra/cloudup/, infra/auth/,
  infra/jobrunner/, infra/pluginkit/, infra/observability/
  Integrates external systems, background execution, credentials, logging, and storage.

Composition layer
  bootstrap/
  Wires shared infrastructure into handlers and workers.
```

Application packages should not depend on interface packages (`interfaces/http/handler`, `interfaces/http/router`, `interfaces/http/middleware`) or on execution infrastructure that merely runs a use case. For example, `internal/app/job` owns job states, retry semantics, and cancellation rules; `internal/infra/jobrunner` owns polling, heartbeats, provider task execution, and persistence of execution progress.

Cross-cutting adapters that require HTTP context, such as `auditlog`, stay outside `app` unless they are redesigned around an application-level port. This keeps bounded contexts focused on product behavior rather than request plumbing.

### Backend Handlers

Handlers live in `apps/backend/internal/interfaces/http/handler/`. New or refactored handlers should stay thin: bind request input, call an `internal/app/<domain>` service, map domain/application errors, and return JSON. Do not add new business flows directly in handlers unless the area has not yet been migrated.

Route registration is split by module in `apps/backend/internal/interfaces/http/router/`. Add routes to the relevant `*_routes.go` file rather than growing `router.go`.

The backend is assembled by `apps/backend/internal/bootstrap`. Avoid constructing shared services such as auth token managers, AI registries, AI services, storage clients, or workers inside route registration.

### AI Routing

AI feature keys and capability constants live in `apps/backend/internal/infra/ai/feature.go`. Admin model configuration resolves into runtime `ModelDef` values. Generation job use cases go through `apps/backend/internal/app/job`, while asynchronous execution runs in `apps/backend/internal/infra/jobrunner` and provider implementations live in `apps/backend/internal/infra/ai`.

### Frontend API Access

Use the shared Axios client from `apps/frontend/src/lib/api.ts`. Keep query keys stable and invalidate the narrowest relevant key after mutations.

### Frontend Workspace Pages

Entity management and creation pages are in `apps/frontend/src/pages/`. Shared creation forms, resource attachments, model selectors, and generation cards live in `apps/frontend/src/components/shared/`.

### Plugins

Plugin manifests are parsed by `apps/backend/internal/infra/pluginkit` and stored by `/api/v1/plugins`. Frontend plugin pages and runtime helpers live in `apps/frontend/src/pages/plugins/` and `apps/frontend/src/lib/`.

### Agent

The local agent owns thread/run lifecycle, policy checks, tool metadata, skill catalog loading, and local memory. It should be treated as an HTTP service by Electron and CLI callers.

## Where To Change Things

| Goal | Main files |
| --- | --- |
| Add or change a backend route | `apps/backend/internal/interfaces/http/router/*_routes.go`, matching `internal/interfaces/http/handler/*` |
| Add a backend use case | `apps/backend/internal/app/<domain>/*`, then call it from a thin handler |
| Add a database-backed entity | `apps/backend/internal/domain/model/*`, app service, handler, router, frontend types |
| Add an AI provider | `apps/backend/internal/infra/ai/adapter_*.go`, `registry.go`, catalog/debug tests |
| Change model/feature configuration | `apps/backend/internal/infra/ai/feature.go`, `catalog.go`, admin frontend pages |
| Change generation job behavior | `apps/backend/internal/app/job/*`, `apps/backend/internal/infra/jobrunner/*`, `apps/backend/internal/infra/ai/*` |
| Change object storage behavior | `apps/backend/internal/infra/storage/*`, `internal/infra/cloudup/*` |
| Change frontend API types | `apps/frontend/src/types/index.ts` |
| Change i18n copy | `apps/frontend/src/i18n/locales/*.json` |
| Change canvas behavior | `apps/frontend/src/pages/canvas/*`, `apps/backend/internal/interfaces/http/handler/canvas*.go` |
| Change plugin manifest/runtime behavior | `apps/backend/internal/infra/pluginkit/*`, `apps/frontend/src/lib/*Plugin*`, `docs/plugins.md` |
| Change local agent behavior | `apps/agent/src/application/*`, `apps/agent/src/orchestration/*`, `apps/agent/src/state/*`, `apps/agent/src/context/*`, `apps/agent/src/drafts/*`, `apps/agent/src/memory/*`, `apps/agent/src/manifest/*`, `apps/agent/src/model/*`, `apps/agent/src/tools/*`, `apps/agent/src/contracts/*`, `apps/agent/src/updates/*`, `apps/agent/src/server.ts` |
