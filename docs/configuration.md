# Configuration

## Local Desktop Mode

`make dev-frontend-local` sets `MOVSCRIPT_BACKEND_POLICY=spawn`, so Electron starts the local backend. Default endpoints:

- API: `http://localhost:8766`
- Admin console: `http://localhost:8766/admin`

The local backend uses SQLite and filesystem storage by default.

## External Backend Mode

`make dev-frontend` connects to an external backend. The default API URL is `http://localhost:8765`. Backend environment variables are documented in `apps/backend/.env.example`.

Common local backend settings:

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

## AI Configuration

Provider credentials, enabled models, feature routing, and debug calls are configured in the admin console.
