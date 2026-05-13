# Agent Visual Generation

This note records the product contract for Agent-driven image and video generation.

## Product Contract

- Image and video generation are asynchronous jobs. Creating a job is not a completed result.
- Asset candidate preparation is separate from generation execution. Asset candidate workflows may prepare prompts, references, model needs, risks, and acceptance criteria for a selected asset slot, but they must not submit image or video jobs. `visual-generation` is the built-in workflow that owns job creation and monitoring.
- The Agent must monitor generation jobs until they reach `succeeded`, `failed`, `cancelled`, or a monitoring timeout.
- Progress is surfaced as structured generation trace events and as a live chat progress card, including monitoring/update timing when trace timestamps are available.
- Monitoring emits heartbeat trace updates while long-running jobs remain active even when provider status/progress is unchanged, so the user can see that the Agent is still watching the job.
- The Agent may only claim generated media after the tool result includes an output resource or media preview.
- Final assistant messages collect generated image/video resources from tool results and generation trace events, then render them as visible media attachments.
- Generated media attachments carry the source job metadata (`jobId`, `jobType`, `status`, `stage`) when that metadata is present in trace events, and the chat renders a generated-result card with copyable resource references.
- Generation trace events also carry provider/model metadata (`providerName`, `modelDisplay`, `modelIdentifier`, `modelConfigId`) when the backend job exposes it, and the final job/result cards render those fields for auditability.
- Final assistant messages also persist a generated-job summary card and a process summary card, so `failed`, `cancelled`, `timeout`, and mixed multi-job outcomes remain visible even when no media resource was produced.
- Generation progress and job summary cards expose stable test hooks and accessible progress bars for browser-level regression coverage.
- The generated-result card provides an explicit binding action for generated resources. Users choose a production target type (`asset_slot`, `content_unit`, or `storyboard_line`), search/select a target object with manual ID fallback, preview the selected target summary, then the frontend creates a `selected` `output` resource binding through `POST /projects/:id/resource-bindings`.
- Stopping an active Agent run should also attempt to cancel the active backend generation job.

## Runtime Flow

1. The Agent calls `movscript_list_models` for the target capability or feature.
2. The MCP tool returns resolved model capability data from the backend, including `capabilities`, `input_requirements`, `supported_params`, and `params_schema`. It also returns `model_contracts`, a compact agent-facing summary with each model's ID, capability list, input limits, parameter controls, supported parameter keys, and schema rule count.
3. The Agent calls `movscript_create_generation_job` with only parameters supported by the selected model.
4. If backend validation returns a structured `suggested_fix`, the Agent may retry `movscript_create_generation_job` once with that fix applied. Only generation parameter fixes are applied automatically; write targets, resource IDs, model IDs, and approval-sensitive fields are not changed by repair.
5. The MCP tool returns a normalized job payload, `param_validation` audit data, and a `monitor` instruction for `movscript_get_generation_job`.
6. `agentGraph` runs an automatic monitor loop and emits `GenerationEvent` records when state, progress, output, or the monitor heartbeat changes.
7. `agentRuntime` persists those records as trace events.
8. `AIAgentPanel` renders progress from live trace events and resolves final media attachments and job summaries through the shared trace replay helper using run steps, live events, and persisted trace events.
9. For accepted outputs, the user can bind the generated resource to a production object from the generated-result card. The binding is explicit; the Agent does not silently write generated media into production entities.
10. Frontend trace replay helpers can summarize persisted/live generation trace events into jobs, resources, provider metadata, timing, and terminal counts for UI rendering, regression tests, and provider replay debugging.
11. Provider replay fixtures cover representative generation lifecycles (`running -> succeeded`, `failed`, `timeout`) and include sanitized provider-shaped traces for success-with-media and terminal failure. New providers must add sanitized replay traces before they are considered covered.

## Model Capability Contract

Every enabled generation model is exposed through `/models` and `movscript_list_models` as a resolved model contract. Runtime callers should treat this response as the source of truth instead of relying on provider names or hardcoded plugin fields.

