# Configuration

[简体中文](configuration.zh-CN.md)

Movscript reads backend settings from `apps/backend/.env` during local development. Copy `apps/backend/.env.example` before running the backend.

## Required Secrets

Generate independent values:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Set:

- `ENCRYPTION_KEY`: encrypts stored provider credentials.
- `AUTH_TOKEN_SECRET`: signs authentication tokens.

Do not commit `.env` files, generated keys, provider API keys, local databases, or object-storage data.

## Backend Server

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERVER_PORT` | `8765` | Backend HTTP port. |
| `MOVSCRIPT_APP_MODE` | `cloud` | Runtime mode. Use `local` for local-first SQLite/filesystem operation. |
| `MOVSCRIPT_DATA_DIR` | empty | Base directory for local runtime data. |

The frontend uses `VITE_API_BASE_URL` from `apps/frontend/.env`; the example points at `http://localhost:8765`.

## Database

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_DRIVER` | `postgres` | `postgres` or `sqlite`. |
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_USER` | `postgres` | PostgreSQL user. |
| `DB_PASSWORD` | `postgres` | PostgreSQL password. |
| `DB_NAME` | `movscript` | PostgreSQL database name. |
| `DB_PATH` | empty | SQLite database path when `DB_DRIVER=sqlite`. |

Recommended local SQLite settings:

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
```

## Storage

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE_BACKEND` | `minio` | `minio` or `filesystem`. |
| `FILESYSTEM_STORAGE_ROOT` | empty | Explicit filesystem storage path. Defaults under `MOVSCRIPT_DATA_DIR`. |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO or S3-compatible endpoint. |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key. |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key. |
| `MINIO_BUCKET` | `movscript` | Object bucket. |
| `MINIO_USE_SSL` | `false` | Use HTTPS for object storage. |

Recommended filesystem settings:

```env
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

## Local Agent and MCP-Shaped Access

`MCP_TOKEN` is optional. When set, MCP-shaped endpoints that are enabled by the runtime must require `Authorization: Bearer <MCP_TOKEN>`.

Keep local agent endpoints bound to trusted local interfaces unless they have explicit authentication.

## AI Providers

Provider credentials are managed from the admin UI and encrypted with `ENCRYPTION_KEY`. Configure different provider/model capabilities through the admin model configuration pages rather than committing credentials to source control.
