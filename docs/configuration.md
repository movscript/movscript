# Configuration

## Backend environment variables

Copy `apps/backend/.env.example` to `apps/backend/.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port |
| `DB_USER` | Yes | PostgreSQL user |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DB_NAME` | Yes | PostgreSQL database |
| `SERVER_PORT` | Yes | Backend HTTP port |
| `ENCRYPTION_KEY` | Yes | 64-character hex key for AES-256-GCM |
| `MCP_TOKEN` | No | Bearer token required by `/mcp` when set |
| `MINIO_ENDPOINT` | Yes | MinIO or S3-compatible endpoint |
| `MINIO_ACCESS_KEY` | Yes | Object storage access key |
| `MINIO_SECRET_KEY` | Yes | Object storage secret key |
| `MINIO_BUCKET` | Yes | Object storage bucket |
| `MINIO_USE_SSL` | Yes | `true` or `false` |

Generate `ENCRYPTION_KEY` with:

```bash
openssl rand -hex 32
```

## Frontend environment variables

Copy `apps/frontend/.env.example` to `apps/frontend/.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Backend origin, without `/api/v1` |

Example:

```bash
VITE_API_BASE_URL=http://localhost:8765
```