`movscript_list_models` preserves the raw backend `models` array for compatibility and also exposes `model_contracts` for prompt-efficient agent planning. Agents should use `model_contracts` for quick model selection and parameter preflight, then inspect the matching raw model's `params_schema` when they need the full JSON Schema.

Models are contract-scoped, not provider-scoped. `/models` may merge provider variants only when the resolved model contract is identical; if two provider configurations share a `logical_model_id` but differ in input limits, supported parameters, or schema rules, they must be returned as separate entries with separate `model_config_id` values. Agents must choose and submit the exact `model_config_id` whose contract they used for planning. Pass `provider_variants: true` to `movscript_list_models` when provider names or provider-specific variants are needed for debugging or explicit user choice.

The static Agent tool catalog declares `movscript_list_models.outputSchema` for the same result surface. This output schema is intentionally compact: it tells the Agent which stable fields to inspect after the tool returns, especially `model_contracts[].model_config_id`, `logical_model_id`, `capabilities`, `input_requirements`, `supported_param_keys`, and `supported_params`. Runtime context building includes a short output-field summary in the system prompt, so model selection can be driven by declared result fields instead of hand-written assumptions. When changing the list-models result shape, update the backend/MCP response, static tool `outputSchema`, compact contract schema/fixture, verifier, and prompt-summary tests together.

`movscript_create_generation_job.outputSchema` is also declared in the static Agent tool catalog. Agents can rely on `status`, `job`, `jobId`, `monitor`, `output_resource`, `output_resource_id`, `media`, `param_validation`, `terminal`, and `message` as stable result fields. In particular, `monitor` points to `movscript_get_generation_job` for asynchronous follow-up, while `param_validation` exposes the same audit-version-1 fields documented below. The Electron MCP tool declaration and static Agent catalog must keep this output schema aligned so direct MCP clients and local Agent runs see the same result contract.

Required fields for agent-facing model selection:

- `capabilities`: canonical task support such as `image`, `image_edit`, `video`, `video_i2v`, or `video_v2v`.
- `model_contracts[].contract_version`: the compact contract shape version. Version `1` is defined by `docs/agent-compact-contract-v1.schema.json` and includes full compact rule objects for `conditional_enum`, `conditional_const`, and `requires_value`.
- `model_contracts[].model_config_id`: the backend model config ID to pass to `movscript_create_generation_job`.
- `model_contracts[].logical_model_id`: optional logical model grouping metadata. Do not treat this as a substitute for `model_config_id`; multiple entries may share the same logical ID while exposing different contracts.
- `input_requirements`: image/video input minimums and maximums. A max value of `-1` means unlimited.
- `supported_params`: UI-oriented parameter controls resolved from adapter defaults plus model-specific overrides.
- `model_contracts[].supported_params`: compact controls for agent planning. Each item includes the parameter `key`, and may include `label`, `type`, `options`, `default`, `min`, `max`, `step`, `conflicts_with`, `conditional_enum`, `conditional_const`, and `requires_value`. Conditional rule fields keep compact rule objects such as `{ "when_param": "draft", "when_value": true, "options": ["480p"] }`, so agents can preflight common cross-parameter constraints without parsing full JSON Schema.
- `model_contracts[].supported_param_keys`: sorted keys for fast filtering when the Agent already has candidate `extra_params`.
- `params_schema`: JSON Schema generated from `supported_params`, with `additionalProperties: false`. Cross-parameter rules are exposed through `allOf` where they can be declared from the model contract, such as `duration` conflicting with `frames`, `resolution` being restricted when `draft=true`, `return_last_frame` being forced off in draft mode, or `image_count` requiring `sequential_image_generation=auto`.
- `model_config_id`: the backend model config ID used by `movscript_create_generation_job`.

Supported `ParamDef.type` values are `select`, `number`, `boolean`, and `string`.

`ParamDef.json_schema` may add or override per-parameter JSON Schema keywords when the basic UI control fields are not expressive enough. For example, `frames` exposes the exact valid `25 + 4n` frame counts as an enum so agents can preflight the rule instead of learning it only from a backend validation error.

