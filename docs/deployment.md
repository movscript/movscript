# Deployment

[简体中文](deployment.zh-CN.md)

Movscript can run as a local desktop app with a local backend, or with separately managed backend infrastructure for development and evaluation.

## Local Desktop Packaging

Desktop packaging scripts are defined in the root `package.json`:

```bash
pnpm run package:desktop
pnpm run package:desktop:mac
pnpm run package:desktop:win
pnpm run package:desktop:win:arm64
```

Packaging builds shared packages, admin assets, backend binaries, the agent deploy bundle, and the Electron app.

## Backend Stack

The included Docker Compose file can start local infrastructure:

```bash
docker compose up -d db minio createbuckets
```

The Compose file also defines a backend service for containerized local evaluation. For production-like deployments, provide your own secrets and avoid default credentials.

## Required Production Settings

- Set unique `ENCRYPTION_KEY` and `AUTH_TOKEN_SECRET` values.
- Use strong database and object-storage credentials.
- Keep PostgreSQL, Redis, and MinIO private.
- Configure object-storage access policy deliberately.
- Protect any public backend with authentication and network controls.
- Rotate AI provider keys if logs, backups, databases, or `.env` files leak.

## Storage Choices

Use MinIO/S3-compatible storage when media should be served from object storage. Use filesystem storage for simple local-first deployments where media stays on one workstation.

See [Configuration](configuration.md) for the exact variables.

## Commercial Boundaries

Read [Deployment and commercial boundaries](deployment-and-commercial-boundaries.md) and [Commercial capability abstraction](commercial-capability-abstraction.md) before exposing hosted, multi-user, or commercial capabilities.
