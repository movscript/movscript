# Getting Started

[简体中文](getting-started.zh-CN.md)

This guide gets a local Movscript workspace running for development and evaluation.

## Requirements

- Go 1.25+
- Node.js 20+
- pnpm 10+
- Docker and Docker Compose

## Install Dependencies

```bash
pnpm install
```

## Choose a Runtime Mode

Movscript supports two useful local setups.

### Full Local Stack

Use PostgreSQL and MinIO when you want the setup closest to a shared backend deployment.

```bash
docker compose up -d db minio createbuckets
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
openssl rand -hex 32
```

Write the generated values into `ENCRYPTION_KEY` and `AUTH_TOKEN_SECRET` in `apps/backend/.env`.

Start the backend:

```bash
make dev-backend
```

In another terminal, start the desktop app:

```bash
cp apps/frontend/.env.example apps/frontend/.env
make dev-frontend
```

The backend health check should return a healthy response:

```bash
curl http://localhost:8765/health
```

### Local Filesystem Mode

Use SQLite and filesystem storage when you want fewer dependencies.

```bash
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
openssl rand -hex 32
```

Set these values in `apps/backend/.env`:

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

Also set `ENCRYPTION_KEY` and `AUTH_TOKEN_SECRET` to the generated values. Then run:

```bash
make dev-backend
make dev-frontend
```

## Optional Agent

The local agent is a standalone TypeScript service used by agent experiments and CLI smoke tests.

```bash
make dev-agent
```

## Common Checks

```bash
make test
make build
pnpm run typecheck
```

## Next Steps

- Read [Configuration](configuration.md) for environment variables and storage modes.
- Read [Development](development.md) before opening a pull request.
- Read [Architecture](architecture.md) for system boundaries.
- Read [Troubleshooting](troubleshooting.md) if startup fails.