For `number` params, explicit zero `min` and `max` values are preserved in `supported_params`, `params_schema`, and runtime validation. `step` is optional, but when present it must be greater than zero.

`docs/agent-compact-contract-v1.fixture.json` is the shared v1 compact contract fixture. Backend preview tests, admin fallback tests, MCP summarizer tests, and `scripts/verify-agent-compact-contract.mjs` read it to prevent field-shape drift. When adding a compact contract field or changing schema merge behavior, update the schema, fixture, backend preview builder, admin type/audit surface, MCP summarizer, and focused gate in the same change. If the new field breaks existing agent semantics, create a new `contract_version` instead of silently changing v1.

Canonical parameter aliases shared by backend, admin audit, and MCP filtering are recorded in `docs/model-param-aliases.json`. Backend, admin, and MCP tests read this manifest to keep alias behavior aligned; update the manifest and focused gate together when introducing a new alias.

Canonical agent-facing artifacts for this surface are:

- `docs/agent-compact-contract-v1.schema.json` and `docs/agent-compact-contract-v1.fixture.json` for model selection and parameter preflight.
- `docs/agent-param-validation-audit-v1.schema.json` and `docs/agent-param-validation-audit-v1.fixture.json` for successful MCP filtering/audit output.
- `docs/agent-generation-validation-error-v1.schema.json` and `docs/agent-generation-validation-error-v1.fixture.json` for failed backend validation output.

Model capability resolution lives in:

- `apps/backend/internal/infra/ai/catalog.go` for adapter defaults, `ModelDef`, and `ModelParamProfile`.
- `apps/backend/internal/infra/ai/param_schema.go` for `ParamDef` to JSON Schema conversion.
- `apps/backend/internal/infra/ai/service.go` for `PublicModel` response assembly.

## Validation And Repair

Generation requests are preflighted before a backend job is created. The backend validates:

- task capability against the selected model;
- required image/video inputs and model input limits;
- model-supported parameter keys;
- parameter types, enum options, numeric ranges, and integer requirements;
- declared cross-parameter rules from the model contract, such as conflicts, conditional enum/const restrictions, and dependent required values;
- backend-only cross-parameter rules that are not yet declarative.

Structured validation errors use this shape:

```json
{
  "error": "parameter \"duration\" must be one of [5, 10]",
  "code": "INVALID_PARAMETER_OPTION",
  "field": "duration",
  "allowed_values": ["5", "10"],
  "suggested_fix": { "duration": "5" },
  "details": {
    "code": "INVALID_PARAMETER_OPTION",
    "message": "parameter \"duration\" must be one of [5, 10]",
    "field": "duration",
    "allowed_values": ["5", "10"],
    "suggested_fix": { "duration": "5" }
  }
}
```

The Electron MCP bridge preserves this structure in JSON-RPC `error.data`. The local Agent recognizes backend validation errors for `movscript_create_generation_job` and performs at most one automatic retry when `suggested_fix` is present. Repair is intentionally narrow:

- `aspect_ratio` updates the top-level `aspect_ratio` argument;
- `duration` updates the top-level `duration` argument;
- `null` suggested values remove that generation parameter, which is used for deterministic conflict repairs such as dropping `frames` when `duration` and `frames` cannot be used together;
- other scalar suggested values update `extra_params`;
- non-scalar values are ignored;
- the model ID, prompt, project, resources, approval state, and output target are never modified by automatic repair;
- `UNSUPPORTED_OUTPUT_TYPE` errors identify a model/task mismatch and include `allowed_values` for the selected model's compatible capabilities. They should be explained or handled by selecting a different model contract, not by retrying the same `model_config_id`.
- `INVALID_INPUT_COUNT` errors are explainable but not automatically repairable. Do not add or act on `suggested_fix` values that would add, remove, or reorder `input_resource_ids`.

