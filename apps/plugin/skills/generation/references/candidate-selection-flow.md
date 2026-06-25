# Candidate Selection Flow

Use this when writing or selecting generated, uploaded, imported, or manually recorded outputs.

For content-unit image/video generation, do not start from a raw generated resource and then manually write a candidate. Edit the content unit `edit_prompt` with semantic refs, call `domain_build_content_unit_backend_prompt` to verify that refs compile to selected resources without blockers, call `system_generate_content_unit_image` or `system_generate_content_unit_video`, then poll the matching content-unit job tool. Successful terminal polls automatically create or refresh backend content candidates.

When one generated thing should use another generated thing, keep the source prompt semantic. Use prompt refs such as `{{asset::hero_base}}`, `{{storyboard::opening_panel}}`, `{{keyframe::shot_start}}`, `{{content_unit::cu_ref}}`, `{{candidate::candidate_id}}`, or `{{resource::123}}`. Prompt compilation resolves selected backend candidates into resource mentions such as `@[resource:123]`; legacy `[[resource::123]]` resource mentions are also recognized. If an upstream asset/storyboard/keyframe has candidates but no selected/adopted resource, generation should stop with prompt blockers. The normal next action is to recommend adoption/selection of an existing candidate, not to continue downstream. Continue only if the user explicitly asks for an unstable draft.

## Choose the Path

- Generate candidate: edit the content unit prompt, compile it with `domain_build_content_unit_backend_prompt`, call `system_generate_content_unit_image` or `system_generate_content_unit_video`, then poll the matching content-unit job tool. The monitor creates/refreshed candidates automatically on success and does not auto-select.
- Register existing RawResource: use `domain_register_raw_resource_as_content_unit_candidate` when upload, transform, import, editing export, or low-level generation already produced the RawResource and it should become a content-unit candidate.
- Create rich manual candidate: use `domain_create_content_candidate` or batch when the candidate needs a custom outputs array, producer, or prompt snapshot.
- Choose an existing candidate: use `domain_decide_content_unit_candidate` for `adopt`, `reject`, or `defer`; use selection tools only for legacy/explicit selection flows.

1. For normal content-unit image/video generation, edit/compile the content-unit prompt, submit the content-unit generation job, and poll the matching content-unit job tool until terminal. On success, the backend monitor creates or refreshes the candidate automatically.
2. For existing RawResources from upload, transform, import, editing export, or low-level generation, find the target content unit and read or derive the content-unit artifact bundle.
3. Register existing RawResources with `domain_register_raw_resource_as_content_unit_candidate` unless a richer manual candidate payload is needed.
4. Do not select automatically. Ask for or wait for a user/workflow decision when the candidate is meant to affect stable state.
5. Prefer `domain_decide_content_unit_candidate` for user-facing candidate choices:
   - `decision: "adopt"` for 采纳. This selects the candidate/resource as stable output/reference.
   - `decision: "reject"` for 放弃. This records the candidate as rejected without selecting it.
   - `decision: "defer"` for 待定. This keeps the candidate available without selecting it.
6. Use `domain_select_content_unit_candidate` or its batch variant only for legacy or explicitly confirmed selection flows that do not need reject/defer status.
7. Run `domain_inspect` or `domain_review`.
8. Run `domain_interpret` when downstream artifact tools need refreshed backend candidate/decision/selection metadata.
9. Run `domain_regeneration_plan` when selected outputs may affect downstream content.

Inline candidate APIs are compatibility paths for legacy asset/keyframe/source-entity candidate workflows. Prefer content unit candidates for production outputs. For normal asset generation, use an `asset_ref` content unit; do not write new candidates or selections into `asset.json`.

Do not manually call `domain_create_content_candidate` after `system_generate_content_unit_image` or `system_generate_content_unit_video`; the content-unit generation monitor owns candidate creation.

Terms are strict: RawResource is the media/resource body, candidate is the content-unit record, selection is the current stable chosen candidate/resource, and adoption is the user/workflow action that writes selection.

Valid content-candidate status values are `queued`, `running`, `succeeded`, `failed`, `canceled`, and `imported`. Do not pass `completed`, `ready`, `done`, `selected`, or `accepted`.

## Dependency Gate

A candidate is not a stable dependency until adopted/selected.

Before generating a downstream content unit:

- read the dependency report and selection validity for relevant upstream content units,
- confirm required upstream candidates have adopted/selected outputs,
- stop if a required upstream content unit has no selected candidate/resource,
- if candidates exist but none is selected, summarize the choices and ask the user to adopt/select one before continuing,
- continue without selection only if the user explicitly asks for an unstable draft path.

When using an unstable draft path, state that downstream outputs may not be continuity-safe and may not be tracked as stable dependencies.
