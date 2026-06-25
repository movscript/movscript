# MovScript Model Registry

This directory is the source of truth for admin model catalog templates.

Model catalog templates are grouped by model lab, not by provider account:

- `labs/openai.yaml`
- `labs/anthropic.yaml`
- `labs/alibaba-dashscope.yaml`
- `labs/deepseek.yaml`
- `labs/zai.yaml`
- `labs/minimax.yaml`
- `labs/seed.yaml`
- `labs/google-gemini.yaml`
- `labs/elevenlabs.yaml`
- `labs/kling.yaml`
- `labs/vidu.yaml`
- `labs/xai.yaml`

Admin provider and combo templates live beside the lab files:

- `providers.yaml`: built-in AI Account / Provider templates.
- `combo_rules.yaml`: rules for deriving combo templates from catalog templates.

In MovScript terms:

- Lab means the model creator or model family.
- Provider / AI Account means the configured calling account, endpoint, key, and base URL.
- Adapter means the backend request builder that maps MovScript canonical params to upstream API fields.

Registry YAML declares which canonical MovScript params a model template supports. It must not declare provider-native field mapping such as `aspect_ratio -> ratio`; that belongs in adapter code and adapter tests.

Admin catalog creation should filter templates by `lab`. Provider / AI Account selection happens later when binding model routes. Route bindings should persist their own `adapter_type`; the selected Provider / AI Account can provide a default, but runtime should not rely on `provider_id` alone to infer the calling protocol.

Do not add hand-written admin template lists in Go. Update these YAML files, then regenerate.

## Commands

Run from `services/data-service`:

```bash
go run ./internal/infra/ai/cmd/model-registry-generate
go run ./internal/infra/ai/cmd/model-registry-generate --check
go run ./internal/infra/ai/cmd/model-registry-audit
go test ./internal/infra/ai
```

Bootstrap from the currently compiled templates only when intentionally migrating existing Go template data:

```bash
go run ./internal/infra/ai/cmd/model-registry-generate --bootstrap-from-current
```

Normal edits should update `labs/*.yaml`, then regenerate:

```bash
go generate ./internal/infra/ai
```

Generated files:

- `../catalog_templates.generated.go`
- `../model_registry.snapshot.json`

Audit reports official-source review gaps but does not modify YAML:

```bash
go run ./internal/infra/ai/cmd/model-registry-audit --format csv
go run ./internal/infra/ai/cmd/model-registry-audit --fail-on-warning
```

## Source Status

`source.status` values:

- `verified`: parameters were manually checked against official API schema, official API reference, or official model docs.
- `needs_review`: source URL is known but parameters have not been fully reconciled.
- `deprecated`: model is retained for compatibility but the upstream source marks it deprecated or unavailable.
- `unofficial`: no official source was found; only third-party or catalog evidence exists.

Official API references, official model docs, official model-list pages, and official SSR-rendered documentation payloads are acceptable sources. Record the stable public documentation URL in `source.url`.

External catalogs such as models.dev, LiteLLM, and OpenRouter can help with audit, but they are not final truth sources for MovScript generation parameters.

Default catalog templates should only include models that are currently provable from official lab documentation, or retained deprecated templates that are explicitly marked as `deprecated`. Historical slugs, reseller-only slugs, private rollout names, and model IDs that cannot be confirmed from current official sources should be configured through AI Account model routes as provider-specific `provider_model_id` values instead of being added as MovScript public templates.
