# Configuration

Movscript uses environment files for local development. Do not commit `.env` files.

## Backend

Copy the example file:

```bash
cp apps/backend/.env.example apps/backend/.env
```

| Variable | Required | Default in code | Description |
| --- | --- | --- | --- |
| `DB_HOST` | Yes | `localhost` | PostgreSQL host. Use `db` inside Docker Compose backend containers. |
| `DB_PORT` | Yes | `5432` | PostgreSQL port. |
| `DB_USER` | Yes | `postgres` | PostgreSQL user. |
| `DB_PASSWORD` | Yes | `postgres` | PostgreSQL password. |
| `DB_NAME` | Yes | `movscript` | PostgreSQL database. |
| `SERVER_PORT` | Yes | `8765` | Backend HTTP port. |
| `ENCRYPTION_KEY` | Yes | empty | 64-character hex key used for AES-256-GCM credential encryption. |
| `MCP_TOKEN` | No | empty | Legacy setting kept in config; the backend `/mcp` endpoint is currently removed. |
| `MINIO_ENDPOINT` | Yes | `minio:9000` | MinIO or S3-compatible endpoint. Use `localhost:9000` for host-side local dev. |
| `MINIO_ACCESS_KEY` | Yes | `minioadmin` | Object storage access key. |
| `MINIO_SECRET_KEY` | Yes | `minioadmin` | Object storage secret key. |
| `MINIO_BUCKET` | Yes | `movscript` | Object storage bucket. |
| `MINIO_USE_SSL` | Yes | `false` | Set to `true` for HTTPS object storage. |
| `PLUGIN_REGISTRY_URL` | No | `https://registry.movscript.com` | Registry base URL used by `/api/v1/registry/plugins`. |

Generate `ENCRYPTION_KEY` with:

```bash
openssl rand -hex 32
```

The backend refuses to start if `ENCRYPTION_KEY` is not a valid 32-byte hex value.

## Frontend

Copy the example file:

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

| Variable | Required | Default in code | Description |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | `http://localhost:8765` | Backend origin. Do not include `/api/v1`. |

Example:

```bash
VITE_API_BASE_URL=http://localhost:8765
```

Restart the Vite/Electron dev server after changing this file.

## Agent

The local agent server is optional.

| Variable | Default | Description |
| --- | --- | --- |
| `MOVSCRIPT_AGENT_PORT` | `28765` | Local agent HTTP port. |
| `MOVSCRIPT_MCP_ENDPOINT` | `http://127.0.0.1:18765/mcp` | MCP-shaped endpoint exposed by the desktop side. |
| `MOVSCRIPT_AGENT_SKILLS_DIR` | derived from local agent state path | Directory for JSON skill metadata. |
| `MOVSCRIPT_AGENT_TOOLS_DIR` | derived from local agent state path | Directory for JSON tool metadata. |
| `MOVSCRIPT_AGENT_GATEWAY_BASE_URL` | `http://127.0.0.1:8080/v1` | Optional OpenAI-compatible gateway URL. |
| `MOVSCRIPT_AGENT_GATEWAY_MODEL` | `movscript-default-chat` | Optional model name for gateway mode. |
| `MOVSCRIPT_AGENT_GATEWAY_USER_ID` | unset | Enables current backend gateway identity shim when set. |
| `MOVSCRIPT_AGENT_OPENAI_API_KEY` | unset | Optional direct OpenAI-compatible provider key for agent chat. |
| `MOVSCRIPT_AGENT_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Direct OpenAI-compatible base URL. |
| `MOVSCRIPT_AGENT_OPENAI_MODEL` | `gpt-4o-mini` | Direct OpenAI-compatible model. |
