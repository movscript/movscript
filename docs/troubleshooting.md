# Troubleshooting

## Backend exits with `ENCRYPTION_KEY must be a 64-character hex string`

Generate a key and set it in `apps/backend/.env`:

```bash
openssl rand -hex 32
```

The value must be exactly 64 hex characters.

## Backend cannot connect to PostgreSQL

Start the database:

```bash
docker compose up -d db
```

For host-side local development, `DB_HOST=localhost` and `DB_PORT=5432` should match `apps/backend/.env.example`. For a backend running inside Compose, use `DB_HOST=db`.

## Resource uploads or previews fail

Start MinIO and create the bucket:

```bash
docker compose up -d minio createbuckets
```

For host-side local development:

```text
MINIO_ENDPOINT=localhost:9000
MINIO_USE_SSL=false
```

Check that `MINIO_BUCKET` matches the bucket created by Compose. The default is `movscript`.

## Frontend cannot reach backend

Check `apps/frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:8765
```

Restart the frontend dev server after changing Vite environment variables.

Verify the backend:

```bash
curl http://localhost:8765/health
```

## AI generation fails

- Confirm the current user has quota.
- Check provider credentials in the admin UI.
- Verify the model config is enabled.
- Verify the feature allows that model config.
- Confirm the selected model has the capability required by the feature.
- Check generation job details and provider debug output only in trusted environments.

## Plugin install via `movcli install` fails with 404

The CLI install command currently posts `.movpkg` files to `/api/v1/plugins/upload`, but the backend currently exposes `/api/v1/plugins` for JSON/path imports. Use the implemented import API or frontend plugin flows until the upload route is added.

## Local agent cannot read context

The agent expects an MCP-shaped desktop endpoint at:

```text
http://127.0.0.1:18765/mcp
```

Start the Electron app first, then run:

```bash
make dev-agent
curl http://127.0.0.1:28765/health
```

Override the endpoint if needed:

```bash
MOVSCRIPT_MCP_ENDPOINT=http://127.0.0.1:18765/mcp make dev-agent
```
