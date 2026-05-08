# AI Providers

[简体中文](ai-providers.zh-CN.md)

Movscript routes generation work through backend AI provider adapters. The project currently includes adapter surfaces for OpenAI-compatible APIs, Anthropic, Gemini, Kling, Volcengine, and dry-run development flows.

## Where Configuration Lives

Provider credentials, model capabilities, feature routing, pricing, and debug calls are managed from the admin UI. Credentials are stored encrypted with `ENCRYPTION_KEY`.

Do not place provider API keys in source-controlled files.

## Supported Capability Areas

Movscript is designed around these generation workflows:

- Text generation.
- Image generation.
- Image editing.
- Text-to-video.
- Image-to-video.
- Video-to-video.

Individual providers and models may only support a subset of these capabilities.

## Development Dry Run

Use dry-run provider behavior when you need to test routing, job state, frontend flows, or worker behavior without spending provider credits.

## Security Notes

- Generate a unique `ENCRYPTION_KEY` for every environment.
- Rotate provider keys if `.env` files, debug logs, databases, or backups are exposed.
- Keep provider debug logs free of secrets and user-sensitive media URLs.
- Avoid sharing local object-storage buckets publicly unless the deployment explicitly requires it.

## Adding a Provider

Provider implementation usually touches:

- `apps/backend/internal/infra/ai/adapter_*.go`
- `apps/backend/internal/infra/ai/registry.go`
- Provider catalog or capability definitions.
- Admin UI provider/model configuration surfaces.
- Tests or dry-run fixtures that cover routing and error handling.

Update this page when provider setup, capabilities, or operational expectations change.
