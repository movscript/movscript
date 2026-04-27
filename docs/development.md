# Development

## Common commands

```bash
make dev-backend
make dev-frontend
make test
make build
```

## Backend

The backend is a Go API server in `backend/`.

- Entry point: `backend/cmd/server/main.go`
- Router: `backend/internal/router/router.go`
- Handlers: `backend/internal/handler/`
- Models: `backend/internal/model/`
- AI providers: `backend/internal/ai/`

Run tests:

```bash
cd backend
go test ./...
```

## Frontend

The frontend is an Electron + Vite + React application in `frontend/`.

- App shell: `frontend/src/App.tsx`
- API client: `frontend/src/lib/api.ts`
- Runtime config: `frontend/src/lib/config.ts`
- i18n setup: `frontend/src/i18n/`

Run typecheck:

```bash
cd frontend
npm run typecheck
```

## Pull request checklist

- Tests pass.
- Typecheck passes.
- Documentation is updated for setup, configuration, API, or user-facing behavior changes.
- New frontend copy has both `zh-CN` and `en-US` translations.
