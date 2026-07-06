# Candidate Selection Flow

Use this when writing or selecting generated, uploaded, imported, or manually recorded outputs.

Current UI candidate and selection metadata must be written through scoped project-data: use domain candidate tools with `projectUid`/`project_uid` and runtime/app scope. Do not use top-level `movscript candidate add/select`, `MOVSCRIPT_PROJECT_ID=...`, or `/api/v1/projects/:id/decisions` as a fallback. If the scoped decisionStore is unavailable, diagnose projectUid, scope, auth, and runtime context, then stop instead of writing legacy project decisions.

For internal output-task image/video generation, do not start from a raw generated resource and then manually write a candidate. Edit the output task `edit_prompt` with semantic refs, call `domain_build_content_unit_backend_prompt` to verify that refs compile to selected resources without blockers, summarize the full generation context, ask for explicit user confirmation, then call `generation_submit` with `scope: "content_unit"` and poll `generation_job_get`. Successful terminal polls automatically create or refresh backend content candidates. Every generation task requires this context-confirmation gate, including image, video, asset, 分镜图, 关键帧, free-scope, and audio generation.

When one generated thing should use another generated thing, keep the source prompt semantic. Use prompt refs such as `{{asset::hero_base}}`, `{{storyboard::opening_panel}}`, `{{keyframe::shot_start}}`, `{{audio_cue::phone_vibration}}`, `{{content_unit::cu_ref}}`, `{{candidate::candidate_id}}`, or `{{resource::123}}`. Prompt compilation resolves selected backend candidates into resource mentions such as `@[resource:123]`; legacy `[[resource::123]]` resource mentions are also recognized. If an upstream asset/storyboard/keyframe/audio cue has candidates but no selected/adopted resource, generation should stop with prompt blockers. The normal next action is to recommend adoption/selection of an existing candidate, not to continue downstream. Continue only if the user explicitly asks for an unstable draft.

## Resource Preservation vs Candidate Decision

Resource persistence comes before candidate judgment. Every materializable generated, uploaded, imported, transformed, rendered, or external artifact should already be a MovScript RawResource before it is judged useful, registered as a candidate, rejected, deferred, or adopted. The RawResource/candidate should also be discoverable later by title, purpose, placement, status, version, and provenance when the path supports it.

Do not use creative quality, user dissatisfaction, duplicate-looking variants, temporary drafts, or "not selected" as a reason to skip RawResource upload. Candidate decisions only control stable project dependency state:

- `adopt` selects the option as the stable output/reference.
- `reject` records that the option should not be used now; it does not delete or hide the RawResource.
- `defer` keeps the option available without making it stable.

## Choose the Path

- Generate candidate: edit the saved prompt for the internal output task, compile it with `domain_build_content_unit_backend_prompt`, summarize full generation context, ask for explicit user confirmation, call `generation_submit` with `scope: "content_unit"`, then poll `generation_job_get`. The monitor creates/refreshed candidates automatically on success and does not auto-select.
- Register existing RawResource: use `domain_register_raw_resource_as_content_unit_candidate` when upload, transform, import, editing export, or low-level generation already produced the RawResource and it should become a generated option for the target 内容制作任务.
- Create rich manual candidate: use `domain_create_content_candidate` or batch when the candidate needs a custom outputs array, producer, or prompt snapshot.
- Choose an existing candidate: use `domain_decide_content_unit_candidate` for `adopt`, `reject`, or `defer`; use selection tools only for legacy/explicit selection flows.

1. For normal internal output-task image or video generation, edit/compile the saved prompt, report readiness and full generation context, ask for explicit user confirmation, submit the generation tool call, and poll the matching job tool until terminal. On success, the backend monitor creates or refreshes the candidate automatically.
2. For existing RawResources from upload, transform, import, editing export, or low-level generation, find the target 内容制作任务 (`content_unit`) and read or derive its artifact bundle.
3. Register existing RawResources with `domain_register_raw_resource_as_content_unit_candidate` unless a richer manual candidate payload is needed. Preserve user-readable name, purpose, version/status, prompt snapshot, source refs, and producer/tool provenance when available.
4. Do not select automatically. Ask for or wait for a user/workflow decision when the candidate is meant to affect stable state.
5. Prefer `domain_decide_content_unit_candidate` for user-facing candidate choices:
   - `decision: "adopt"` for 采纳. This selects the candidate/resource as stable output/reference.
   - `decision: "reject"` for 放弃. This records the candidate as rejected without selecting it, but the RawResource remains discoverable; preserve the reason when known, such as identity drift, wrong camera, weak emotion, or style mismatch.
   - `decision: "defer"` for 待定. This keeps the candidate available without selecting it; preserve what it might still be useful for when known.
6. Use `domain_select_content_unit_candidate` or its batch variant only for legacy or explicitly confirmed selection flows that do not need reject/defer status.
7. Run `domain_inspect` or `domain_review`.
8. Run `domain_interpret` when downstream artifact tools need refreshed backend candidate/decision/selection metadata.
9. Run `domain_regeneration_plan` when selected outputs may affect downstream content.

Inline candidate APIs are compatibility paths for legacy asset/keyframe/source-entity candidate workflows. Prefer 内容制作任务 candidates for system primitive outputs. For normal asset generation, use an `asset_ref` 内容制作任务; do not write new candidates or selections into `asset.json`.

Do not manually call `domain_create_content_candidate` after `generation_submit` `content_unit` image/video jobs; the 内容制作任务 generation monitor owns candidate creation.

Terms are strict: RawResource is the media/resource body, candidate is the generated-option record attached to a 内容制作任务, selection is the current stable chosen candidate/resource, and adoption is the user/workflow action that writes selection. Candidate decisions are not Resource-retention decisions.

Valid content-candidate status values are `queued`, `running`, `succeeded`, `failed`, `canceled`, and `imported`. Do not pass `completed`, `ready`, `done`, `selected`, or `accepted`.

## Dependency Gate

A candidate is not a stable dependency until adopted/selected.

Before generating a downstream 内容制作任务:

- read the dependency report and selection validity for relevant upstream 内容制作任务,
- confirm required upstream candidates have adopted/selected outputs,
- stop if a required upstream 内容制作任务 has no selected candidate/resource,
- if candidates exist but none is selected, summarize the choices and ask the user to adopt/select one before continuing,
- continue without selection only if the user explicitly asks for an unstable draft path.

When using an unstable draft path, state that downstream outputs may not be continuity-safe and may not be tracked as stable dependencies.
