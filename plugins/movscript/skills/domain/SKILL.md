---
name: domain
description: Understand MovScript domain concepts, production prerequisites, content units, candidates, selections, stale impact, and MCP/domain edit workflows.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_derive_content_unit_artifact
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_generation_prompt
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_snapshot_script_version
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_upsert_production
  - mcp__movscript__domain_upsert_segment
  - mcp__movscript__domain_upsert_scene_moment
  - mcp__movscript__domain_upsert_shot
  - mcp__movscript__domain_upsert_keyframe
  - mcp__movscript__domain_upsert_storyboard
  - mcp__movscript__domain_upsert_audio_cue
  - mcp__movscript__domain_upsert_expression_unit
  - mcp__movscript__domain_update_content_unit_prompt
  - mcp__movscript__domain_update_entity_transition
  - mcp__movscript__domain_update_storyboard_timeline
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_create_content_candidate_batch
  - mcp__movscript__domain_create_asset_slot_candidate
  - mcp__movscript__domain_create_keyframe_candidate
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate_batch
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_delete_entity
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Domain Workspace

Use this skill when a user asks to inspect, change, interpret, or reason about MovScript project domain entities.

MovScript domain includes object meaning, storage layout, interpreter state, and write APIs. The active language/runtime implementation lives in the MovScript package workspace through `@movscript/language`, `@movscript/workspace`, `@movscript/interpreter`, and `@movscript/engine`. MovScript core exposes those semantics through MCP tools.

Open `references/domain-story.md` when the task depends on the meaning of production structure, content units, candidates, selections, stale state, or regeneration impact. Open `references/entity-glossary.md` when mapping user/product terms to source entity names.

## Core Concepts

- MCP does not infer project from session, cwd, route, or focus. Every project-scoped domain call must include the intended `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- `source`: Editable creative source. It may be incomplete while the user or agent is editing.
- Product state lives in editable source files plus backend candidate/decision metadata exposed through domain APIs.
- `.interpret/**`: Interpreter debug artifacts only. Do not treat them as product state, source of truth, or a workflow contract.
- `domain_inspect`: Primary current-source diagnostic entrypoint. It reports source changes, issues, and interpret readiness without writing interpreted artifacts.
- `domain_review`: Compatibility diagnostic alias for older review workflows. Prefer `domain_inspect` unless the user explicitly asks for review.
- `domain_interpret`: Validates current source and refreshes derived diagnostic artifacts when enabled. It is not publish, approval, commit, or user-intent checkpoint.
- `domain_regeneration_plan`: After interpret, reports downstream content units, prompt bundles, selected outputs, or preview timelines that need review.
- Except for `content_unit`, entities are production structure or generation prerequisites. Do not create every prerequisite at once unless the user asks for that scope.
- Content units are top-level production tasks with refs. They are not production hierarchy nodes and not generated resources.
- Generated/imported resources become effective domain state only through backend-stored candidates and selections. A candidate is not a stable dependency until selected.
- Content-unit candidate decisions are `adopt`, `reject`, or `defer`. `adopt` selects the candidate as stable output/reference, while `reject` and `defer` only annotate the candidate and must not unblock downstream stable generation.
- Affected does not mean regenerate. Affected means the downstream target needs an explicit keep, relink, re-prompt, regenerate, re-shoot, deprecate, or accept-stale decision.

## Tool Map

- Focus and overview: `system_focus_get`, `domain_overview`.
- Model discovery: `domain_get_model`.
- Query/read: `domain_query_entities`, `domain_query_settings`, `domain_query_assets`, `domain_query_production_context`, `domain_read_*`.
- Structured writes: `domain_upsert_*`, `domain_update_*`, `domain_delete_entity`. Use production-chain upserts for production, segment, scene_moment, shot, keyframe, storyboard, audio_cue, and expression_unit records when available.
- Candidate writes: `domain_create_content_candidate`, batch content-candidate tools, `domain_decide_content_unit_candidate`, and content-unit selection tools write backend decision metadata. Inline candidate tools remain compatibility APIs for asset/keyframe/source-entity candidates.
- Prefer `domain_decide_content_unit_candidate` when recording a user-facing generated-candidate choice. Use `decision: "adopt"` for 采纳, `decision: "reject"` for 放弃, and `decision: "defer"` for 待定. Use direct selection tools only for legacy or explicitly confirmed selection flows.
- For completed generated content-unit candidates, omit `status`; the backend defaults it to `succeeded`. If status is needed, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; do not use workflow words such as `completed`, `ready`, `selected`, or `accepted`.
- Interpreter steps: `domain_inspect`, `domain_interpret`, `domain_regeneration_plan`. `domain_review` is compatibility-only.

## Edit Workflow

1. Call `system_focus_get` when the request depends on the selected project, production, or entity.
2. Query existing context with `domain_query_*` or read derived artifact context with `domain_read_*`.
3. Call `domain_get_model` before changing a domain entity so editable paths, schema ids, and instructions come from MovScript.
4. Prefer structured `domain_*` write APIs when they cover the requested operation.
5. Directly edit source files only when no structured API covers the field or structure.
6. Run `domain_inspect` after any API write or file edit.
7. Fix diagnostics and re-run `domain_inspect` until the source is ready.
8. Run `domain_interpret` after the coherent semantic step is ready. Interpret validates source and refreshes derived diagnostic artifacts when enabled; it does not publish, approve, commit, or checkpoint user intent.
9. Run `domain_regeneration_plan` after interpret when the change can stale generated content, prompts, media, or selections.

## Editable Source

Direct file edits are allowed only under source paths returned by `domain_get_model` or under known source roots:

- `project.json`
- `project_standards.json`
- `settings/**`
- `scripts/**`
- `content_units/**`
- `productions/**`

Do not directly edit:

- `.interpret/**` debug artifacts
- `.movscript/**` runtime, provider, session, cache, or local config files unless the user explicitly asks for configuration work.
- Resource binaries, backend database state, or generation job runtime records.

## Rules

- APIs first, source files second. Direct file editing is a controlled fallback, not the default write path.
- Always pass `projectId` to project-scoped tools, and never use user or organization identity as a project routing shortcut.
- For `domain_upsert_setting` and `domain_upsert_asset`, put the data to write under `payload`; `record` and `entity` are existing-context objects, not the write body.
- If a direct edit is needed, call `domain_get_model` first and edit only the returned source scope.
- After completing any user request that changes domain source, run `domain_inspect` and then `domain_interpret` when diagnostics pass and derived domain artifacts should be refreshed. After content candidate, decision, or selection writes, run `domain_interpret` when downstream artifact tools need the latest backend decision metadata.
- Do not interpret for read-only review, draft-only analysis, or source states with blocking issues; state the reason when interpret is intentionally skipped.
- Do not store resource binaries, external provider URLs, or generation job runtime state in domain JSON.
- Use stable ids and MovScript `resource_id` references for generated or uploaded media.
- Preserve user-facing review boundaries. Generated or edited data is not stable product state until the relevant source or backend decision metadata records adoption/selection and has been interpreted successfully.
- Current specialized `content_unit_type` adapters are `asset_ref`, `keyframe_ref`, `storyboard_ref`, `scence_moment_ref`, and `shot_ref`. Unknown types are valid generic production slots, but the interpreter does not track their upstream dependencies or stale state.