When a backend validation error is not automatically repaired, the Agent records the structured backend payload on the failed generation tool step as `errorData` instead of leaving it only inside the rendered `MCPError` string. The frontend extracts those failed-step details into `generationValidationErrors` and renders a generation validation error card with the stable `code`, `field`, `allowed_values`, `suggested_fix`, and input-count fields. This keeps failed submissions inspectable in both the chat surface and the run detail page alongside successful `param_validation` audits.

The static Agent tool contract for `movscript_create_generation_job` declares the same stable backend validation codes in `errorCodes`. Catalog tests compare that list with `docs/agent-generation-validation-error-v1.schema.json`, so adding or removing a generation validation code must update the schema, fixture, backend normalization, tool contract, and focused model capability gate together.

Input count validation errors use the same structured error envelope with input-specific details:

```json
{
  "error": "model \"Reference Image\" supports at most 4 image input(s), but 5 were provided",
  "code": "INVALID_INPUT_COUNT",
  "field": "image",
  "required_min": 1,
  "allowed_max": 4,
  "actual_count": 5,
  "details": {
    "code": "INVALID_INPUT_COUNT",
    "message": "model \"Reference Image\" supports at most 4 image input(s), but 5 were provided",
    "field": "image",
    "required_min": 1,
    "allowed_max": 4,
    "actual_count": 5
  }
}
```

The canonical backend validation error shape is documented by `docs/agent-generation-validation-error-v1.schema.json`, with examples in `docs/agent-generation-validation-error-v1.fixture.json`. The fixture includes an `UNSUPPORTED_OUTPUT_TYPE` example, typed numeric `allowed_values`, and an `INVALID_INPUT_COUNT` example without `suggested_fix`.

Successful MCP generation calls also return `param_validation` audit data. The audit includes `audit_version: 1` and records whether the selected model contract was loaded, whether the model's `params_schema` was available, how many schema cross-parameter rules were visible, the selected model's `input_requirements`, submitted image/video input counts, which `supported_params` were visible to MCP, which `extra_params` were submitted, and which unsupported top-level or extra params were dropped before the backend request. Dropped params include `drop_reasons` such as `unsupported_extra_param`, `unsupported_top_level_param`, or `parse_error` so the Agent and UI can explain the filtering instead of only listing removed keys. Supported aliases such as `ratio -> aspect_ratio` and `guidance_scale -> prompt_strength` are normalized before filtering and reported in `renamed_extra_params`. MCP also records non-blocking `preflight_errors` when submitted params clearly violate the local contract's type, option, range, or compact cross-parameter rule hints; these errors may include `allowed_values` and `suggested_fix` hints, including `null` removal hints for conflicts, for display and explanation. For reference-based generation, MCP also records `input_preflight_errors` when the submitted image/video reference count is below the selected model's minimum or above its maximum. These are explanatory audit items, not the final validation authority. Backend validation remains the source of truth and is still allowed to accept, reject, or return a `suggested_fix`. If the Agent retried with a backend `suggested_fix`, the repaired result also carries a `repair_note`, and any `param_validation.preflight_errors` or `param_validation.input_preflight_errors` on that repaired result must remain available for audit rather than being hidden by the retry path. The frontend extracts these fields as `generationParamAudits[].repairNote` and `generationParamAudits[].preflightErrors`, then renders them in both the chat UI's generation parameter audit card and the run detail page's generation audit section. This audit object is part of the tool result, is extracted into assistant message metadata as `generationParamAudits`, and is rendered even when no validation error occurs.

The canonical audit shape is documented by `docs/agent-param-validation-audit-v1.schema.json`, with an example in `docs/agent-param-validation-audit-v1.fixture.json`. The fixture intentionally includes alias rewriting, dropped top-level and extra params, local `preflight_errors`, `allowed_values`, `suggested_fix: null`, input requirements, submitted input counts, and an input-count preflight warning so agent integrations have a stable reference for display and repair explanations. `scripts/verify-agent-compact-contract.mjs` validates both the compact model contract fixture and this audit fixture.

Implementation points:

