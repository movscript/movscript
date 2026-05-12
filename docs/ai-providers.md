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

## Model Capability Contracts

Each enabled model config resolves to a provider-neutral capability contract. The runtime contract is exposed by `/models?capability=<capability>` and consumed by the Agent through `movscript_list_models`.

The resolved model response includes:

- `capabilities`: the concrete generation tasks the model supports.
- `input_requirements`: required and maximum image/video inputs for the model.
- `supported_params`: UI-oriented parameter controls for the model.
- `params_schema`: machine-readable JSON Schema generated from `supported_params`.

`movscript_list_models` also returns agent-facing `model_contracts`. In that summary, `supported_params` is a compact list of controls with `key`, and may include `label`, `type`, `options`, `default`, `min`, `max`, `step`, `conflicts_with`, `conditional_enum`, `conditional_const`, and `requires_value`. Conditional rule fields keep compact references only; agents should read the matching raw model's `params_schema` when they need the complete JSON Schema. `supported_param_keys` is provided for fast filtering of candidate `extra_params`.

Supported `ParamDef.type` values are `select`, `number`, `boolean`, and `string`.

Adapter defaults live in `apps/backend/internal/infra/ai/catalog.go`. Model-specific differences should be represented with `CustomSupportedParams` using either a full `ParamDef[]` override or a `ModelParamProfile`:

```json
{
  "allow": ["duration", "aspect_ratio", "resolution"],
  "override": {
    "duration": {
      "type": "select",
      "options": ["5", "10"],
      "default": "5"
    }
  }
}
```

Do not rely on a provider-wide assumption such as "all video models support 10 seconds" or "all image models support the same size list". The resolved model contract is the runtime source of truth.

`CustomSupportedParams` is validated before model configs are saved. Invalid JSON, unsupported parameter types, duplicate keys, select controls without options, invalid number ranges, invalid `json_schema` keywords, default values that do not match their control type/options/range/schema, and cross-parameter rules that reference unknown params or illegal rule values are rejected as bad model config input. Profile configs must also keep `allow`/`deny` as key arrays, `override` as an object keyed by parameter name, and `add` as an array of parameter definitions. Profile objects, `ParamDef` objects, and nested cross-parameter rule objects are closed shapes; unknown fields are rejected instead of being silently ignored. Array element shapes are validated too: `options` and `conflicts_with` items must be strings, and rule array items must be objects. Profile allow/deny filters prune inherited rules that point at removed params so the exported `params_schema` stays agent-safe.

The admin UI can call `POST /admin/model-configs/preview-contract` with `adapter_type`, `custom_capabilities`, and `custom_supported_params` to dry-run the backend resolver before saving. The response includes the resolved `supported_params`, generated `params_schema`, and schema rule count.

## Validation Errors

Admin model-config create/update/patch and preview endpoints return machine-readable configuration errors:

```json
{
  "code": "INVALID_MODEL_CONFIG",
  "message": "invalid ai model config: custom_supported_params.add[0]: parameter key is required",
  "error": "invalid ai model config: custom_supported_params.add[0]: parameter key is required"
}
```

Clients should branch on `code` when possible. The legacy `error` field is kept for existing callers.

Generation jobs are preflighted before a job row is created. Parameter errors should return structured details that an Agent can repair:

```json
{
  "code": "INVALID_PARAMETER_OPTION",
  "field": "duration",
  "allowed_values": ["5", "10"],
  "suggested_fix": { "duration": "5" }
}
```

Use `apps/backend/internal/infra/ai/validation_error.go` for new structured validation errors. Prefer adding `suggested_fix` only when the fix is deterministic and safe.

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
- Model parameter defaults, model-specific profiles, validation rules, and structured errors.
- Admin UI provider/model configuration surfaces.
- Tests or dry-run fixtures that cover routing and error handling.

Update this page when provider setup, capabilities, or operational expectations change.
