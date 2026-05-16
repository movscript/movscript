# Development

## Common Commands

```bash
pnpm install
make dev-frontend-local
make dev-backend
make dev-frontend
make dev-agent
pnpm --filter movscript-frontend typecheck
pnpm run test:backend
```

## Code Boundaries

- `apps/frontend`: Electron + React desktop client.
- `apps/backend`: Go API, database, jobs, and AI gateway.
- `apps/admin`: Admin console.
- `apps/agent`: Local Agent service.
- `packages/*`: Shared UI, tokens, SDK, and schemas.

Keep frontend, admin, backend, and Agent boundaries explicit. Cross-boundary behavior should go through APIs, IPC, or clearly shared packages.
