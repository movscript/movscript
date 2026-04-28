# Development

## Common commands

```bash
make dev-backend
make dev-frontend
make test
make build
```

## Backend

The backend is a Go API server in `apps/backend/`.

- Entry point: `apps/backend/cmd/server/main.go`
- Router: `apps/backend/internal/router/router.go`
- Handlers: `apps/backend/internal/handler/`
- Models: `apps/backend/internal/model/`
- AI providers: `apps/backend/internal/ai/`

Run tests:

```bash
cd apps/backend
go test ./...
```

## Frontend

The frontend is an Electron + Vite + React application in `apps/frontend/`.

- App shell: `apps/frontend/src/App.tsx`
- API client: `apps/frontend/src/lib/api.ts`
- Runtime config: `apps/frontend/src/lib/config.ts`
- i18n setup: `apps/frontend/src/i18n/`

Run typecheck:

```bash
pnpm --filter movscript-frontend typecheck
```

## Pull request checklist

- Tests pass.
- Typecheck passes.
- Documentation is updated for setup, configuration, API, or user-facing behavior changes.
- New frontend copy has both `zh-CN` and `en-US` translations.
