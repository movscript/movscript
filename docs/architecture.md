# Architecture

Movscript is organized as a monorepo with a Go backend, Electron desktop frontend, local agent service, CLI, shared packages, and first-party plugin examples.

For a contributor quick map, see [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Runtime Overview

```text
Electron desktop app
  -> Vite/React renderer
  -> shared Axios API client
  -> Go Gin backend
  -> PostgreSQL for relational state
  -> MinIO/S3-compatible object storage for media
  -> AI provider adapters and async generation jobs

Optional local agent server
  -> local HTTP API on 127.0.0.1
  -> MCP-shaped desktop endpoint
  -> file-backed threads, runs, memories, tools, and skills
```

## Repository Boundaries

| Area | Responsibility |
| --- | --- |
| `apps/backend` | API routes, models, auth identity shim, AI provider integration, storage, generation jobs, plugin manifest import. |
| `apps/frontend` | Desktop shell, product pages, admin pages, plugin UI surfaces, MCP bridge, local state and API calls. |
| `apps/agent` | Standalone local agent runtime, HTTP API, planner/policy/memory layers. |
| `apps/movcli` | Plugin scaffolding/building, plugin registry commands, local agent smoke-test commands. |
| `packages/plugin-sdk` | Plugin runtime TypeScript contracts and helpers. |
| `packages/tokens` | Design token package. |
| `packages/ui` | Shared React UI primitives. |
| `plugins` | First-party plugin examples. |
| `docs` | Public and contributor documentation. |
| `memory` | Maintainer notes, decision history, implementation plans. |

## Backend Flow

1. `apps/backend/cmd/server/main.go` loads config, validates `ENCRYPTION_KEY`, connects to PostgreSQL, runs AutoMigrate, initializes object storage, and starts the router.
2. `apps/backend/internal/router/router.go` wires handlers under `/api/v1` plus OpenAI-compatible gateway routes under `/v1`.
3. Handlers in `internal/handler` use GORM models from `internal/model`.
4. Generation requests create `GenJob` records.
5. `internal/genjob` advances job state and calls `internal/ai` providers.
6. Generated media is written as `RawResource` data through the storage abstraction.

## Frontend Flow

1. Electron starts the renderer through Electron Vite.
2. React Router renders product pages from `apps/frontend/src/pages`.
3. API calls go through `apps/frontend/src/lib/api.ts`.
4. TanStack Query handles server-state fetching and invalidation.
5. Zustand stores hold selected project/user/toast state.
6. i18n strings live in `apps/frontend/src/i18n/locales`.

## AI Flow

AI capabilities are modeled with feature keys and model capabilities:

- Text: `text`, `reasoning`
- Image: `image`, `image_edit`
- Video: `video`, `video_i2v`, `video_v2v`
- Audio placeholder: `audio`

Admins configure credentials, models, prices, supported parameters, and feature routing. Runtime calls resolve a feature to allowed model configs before dispatching to provider adapters.

## Plugin Flow

Plugin manifests are imported by the backend and stored in the database. The backend exposes plugin catalogs for tools, cards, and canvas nodes. Frontend/plugin runtime code uses those catalogs to render and execute plugin surfaces.

Current backend import accepts JSON manifest data or a local path from the backend host. The CLI's package upload path is not fully wired to a backend route yet.

## Agent Flow

The local agent service is intentionally separate from the backend and frontend. It owns thread/run state, memory, tool policy, agent manifests, installed skills/tools, and the HTTP control surface. It talks to the desktop side through an MCP-shaped endpoint.

See [agent/README.md](agent/README.md) for current endpoints.
