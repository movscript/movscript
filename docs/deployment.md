# Deployment

Movscript can run as separate backend and desktop frontend builds. The included `docker-compose.yml` is intended for local infrastructure and backend deployment.

## Backend with Docker Compose

Create an environment file or export variables before running Compose:

```bash
export ENCRYPTION_KEY=$(openssl rand -hex 32)
docker compose up -d
```

The backend listens on `SERVER_PORT`, defaulting to `8765`.

## Frontend build

Configure the backend origin before packaging:

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm install
pnpm --filter movscript-frontend build
```

Set `VITE_API_BASE_URL` to the backend origin visible from the packaged app.

## Security notes

- Use a unique `ENCRYPTION_KEY` in every environment.
- Set `MCP_TOKEN` if `/mcp` is reachable outside trusted local networks.
- Keep PostgreSQL and MinIO behind private networking.
- Rotate provider keys if logs, `.env` files, or database backups are exposed.
