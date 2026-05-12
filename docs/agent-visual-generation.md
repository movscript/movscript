# Agent Visual Generation

This note records the product contract for Agent-driven image and video generation.

## Product Contract

- Image and video generation are asynchronous jobs. Creating a job is not a completed result.
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

Required fields for agent-facing model selection:

- `capabilities`: canonical task support such as `image`, `image_edit`, `video`, `video_i2v`, or `video_v2v`.
- `model_contracts[].model_config_id`: the backend model config ID to pass to `movscript_create_generation_job`.
- `input_requirements`: image/video input minimums and maximums. A max value of `-1` means unlimited.
- `supported_params`: UI-oriented parameter controls resolved from adapter defaults plus model-specific overrides.
- `model_contracts[].supported_params`: compact controls for agent planning. Each item includes the parameter `key`, and may include `label`, `type`, `options`, `default`, `min`, `max`, `step`, `conflicts_with`, `conditional_enum`, `conditional_const`, and `requires_value`. Conditional rule fields are compact reference lists; use the raw model's `params_schema` for the full rule body.
- `model_contracts[].supported_param_keys`: sorted keys for fast filtering when the Agent already has candidate `extra_params`.
- `params_schema`: JSON Schema generated from `supported_params`, with `additionalProperties: false`. Cross-parameter rules are exposed through `allOf` where they can be declared from the model contract, such as `duration` conflicting with `frames`, `resolution` being restricted when `draft=true`, `return_last_frame` being forced off in draft mode, or `image_count` requiring `sequential_image_generation=auto`.
- `model_config_id`: the backend model config ID used by `movscript_create_generation_job`.

Supported `ParamDef.type` values are `select`, `number`, `boolean`, and `string`.

`ParamDef.json_schema` may add or override per-parameter JSON Schema keywords when the basic UI control fields are not expressive enough. For example, `frames` exposes the exact valid `25 + 4n` frame counts as an enum so agents can preflight the rule instead of learning it only from a backend validation error.

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
- other scalar suggested values update `extra_params`;
- non-scalar values are ignored;
- the model ID, prompt, project, resources, approval state, and output target are never modified by automatic repair.

Successful MCP generation calls also return `param_validation` audit data. It records whether the selected model contract was loaded, whether the model's `params_schema` was available, how many schema cross-parameter rules were visible, which `supported_params` were visible to MCP, which `extra_params` were submitted, and which unsupported top-level or extra params were dropped before the backend request. If the Agent retried with a backend `suggested_fix`, the repaired result also carries a `repair_note`; the frontend extracts it as `generationParamAudits[].repairNote` and renders it in the chat UI's generation parameter audit card. This audit object is part of the tool result, is extracted into assistant message metadata as `generationParamAudits`, and is rendered even when no validation error occurs.

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
3. Use `POST /admin/model-configs/preview-contract` or the admin UI backend preview to confirm the backend resolver returns the intended `supported_params`, `params_schema`, and schema rule count before saving.
4. Confirm invalid `CustomSupportedParams` cannot be saved; admin model configs reject malformed JSON, malformed or unknown profile/parameter/rule fields, malformed array fields such as non-string `options`/`conflicts_with` items or non-object rule items, duplicate keys, bad control shapes, invalid `json_schema` keywords, invalid default values, and cross-parameter rules that reference unknown params or illegal rule values. API clients should see `code: "INVALID_MODEL_CONFIG"` for these model-config errors.
5. Confirm `/models?capability=<capability>` exposes accurate `supported_params`, `params_schema`, and `input_requirements`.
6. Add backend validator tests for new parameter types, enum options, aliases, and cross-parameter rules.
7. Add or update MCP/Agent tests if the new rule should produce a structured `suggested_fix`.
8. Add sanitized provider replay fixtures when provider status/progress or output shape changes.
9. Run the verification commands for this area before shipping.

## Verification

Focused checks for model capability contracts, admin validation, and MCP contract exposure:

- `GOCACHE=/private/tmp/movscript-go-cache go test ./internal/infra/ai ./internal/app/aiadmin ./internal/interfaces/http/handler`
- `pnpm --filter movscript-admin test`
- `pnpm --filter movscript-admin typecheck`
- `pnpm --filter movscript-frontend test:model-contract`

Planner/subagent suites are intentionally outside this focused gate; failures there should not block model capability contract changes unless the change also touches planner/subagent behavior.

Broader generation checks for full release qualification:

- `pnpm run test:agent-generation`
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
