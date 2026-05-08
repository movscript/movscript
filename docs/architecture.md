# Architecture

[简体中文](architecture.zh-CN.md)

This document is the public architecture overview. For a deeper contributor map, see [../ARCHITECTURE.md](../ARCHITECTURE.md).

## System Overview

Movscript is a local-first desktop production workspace backed by a Go API server. The desktop app talks to the backend over HTTP; the backend owns relational state, media metadata, provider credentials, generation jobs, plugin manifests, and storage adapters.

```text
Electron desktop app
  -> React frontend
  -> Go Gin API
  -> PostgreSQL or SQLite
  -> MinIO/S3-compatible storage or filesystem storage
  -> AI provider adapters
  -> async generation worker

Local agent
  -> TypeScript HTTP service
  -> local threads, runs, memory, and tool metadata
  -> optional model gateway or OpenAI-compatible endpoint
```

## Main Applications

| Area | Path | Responsibility |
| --- | --- | --- |
| Backend | `apps/backend` | API server, migrations, domain services, workers, storage, AI adapters. |
| Desktop | `apps/frontend` | Electron shell and main user workspace. |
| Admin | `apps/admin` | Model, provider, capability, and operational configuration UI. |
| Agent | `apps/agent` | Local agent runtime and experiments. |
| CLI | `apps/movcli` | Plugin packaging and agent smoke tests. |
| SDK | `packages/plugin-sdk` | TypeScript plugin authoring surface. |

## Backend Layers

The backend follows pragmatic domain boundaries:

- `interfaces/http`: transport handlers, middleware, route registration.
- `app`: use cases, validation, orchestration, domain errors.
- `domain/model`: GORM persistence entities.
- `infra`: provider integrations, storage, auth, jobs, database, logging, plugin import helpers.
- `bootstrap`: application composition root.

Application packages should not depend on HTTP handlers or route registration. Infrastructure packages should implement platform capabilities rather than product workflows.

## Core Product Model

```text
Project
  ├─ Scripts
  ├─ Assets
  ├─ Episodes
  ├─ Scenes
  │   └─ Storyboards
  │       └─ Shots
  ├─ PipelineNodes and PipelineEdges
  └─ Canvases
      ├─ CanvasNodes
      ├─ CanvasEdges
      └─ CanvasRuns / CanvasTasks
```

Media files are tracked as resources and stored through the configured storage backend.

## AI and Jobs

AI model/provider configuration is managed from the admin UI. Generation requests are represented as jobs and executed asynchronously by backend worker infrastructure. Provider-specific logic belongs in `apps/backend/internal/infra/ai`, while job state, retry rules, and cancellation behavior belong in `apps/backend/internal/app/job`.

## Plugins

Plugins are described by manifests, imported through backend plugin-kit code, and surfaced in the desktop runtime. Plugin-facing contracts are still early and may change before a stable release.

## Agent

The local agent is a separate TypeScript HTTP service. It owns thread/run lifecycle, policy checks, tool metadata, local memory, and skill loading. Treat it as a separate runtime that communicates through explicit HTTP boundaries.
