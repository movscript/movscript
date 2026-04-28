# Deployment

Movscript currently separates the backend API from the desktop frontend build. The included `docker-compose.yml` is suitable for local infrastructure and simple backend deployments, not a hardened production stack.

## Backend With Docker Compose

Set a unique encryption key before starting the backend:

```bash
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
docker compose up -d
```

Compose starts:

- PostgreSQL
- MinIO
- a bucket bootstrap job
- the Go backend on `SERVER_PORT`, default `8765`

For real deployments, override database and object-storage credentials through environment variables rather than relying on local defaults.

## Backend Binary

Build the server:

```bash
make build-backend
```

Run it with the required environment variables from [configuration.md](configuration.md):

```bash
apps/backend/bin/server
```

## Desktop Frontend

Configure the backend origin before packaging:

```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm install
pnpm --filter movscript-frontend build
```

Set `VITE_API_BASE_URL` to the backend origin visible from the packaged app. It should be an origin such as `https://api.example.com`, not a path under `/api/v1`.

## Security Notes

- Use a unique `ENCRYPTION_KEY` per environment and keep it out of source control.
- Keep PostgreSQL and object storage on private networks where possible.
- Review MinIO bucket policy before exposing media to public networks.
- Store provider API keys only through the admin credential flow.
- Avoid enabling provider debug calls outside trusted environments.
- Rotate provider credentials if `.env` files, logs, databases, or backups are exposed.

## Current Limitations

- There is no migration framework beyond GORM AutoMigrate.
- The Compose file does not configure TLS.
- The desktop app is built separately from backend deployment.
- The local agent service is not required for backend deployment.
