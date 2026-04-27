# Architecture

The detailed architecture guide is maintained in [../ARCHITECTURE.md](../ARCHITECTURE.md).

## High-level layout

```text
frontend Electron app
  -> axios client
  -> Go Gin API
  -> PostgreSQL for relational state
  -> MinIO-compatible object storage for media
  -> AI provider adapters for generation
```

## Key boundaries

- Frontend state is managed with Zustand and TanStack Query.
- Backend handlers currently operate directly on GORM models.
- AI execution is abstracted through `backend/internal/ai`.
- Async generation jobs are handled by `backend/internal/genjob`.
- The MCP endpoint is exposed at `/mcp`.
