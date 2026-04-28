# Development

Use this guide for day-to-day local development.

## Common Commands

```bash
pnpm install
make dev-backend
make dev-frontend
make dev-agent
make test
make build
pnpm run typecheck
```

Root scripts are defined in `package.json`; make targets wrap the same commands where useful.

## Backend

Backend code lives in `apps/backend/`.

Important paths:

| Area | Path |
| --- | --- |
| Entry point | `apps/backend/cmd/server/main.go` |
| Router | `apps/backend/internal/router/router.go` |
| Handlers | `apps/backend/internal/handler/` |
| Models | `apps/backend/internal/model/` |
| AI adapters and model catalog | `apps/backend/internal/ai/` |
| Generation worker | `apps/backend/internal/genjob/` |
| Plugin manifest import | `apps/backend/internal/pluginkit/` |
| Storage abstraction | `apps/backend/internal/storage/` |

Run backend tests:

```bash
cd apps/backend
go test ./...
```

When adding a route, update `apps/backend/internal/router/router.go` and [api.md](api.md).

## Frontend

Frontend code lives in `apps/frontend/`.

Important paths:

| Area | Path |
| --- | --- |
| App shell | `apps/frontend/src/App.tsx` |
| API client | `apps/frontend/src/lib/api.ts` |
| Runtime config | `apps/frontend/src/lib/config.ts` |
| Domain/API types | `apps/frontend/src/types/index.ts` |
| i18n setup | `apps/frontend/src/i18n/` |
| Product pages | `apps/frontend/src/pages/` |
| Shared components | `apps/frontend/src/components/` |
| Electron main/preload | `apps/frontend/electron/` |

Run frontend typecheck:

```bash
pnpm --filter movscript-frontend typecheck
```

## Packages

| Package | Purpose |
| --- | --- |
| `@movscript/plugin-sdk` | TypeScript plugin runtime types and helpers. |
| `@movscript/tokens` | Shared design tokens and theme CSS. |
| `@movscript/ui` | Shared React UI primitives. |

Build all packages:

```bash
pnpm run build:packages
```

## Plugins

The first-party image generator plugin lives in `plugins/image-generator/`. Plugin packaging is handled by `apps/movcli`.

```bash
pnpm --filter @movscript/plugin-image-generator build
```

See [plugins.md](plugins.md) and [../apps/movcli/README.md](../apps/movcli/README.md).

## Agent

The local agent server lives in `apps/agent/`.

```bash
pnpm --filter movscript-agent dev
pnpm --filter movscript-agent test
```

See [agent/README.md](agent/README.md).

## Pull Request Checklist

- Run relevant tests and typechecks.
- Update docs for setup, configuration, API, plugin, agent, or user-facing behavior changes.
- Add both `zh-CN` and `en-US` locale keys for frontend copy.
- Avoid committing `.env`, local data, generated binaries, or provider secrets.
