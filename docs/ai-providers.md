# AI Providers

AI provider code lives in `apps/backend/internal/ai`.

## Current adapter areas

- Anthropic
- Gemini
- Kling
- OpenAI-compatible
- Volcengine
- Dry-run provider for local testing

## Configuration flow

1. A super admin configures credentials in the admin UI.
2. Credentials are encrypted with `ENCRYPTION_KEY`.
3. Model configs are attached to credentials.
4. Feature configs select which models are available for each capability.
5. Generation jobs call the provider abstraction instead of provider-specific code.

## Development guidance

When adding a provider:

1. Implement the provider interface in `apps/backend/internal/ai`.
2. Register it in the provider registry.
3. Add validation and debug sanitization tests.
4. Document required credentials and supported capabilities.
5. Avoid logging raw API keys, signed URLs, or provider secrets.
