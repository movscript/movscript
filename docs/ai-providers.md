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

`movscript_list_models` also returns agent-facing `model_contracts` with `contract_version: 1`. In that summary, `input_requirements` is required and carries image/video input minimums and maximums; `max: 0` means the model does not accept that input type, and `max: -1` means unlimited. `supported_params` is a compact list of controls with `key`, and may include `label`, `type`, `options`, `default`, `min`, `max`, `step`, `conflicts_with`, `conditional_enum`, `conditional_const`, and `requires_value`. Conditional rule fields keep compact rule objects with trigger parameters and allowed or required values; agents should read the matching raw model's `params_schema` only when they need the complete JSON Schema. `supported_param_keys` is provided for fast filtering of candidate `extra_params`.

The static Agent catalog and Electron MCP tool declarations both publish `outputSchema` for `movscript_list_models` and `movscript_create_generation_job`. `movscript_list_models.outputSchema` declares stable discovery fields such as `model_contracts[].model_config_id`, `logical_model_id`, `capabilities`, `input_requirements`, `supported_param_keys`, and `supported_params`. `movscript_create_generation_job.outputSchema` declares stable result fields such as `status`, `job`, `jobId`, `monitor`, `output_resource`, `output_resource_id`, `media`, `param_validation`, `terminal`, and `message`; `monitor` points to the follow-up job inspection tool, and `param_validation` carries the audit-version-1 fields described below. Keep runtime MCP results, Electron MCP `outputSchema`, static Agent catalog `outputSchema`, prompt-summary tests, and `scripts/verify-agent-compact-contract.mjs` aligned when these result fields change.

The compact contract v1 shape is defined by `docs/agent-compact-contract-v1.schema.json`, and its canonical example lives in `docs/agent-compact-contract-v1.fixture.json`. `scripts/verify-agent-compact-contract.mjs`, backend preview, admin fallback, and MCP tests read those artifacts, so compact contract shape changes should update them together with the focused model capability gate.

Supported `ParamDef.type` values are `select`, `number`, `boolean`, and `string`.

Adapter defaults live in `apps/backend/internal/infra/ai/catalog.go`. Model-specific differences should be represented with `CustomSupportedParams` using either a full `ParamDef[]` override or a `ModelParamProfile`. Admin model presets can also carry model-specific `supported_params`; `/admin/model-presets` returns those params with canonical keys, and choosing such a preset pre-fills `custom_supported_params` so admins can preview and save the exact model contract instead of inheriting broad adapter defaults by accident.

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

Do not rely on a provider-wide assumption such as "all video models support 10 seconds" or "all image models support the same size list". The resolved model contract is the runtime source of truth. Explicit model contracts use only their declared parameter rules at runtime; legacy provider-wide cross-parameter guards are kept only for adapter-default contracts that have not been explicitly overridden.

Parameter keys are canonicalized before validation so admin config, MCP, and backend runtime agree on the same contract. Supported aliases are listed in `docs/model-param-aliases.json`; current aliases are `ratio -> aspect_ratio`, `duration_seconds -> duration`, `size -> image_size`, `guidance_scale -> prompt_strength`, `max_images -> image_count`, `camera_fixed -> fixed_camera`, and `generate_audio -> audio`.

`CustomSupportedParams` is validated before model configs are saved. Invalid JSON, unsupported parameter types, duplicate keys, select controls without options, invalid number ranges, invalid `json_schema` keywords, default values that do not match their control type/options/range/schema, and cross-parameter rules that reference unknown params or illegal rule values are rejected as bad model config input. Number controls preserve explicit zero `min` and `max` bounds, so `max: 0` is enforced instead of being treated as "unset"; `step` must be greater than zero when provided. `json_schema.enum` must be a non-empty scalar array; object and array enum items are rejected. Legacy `ParamDef[]` values must contain only parameter definition objects. Profile configs must also keep `allow`/`deny` as key arrays, `override` as an object keyed by parameter name, and `add` as an array of parameter definitions. An `override` entry's inner `key` is optional, but when present it must match the override map key. Use `add` only for new parameters; duplicate `add` keys and `add` entries that already exist in adapter defaults or `override` are rejected. Profile objects, `ParamDef` objects, and nested cross-parameter rule objects are closed shapes; unknown fields are rejected instead of being silently ignored, and explicit `null` is rejected in parameter and nested rule fields. Scalar and array element shapes are validated too: `key`, `label`, and `type` must be strings; `min`, `max`, and `step` must be numbers; `options` and `conflicts_with` items must be strings; rule array items must be objects; and nested rule references such as `when_param`, `param`, and `conditional_enum[].options` must use the expected string or string-array shapes. Profile allow/deny filters prune inherited rules that point at removed params so the exported `params_schema` stays agent-safe.

The admin UI can call `POST /admin/model-configs/preview-contract` with `adapter_type`, `custom_capabilities`, and `custom_supported_params` to dry-run the backend resolver before saving. The response includes the resolved `supported_params`, generated `params_schema`, schema rule count, and an `agent_contract` preview with the same compact v1 shape used for agent planning. That compact preview includes required `input_requirements`, `supported_param_keys`, per-param fields such as `label`, `type`, `options`, `default`, `min`, `max`, `step`, schema-derived `enum`/`description`, and compact cross-parameter rules.

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

Use `apps/backend/internal/infra/ai/validation_error.go` for new structured validation errors. Prefer adding `suggested_fix` only when the fix is deterministic and safe. For conflicts where the safe repair is to remove a generation parameter, use `null` as the suggested value, for example `{"frames": null}`. Agents must interpret that as removing the parameter from top-level generation args or `extra_params`, not as submitting JSON `null` to the provider.

Model/task mismatches use `code: "UNSUPPORTED_OUTPUT_TYPE"` with `field: "output_type"` and typed `allowed_values` listing the selected model's supported capabilities. This is explainable and should prompt the Agent to choose a compatible model contract; it is not a `suggested_fix` retry case for the same `model_config_id`.

Input resource count failures use `code: "INVALID_INPUT_COUNT"` with `field: "image"` or `field: "video"` plus `required_min`, `allowed_max`, and `actual_count`. These errors are explainable but not automatically repairable: backend code should not attach `suggested_fix` values that add, remove, or reorder `input_resource_ids`, and Agents must not infer such changes from the count details.

The canonical backend validation error shape is documented in `docs/agent-generation-validation-error-v1.schema.json` with examples in `docs/agent-generation-validation-error-v1.fixture.json`.

MCP generation calls also attach `param_validation` audit data to successful tool results. This versioned audit includes `audit_version: 1`, submitted and dropped parameter keys, `drop_reasons`, alias rewrites in `renamed_extra_params`, selected-model `input_requirements`, submitted image/video input counts, and non-blocking `preflight_errors` for local type/option/range mismatches or compact cross-parameter rule mismatches detected from the model contract. `preflight_errors` may include `allowed_values` and `suggested_fix` hints, including `null` removal hints for conflicts, so Agent/UI surfaces can explain likely repairs before backend validation rejects the request. Reference-count mismatches are reported separately as non-blocking `input_preflight_errors` with required minimum, allowed maximum, and actual count. They remain explanatory audit items only; backend validation remains authoritative and is the only layer that should drive automatic `suggested_fix` retries. The canonical audit shape is documented in `docs/agent-param-validation-audit-v1.schema.json` with a fixture in `docs/agent-param-validation-audit-v1.fixture.json`.

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
- `pnpm run test:model-capability-contract` when capabilities, model parameters, schema rules, or generation validation behavior change.

Update this page when provider setup, capabilities, or operational expectations change.
