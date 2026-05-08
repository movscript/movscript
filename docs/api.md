# API Reference

[简体中文](api.zh-CN.md)

Movscript's backend exposes an HTTP API from the Go server. The default local origin is:

```text
http://localhost:8765
```

The frontend reads its backend origin from `VITE_API_BASE_URL`.

## Health Check

```bash
curl http://localhost:8765/health
```

Use this endpoint to confirm that the backend process is running before debugging frontend requests.

## API Versioning

Product APIs are expected to live under `/api/v1`. Contracts may still change while the project is early; generated frontend API types should be refreshed when request or response shapes change.

```bash
pnpm run generate:api-types
pnpm run check:api-types
```

## Authentication

The backend uses `AUTH_TOKEN_SECRET` to sign authentication tokens. Local development defaults are intended for a trusted workstation only.

Do not expose a development backend with default credentials, local databases, or object storage to the public internet.

## Error Shape

Prefer machine-readable backend errors and localized frontend display text. New API behavior should document:

- HTTP method and path.
- Required authentication and organization/project context.
- Request body and query parameters.
- Success response.
- Error codes and recovery guidance.

## Updating This Reference

When you add or change API behavior:

- Update this page with the public contract.
- Regenerate frontend API types if the OpenAPI source changes.
- Add or update backend tests for the handler/use case.
- Mention migration or compatibility concerns in the pull request.