- Backend structured errors: `apps/backend/internal/infra/ai/validation_error.go`.
- HTTP expansion: `apps/backend/internal/interfaces/http/handler/job_create.go`.
- MCP preservation: `apps/frontend/electron/mcp/server.ts`.
- Agent repair retry: `apps/agent/src/orchestration/toolExecutor.ts`.

## Plugin Contract

The plugin SDK exposes `generateMedia()` for image and video generation:

- Image jobs: `image`, `image_edit`.
- Video jobs: `video`, `video_i2v`, `video_v2v`.
- `generateImage()` remains available for compatibility, but new plugins should call `generateMedia()`.

First-party plugins:

- `plugins/image-generator`
- `plugins/video-generator`

`movcli build` must preserve plugin `contributes` metadata so installed plugins keep their canvas node definitions.

Plugin `inputSchema` may expose common controls, but model-specific parameter truth comes from `mov.models(capability)` / `movscript_list_models`. New plugins should avoid hardcoding provider-specific parameter assumptions without checking the selected model's resolved `supported_params`.

## Developer Checklist

When adding or changing a model/provider:

1. Add or update adapter defaults in `AdapterDefs.ParamSets`.
2. Use `CustomSupportedParams` / `ModelParamProfile` for model-specific allow, deny, override, or add behavior.
3. If a model preset carries model-specific controls, set `ModelDef.SupportedParams` with canonical parameter keys so `/admin/model-presets` can pre-fill `custom_supported_params` instead of silently inheriting broad adapter defaults.
4. Keep input requirements explicit: `image_edit` and `video_i2v` require at least one image input, `video_v2v` requires at least one video input, while plain `image` models with `MaxInputImages > 0` expose optional reference images with `min: 0`. Mixed-capability models must keep the stricter required input minimum so agents do not submit edit/i2v jobs without references.
5. For video presets, keep the `duration` control aligned with `DefaultDurSec` and `MaxDurSec`: the options must include both values and must not expose durations above the runtime maximum. `TestVideoModelPresetsExposeDurationContractMatchingRuntimeLimits` enforces this because Agents rely on the contract before job creation.
6. Keep preset defaults runnable as submitted generation parameters. `TestVisualModelPresetDefaultsValidateAsAgentSubmittedParams` sends each visual preset's defaults through the same top-level `aspect_ratio`/`duration` plus `extra_params` split an Agent uses, then validates them with `ValidateGenerationParams`.
7. Keep profile `override` entries keyed by the parameter they modify; an inner `key` is optional, but when present it must match the override map key. Use `add` only for new parameters, not for duplicates or for changing existing adapter/override parameters.
8. Use `POST /admin/model-configs/preview-contract` or the admin UI backend preview to confirm the backend resolver returns the intended `supported_params`, `params_schema`, schema rule count, and v1 `agent_contract` before saving. The preview `agent_contract` is the compact shape admins can copy for agent prompt/debugging work, including `supported_param_keys`, compact parameter controls, schema-derived enum/description hints, and compact cross-parameter rules.
9. Confirm invalid `CustomSupportedParams` cannot be saved; admin model configs reject malformed JSON, non-object legacy `ParamDef[]` items, malformed or unknown profile/parameter/rule fields, profile override key mismatches, explicit `null` in parameter or nested rule fields, malformed scalar fields such as non-string `key`/`label`/`type` or non-number `min`/`max`/`step`, malformed array fields such as non-string `options`/`conflicts_with` items or non-object rule items, malformed nested rule fields such as non-string `when_param`/`param` or non-string `conditional_enum[].options` items, duplicate keys, bad control shapes, invalid `json_schema` keywords such as a non-scalar `enum` item, invalid default values, and cross-parameter rules that reference unknown params or illegal rule values. API clients should see `code: "INVALID_MODEL_CONFIG"` for these model-config errors.
10. Confirm `/models?capability=<capability>` exposes accurate `supported_params`, `params_schema`, and `input_requirements`.
11. If multiple provider configs share a logical model ID, confirm only identical contracts merge. Any difference in input requirements, supported parameters, or schema rules must remain visible as separate model entries so Agents do not plan against one contract and submit another `model_config_id`.
12. Add backend validator tests for new parameter types, enum options, aliases, and cross-parameter rules.
13. Add or update MCP/Agent tests if the new rule should produce a structured `suggested_fix`.
14. Add sanitized provider replay fixtures when provider status/progress or output shape changes.
15. Run the verification commands for this area before shipping.

