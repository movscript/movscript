# Candidate Selection Flow

Use this when writing or selecting generated, uploaded, imported, or manually recorded outputs.

For content-unit image/video generation, do not start from a raw generated resource and then manually write a candidate. Edit the content unit `edit_prompt`, call `system_generate_content_unit_image` or `system_generate_content_unit_video`, then poll the matching content-unit job tool. Successful terminal polls automatically create or refresh backend content candidates.

1. Generate or import a MovScript RawResource.
2. Find the target content unit.
3. Read or derive the content unit artifact bundle.
4. For transformed, imported, manually recorded, or intentionally low-level generation outputs, write a backend content candidate with `domain_create_content_candidate` or `domain_create_content_candidate_batch`. For completed outputs, omit `status`; the backend defaults it to `succeeded`.
5. Do not select automatically. Ask for or wait for a user/workflow decision when the candidate is meant to affect stable state.
6. Prefer `domain_decide_content_unit_candidate` for user-facing candidate choices:
   - `decision: "adopt"` for 采纳. This selects the candidate/resource as stable output/reference.
   - `decision: "reject"` for 放弃. This records the candidate as rejected without selecting it.
   - `decision: "defer"` for 待定. This keeps the candidate available without selecting it.
7. Use `domain_select_content_unit_candidate` or its batch variant only for legacy or explicitly confirmed selection flows that do not need reject/defer status.
8. Run `domain_inspect` or `domain_review`.
9. Run `domain_interpret` when downstream artifact tools need refreshed backend candidate/decision/selection metadata.
10. Run `domain_regeneration_plan` when selected outputs may affect downstream content.

Inline candidate APIs are compatibility paths for asset/keyframe/source-entity candidate workflows. Prefer content unit candidates for production outputs.

Do not manually call `domain_create_content_candidate` after `system_generate_content_unit_image` or `system_generate_content_unit_video`; the content-unit generation monitor owns candidate creation.

Valid content-candidate status values are `queued`, `running`, `succeeded`, `failed`, `canceled`, and `imported`. Do not pass `completed`, `ready`, `done`, `selected`, or `accepted`.

## Dependency Gate

A candidate is not a stable dependency until adopted/selected.

Before generating a downstream content unit:

- read the dependency report and selection validity for relevant upstream content units,
- confirm required upstream candidates have adopted/selected outputs,
- stop if a required upstream content unit has no selected candidate/resource,
- continue without selection only if the user explicitly asks for an unstable draft path.

When using an unstable draft path, state that downstream outputs may not be continuity-safe and may not be tracked as stable dependencies.
