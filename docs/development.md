# Development

[简体中文](development.zh-CN.md)

This guide describes the contributor workflow for changing Movscript.

## Workspace

Movscript is a monorepo with Go backend services, Electron/React apps, TypeScript packages, plugins, and a local agent.

```text
apps/backend/          Go API server and worker
apps/frontend/         Electron + Vite + React desktop app
apps/admin/            Admin UI
apps/agent/            Local agent service
apps/movcli/           CLI utilities
packages/plugin-sdk/   Plugin SDK
packages/ui/           Shared UI
packages/tokens/       Shared design tokens
plugins/               First-party plugin examples
```

## Daily Commands

```bash
pnpm install
make dev-backend
make dev-frontend
make dev-agent
```

Useful checks:

```bash
make test
make build
pnpm run typecheck
cd apps/backend && go test ./...
```

## Backend Changes

- Keep HTTP handlers thin: bind input, call an application service, map errors, and return JSON.
- Register routes in `apps/backend/internal/interfaces/http/router/*_routes.go`.
- Put use cases in `apps/backend/internal/app/<domain>/`.
- Put persistence entities in `apps/backend/internal/domain/model/`.
- Keep provider integrations, storage, jobs, auth, and observability in `apps/backend/internal/infra/`.

Run backend tests after backend changes:

```bash
cd apps/backend && go test ./...
```

## Frontend Changes

- Use the shared API client from `apps/frontend/src/lib/api.ts`.
- Keep TanStack Query keys stable and invalidate the narrowest relevant key after mutations.
- Add user-facing strings to both `apps/frontend/src/i18n/locales/zh-CN.json` and `apps/frontend/src/i18n/locales/en-US.json`.
- Prefer shared components from `packages/ui` when they already fit the interaction.

Run frontend checks when available:

```bash
pnpm --filter movscript-frontend typecheck
```

## Plugin Changes

Plugin manifest parsing and import helpers live in `apps/backend/internal/infra/pluginkit`. Frontend plugin runtime surfaces live under `apps/frontend/src/pages/plugins/` and `apps/frontend/src/lib/`.

Update [Plugins](plugins.md) when plugin manifest shape, runtime capabilities, or CLI packaging behavior changes.

## API Type Generation

When API shapes change, regenerate and check frontend API types:

```bash
pnpm run generate:api-types
pnpm run check:api-types
```

## Pull Request Checklist

- Keep the change focused.
- Include validation commands in the PR description.
- Add or update tests for backend behavior, shared logic, and bug fixes.
- Update docs when setup, configuration, API behavior, release behavior, or user workflows change.
- Do not commit secrets, generated binaries, local databases, object-storage data, or provider credentials.