When adding a compact contract field, audit field, or generation validation error code:

1. Update the canonical schema and fixture under `docs/agent-*-v1.*`.
2. Update backend validation or contract assembly, including structured `ValidationError` details when the change affects failures.
3. Update MCP normalization/audit extraction so JSON-RPC success and error paths preserve the new field.
4. Update the Agent tool contract, repair whitelist, and visual-generation instruction when the change affects error handling or model selection.
5. Update frontend extraction/rendering if the value should be visible in chat, run detail, or debug surfaces.
6. Extend focused tests and `scripts/verify-agent-compact-contract.mjs` so docs, schema, fixtures, tool metadata, and runtime behavior cannot drift.

When adding or changing stable tool result fields:

1. Update the runtime MCP result shape and the Electron MCP `outputSchema`.
2. Update the static Agent catalog `outputSchema`.
3. Update prompt-summary tests if the field should be visible to the model before tool use.
4. Update the verifier and MCP/catalog tests so static and runtime tool declarations stay aligned.

## Verification

Focused checks for model capability contracts, admin validation, and MCP contract exposure:

- `pnpm run test:model-capability-contract`

Expanded commands for local debugging:

- `cd apps/backend && GOCACHE=/private/tmp/movscript-go-cache go test ./internal/infra/ai ./internal/app/aiadmin ./internal/interfaces/http/handler`
- `pnpm --filter movscript-admin test -- modelParamContract`
- `pnpm --filter movscript-admin typecheck`
- `pnpm --filter movscript-frontend test:generation-contract`
- `pnpm --filter movscript-agent test:generation-repair`

Planner/subagent suites and whole-app frontend typecheck are intentionally outside this focused gate; failures there should not block model capability contract changes unless the change also touches planner/subagent behavior or shared frontend types.

Broader generation checks for full release qualification:

- `pnpm --filter movscript-agent test`
- `pnpm --filter movscript-agent typecheck`
- `pnpm --filter movscript-frontend test`
- `pnpm --filter movscript-frontend test:generation-replay`
- `pnpm --filter movscript-frontend test:generation-ui`
- `pnpm --filter movscript-frontend test:generation-e2e`
- `pnpm --filter movscript-frontend test:generation-electron`
- `pnpm --filter movscript-frontend typecheck`
- `pnpm --filter @movscript/plugin-sdk build`
- `pnpm --filter movcli build`
- `pnpm run build:plugins`

Agent tests cover successful generation monitoring, failed jobs, cancelled jobs, timeout monitoring, generation inspection policy, and cancellation approval policy.
Frontend/Electron tests cover MCP generation job normalization, provider progress/stage variants, generated media/resource extraction, async job progress consolidation, generation trace replay summaries and fixtures, generation monitoring timestamps, generation display view models, UI contract hooks/progressbar accessibility, provider/model metadata mapping for generated result cards, generated-result binding target lookup helpers, backend validation error parsing, browser-level rendering for generation progress, final media cards, binding success, and binding validation errors. The Playwright suite also includes an Electron renderer smoke test that loads the same generation harness inside an Electron window.

Provider traces can be sanitized before committing with:

```bash
node scripts/sanitize-generation-trace.mjs raw-generation-trace.json sanitized-generation-trace.json
```

The sanitized output is intended to be reviewed and then folded into `apps/frontend/src/lib/agentGenerationTraceFixtures.ts`. Provider fixtures are also checked for unsafe strings: real external URLs, email addresses, token-like values in free-text fields, non-redacted `direct_url`, and non-redacted `storage_key` values fail `test:generation-replay`.

The Playwright Electron suite also covers a seeded project-workspace review journey so the desktop shell exercises both generation monitoring and proposal review in a realistic app flow.
