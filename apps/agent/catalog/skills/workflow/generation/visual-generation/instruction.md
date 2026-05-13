Goal:
Create and monitor an image or video generation job for review.

Inputs:
- Prompt, output type, model capability, reference resources, aspect ratio, duration, and model-specific parameters.
- Current project context and any user-approved generation intent.

Boundary:
- This workflow may create generation jobs only through the approval-gated generation tool.
- It may monitor and summarize jobs.
- It must not bind, accept, lock, or formally write generated media into production entities.

Allowed tools:
- Model discovery: {{tool:movscript_list_models}}
- Generation job creation: {{tool:movscript_create_generation_job}}
- Job inspection and monitoring: {{tool:movscript_get_generation_job}} {{tool:movscript_list_generation_jobs}}
- Cancellation only when explicitly requested or required by a stop/cancel flow: {{tool:movscript_cancel_generation_job}}

Process:
1. Gather the missing generation fields before creating a job.
2. Use model discovery before selecting a model or model-specific parameters. Prefer `model_contracts` for compact planning, and inspect the matching raw model `params_schema` only when the compact contract is not enough.
3. Choose `model_config_id` from the selected model contract. Do not infer support from provider names or from another model in the same provider.
4. Submit only top-level and `extra_params` values supported by the selected model's `supported_param_keys` / `supported_params`, and only submit reference resources whose image/video counts satisfy `input_requirements`. Respect enum options, numeric ranges, and compact cross-parameter rules such as conflicts, conditional enums, conditional consts, and required values.
5. Submit the job only after the approval-gated generation tool is allowed to run.
6. Monitor the job until it reaches a terminal state or monitoring timeout.
7. Report output resources and media previews only when tool results include them.

Validation:
- Do not assume a job succeeded from creation alone.
- Backend generation validation error codes: {{tool:movscript_create_generation_job.errors}}.
- Treat `param_validation` with `audit_version: 1` as the audit trail for parameter filtering and local preflight. Mention dropped parameters, alias rewrites, `preflight_errors`, or `input_preflight_errors` when they affect the user's request.
- Treat `preflight_errors` and `input_preflight_errors` as explanatory audit data, not final backend rejection.
- If backend validation returns a suggested parameter fix, apply only generation parameter repairs and never change targets, references, model ids, project ids, or approval-sensitive fields by inference. A `null` suggested value means remove that generation parameter.
- Do not auto-repair `UNSUPPORTED_OUTPUT_TYPE` or `INVALID_INPUT_COUNT` on the same request. Explain the mismatch and select a compatible model contract or ask for the correct reference inputs.

Output:
Return final job status, jobId, output resource or media preview when available, provider/model metadata when present, and a concise fit rationale.

Never:
- Never claim generated media exists before the tool result includes output media or an output resource.
- Never mark generated media as accepted, selected, bound, or locked.
