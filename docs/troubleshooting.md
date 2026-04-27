# Troubleshooting

## Backend exits with `ENCRYPTION_KEY must be a 64-character hex string`

Generate a key and set it in `backend/.env`:

```bash
openssl rand -hex 32
```

## Frontend cannot reach backend

Check `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:8765
```

Restart the frontend dev server after changing Vite environment variables.

## PostgreSQL connection fails

Start the database:

```bash
docker compose up -d db
```

Confirm the backend `DB_*` variables match the Compose configuration.

## Resource uploads or previews fail

Start MinIO and create the bucket:

```bash
docker compose up -d minio createbuckets
```

Confirm `MINIO_ENDPOINT`, credentials, and `MINIO_BUCKET`.

## AI generation fails

- Check provider credentials in the admin UI.
- Verify the model is enabled for the requested feature.
- Enable debug mode only in trusted environments because provider request metadata can be sensitive.
