# Troubleshooting

[简体中文](troubleshooting.zh-CN.md)

Use this page to debug common local setup issues.

## Backend Is Not Responding

Check the health endpoint:

```bash
curl http://localhost:8765/health
```

If it fails, confirm the backend is running:

```bash
make dev-backend
```

Also check that `SERVER_PORT` in `apps/backend/.env` matches `VITE_API_BASE_URL` in `apps/frontend/.env`.

## Database Connection Fails

For PostgreSQL mode, start the database:

```bash
docker compose up -d db
```

For SQLite mode, set:

```env
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
MOVSCRIPT_APP_MODE=local
```

Ensure the parent directory is writable by the current user.

## Object Storage Fails

For MinIO mode:

```bash
docker compose up -d minio createbuckets
```

Confirm the backend uses the same bucket and credentials as Docker Compose:

```env
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=movscript
MINIO_USE_SSL=false
```

For filesystem mode:

```env
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

## Missing Secret Errors

Generate values:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Set `ENCRYPTION_KEY` and `AUTH_TOKEN_SECRET` in `apps/backend/.env`.

## Frontend Cannot Reach Backend

Check `apps/frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8765
```

If you changed `SERVER_PORT`, update this value too.

## Typecheck or Build Failures

Run narrower commands to locate the failing package:

```bash
pnpm run typecheck
cd apps/backend && go test ./...
pnpm --filter movscript-frontend typecheck
```

Use `make test` before opening a pull request when possible.
