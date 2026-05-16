# Getting Started

## Local Desktop Experience

1. Install dependencies:

```bash
pnpm install
```

2. Start the local desktop app:

```bash
make dev-frontend-local
```

This builds the backend and admin UI, then lets Electron host the local backend at `http://localhost:8766`. Local mode uses SQLite and filesystem storage, so Docker is optional for this path.

On first launch, choose Local Launch, create the local admin user, then open the admin console to configure provider credentials and models:

```text
http://localhost:8766/admin
```

## External Backend Development

When you need to debug the Go backend separately, use two terminals:

```bash
make dev-backend
```

In another terminal:

```bash
make dev-frontend
```

Backend health check:

```bash
curl http://localhost:8765/health
```

## Common Next Steps

- Add provider credentials and enable models in the admin console.
- Create a project and upload resources.
- Start the local Agent with `make dev-agent`.
