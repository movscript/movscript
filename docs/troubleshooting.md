# Troubleshooting

## Local Backend Fails To Start

- Confirm App Settings are set to Local Launch.
- Click Retry Start in the startup failure overlay.
- In development, use `make dev-frontend-local`; it builds the backend and admin UI before starting Electron.

## Admin Console Does Not Open

- Confirm the local backend health check works: `curl http://localhost:8766/health`.
- Confirm the admin console URL is `http://localhost:8766/admin`.
- If you use an external backend, make sure the backend can find the admin static assets.

## No Usable Model

- Open `http://localhost:8766/admin/models`.
- Add provider credentials and enable models.
- Confirm both the credential and model are enabled.
