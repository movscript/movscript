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
  - mcp__movscript__domain_read_production_timeline
  - mcp__movscript__domain_read_scene_moment_timeline
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_generation_prompt
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_read_project_context_snapshot
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_setting_state
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_setting_tree
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_snapshot_script_version
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_upsert_production
  - mcp__movscript__domain_upsert_production_tree
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
  - mcp__movscript__domain_register_raw_resource_as_content_unit_candidate
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
  - mcp__movscript__domain_production_status_summary
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
- `domain_read_project_context_snapshot`: Read-only project context harness entrypoint. Use it before project-scoped planning, content-unit work, or generation so house style, prompt rules, negative rules, aspect ratio, and style reference resources are visible to the agent.
- Except for `content_unit`, entities are production structure or generation prerequisites. Do not create every prerequisite at once unless the user asks for that scope.
- Content units are top-level production tasks with refs. They are not production hierarchy nodes and not generated resources.
- Assets are content-unit carriers for generation and review: asset outputs/candidates should be represented through `asset_ref` content units, using the same backend candidate/decision flow as scene_moment, keyframe, and storyboard outputs.
- Generated/imported resources become effective domain state only through backend-stored candidates and selections. A candidate is not a stable dependency until selected.
- Terms are strict: RawResource is the media/resource body; candidate is a content-unit candidate record that points to outputs; selection is the current stable chosen candidate/resource; adoption is the user or workflow action that writes selection. Do not use these words interchangeably.
- Downstream prompts reference selected upstream candidates by semantic prompt refs when dependency tracking and selected-candidate semantics matter. Use `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, `{{candidate::id}}`, or `{{resource::123}}` in content-unit `edit_prompt`. Prompt compilation resolves selected backend candidates into resource mentions such as `@[resource:123]`; legacy `[[resource::123]]` mentions are also recognized. For loose raw-resource guidance without semantic dependency tracking, direct RawResource IDs can be passed as generation inputs/references instead.
- Content-unit candidate decisions are `adopt`, `reject`, or `defer`. `adopt` selects the candidate as stable output/reference, while `reject` and `defer` only annotate the candidate and must not unblock downstream stable generation.
- Affected does not mean regenerate. Affected means the downstream target needs an explicit keep, relink, re-prompt, regenerate, re-shoot, deprecate, or accept-stale decision.
- `setting` must be a concrete film/music production entity to be made or reused, such as `主角-老张`, `道具-玉玺`, a place, an instrument, a costume, or a voice identity. Do not create settings for abstract styles, world rules, genres, moods, or one-off prompt notes; use project standards or the relevant production/expression fields instead.
- `setting_state` is a namespace under exactly one setting for a named condition/version of that same entity, such as base look, wet hair, damaged prop, side-view variant, formal costume, calm voice, or angry voice.
- `asset` is a resource slot under a setting state that describes that state, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. For image asset generation, prefer plain white or very clean backgrounds unless the user explicitly asks for scene context.

## Tool Map

- Focus and overview: `system_focus_get`, `domain_overview`.
- Model discovery: `domain_get_model`.
- Query/read: `domain_query_entities`, `domain_query_settings`, `domain_query_assets`, `domain_query_production_context`, `domain_read_*`.
- Project context: `domain_read_project_context_snapshot` for read-only context assembly; `domain_upsert_project_standards` only for explicit user-requested standard additions, removals, or edits.
- Structured writes: `domain_upsert_*`, `domain_update_*`, `domain_delete_entity`. Use `domain_upsert_setting_state` for one setting state, `domain_upsert_setting_tree` for setting -> multiple states -> multiple assets writes, and `domain_upsert_production_tree` for production -> segments -> scene_moments -> expression_units/anchors/content_units writes. Tree upserts are merge/patch operations: omitted existing children are not deleted.
- Candidate writes: `domain_register_raw_resource_as_content_unit_candidate`, `domain_create_content_candidate`, batch content-candidate tools, `domain_decide_content_unit_candidate`, and content-unit selection tools write backend decision metadata. Use raw-resource registration when a RawResource already exists and only needs to enter a content-unit candidate pool. Asset candidates must use `asset_ref` content units. Inline candidate tools remain compatibility/migration APIs for legacy asset/keyframe/source-entity candidates.
- Prefer `domain_decide_content_unit_candidate` when recording a user-facing generated-candidate choice. Use `decision: "adopt"` for 采纳, `decision: "reject"` for 放弃, and `decision: "defer"` for 待定. Use direct selection tools only for legacy or explicitly confirmed selection flows.
- Use `domain_production_status_summary` for a compact read of production prerequisites, content-unit candidate counts, selected resources, stale hints, and blockers before broad review or generation.
- For completed generated content-unit candidates, omit `status`; the backend defaults it to `succeeded`. If status is needed, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; do not use workflow words such as `completed`, `ready`, `selected`, or `accepted`.
- Interpreter steps: `domain_inspect`, `domain_interpret`, `domain_regeneration_plan`. `domain_review` is compatibility-only.
- `domain_compose_scene_moment_from_edit_plan` and `domain_compose_production_from_timeline` are not available editing paths. For video editing, use the `editing` skill and the `editing_*` tool family so timeline render runs through Electron `mediaPipeline`.

## Edit Workflow

1. Call `system_focus_get` when the request depends on the selected project, production, or entity.
2. For project-scoped planning, content-unit, generation, or style-sensitive work, call `domain_read_project_context_snapshot` before designing or changing source. Treat missing standards as context gaps to mention, not permission to edit.
3. Query existing context with `domain_query_*` or read derived artifact context with `domain_read_*`.
4. Call `domain_get_model` before changing a domain entity so editable paths, schema ids, and instructions come from MovScript.
5. Prefer structured `domain_*` write APIs when they cover the requested operation.
6. Directly edit source files only when no structured API covers the field or structure.
7. Run `domain_inspect` after any API write or file edit.
8. Fix diagnostics and re-run `domain_inspect` until the source is ready.
9. Run `domain_interpret` after the coherent semantic step is ready. Interpret validates source and refreshes derived diagnostic artifacts when enabled; it does not publish, approve, commit, or checkpoint user intent.
10. Run `domain_regeneration_plan` after interpret when the change can stale generated content, prompts, media, or selections.

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
- Read `domain_read_project_context_snapshot` before project-scoped creative work that may depend on house style or constraints. Do not call `domain_upsert_project_standards` merely because the snapshot has missing fields.
- Use `domain_upsert_project_standards` only when the user explicitly asks to add, remove, refine, replace, or otherwise change project standards. After changing standards, run `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan` when downstream content may be affected.
- For `domain_upsert_setting`, `domain_upsert_setting_state`, and `domain_upsert_asset`, put the data to write under `payload`; `record` and `entity` are existing-context objects, not the write body. For setting -> states -> assets authoring, prefer `domain_upsert_setting_tree`.
- Before calling `domain_upsert_setting`, check that the payload describes a concrete film/music entity, not a style/rule/task. Before calling `domain_upsert_asset`, check that the asset belongs under a named `setting_state` and describes one asset slot for that state.
- Do not create or select ordinary asset candidates through `asset.json` inline candidate arrays. Create an `asset_ref` content unit for the asset and write/select candidates through the content-unit candidate tools so frontend, MCP, stale checks, and decision history stay aligned.
- When writing downstream `edit_prompt` text that should use a selected asset, storyboard, or keyframe as a tracked dependency, reference it with semantic prompt-ref syntax, such as `{{asset::hero_base}}` or `{{storyboard::opening_panel}}`. If the user only needs raw resources as loose model references, use direct resource refs or generation `input_resource_ids` / `reference_resource_ids`.
- Do not replace semantic prompt refs with raw resource numbers before compilation. Use raw resource refs only when the resource is intentionally a loose input or explicit `{{resource::123}}`.
- If a direct edit is needed, call `domain_get_model` first and edit only the returned source scope.
- After completing any user request that changes domain source, run `domain_inspect` and then `domain_interpret` when diagnostics pass and derived domain artifacts should be refreshed. After content candidate, decision, or selection writes, run `domain_interpret` when downstream artifact tools need the latest backend decision metadata.
- Do not interpret for read-only review, draft-only analysis, or source states with blocking issues; state the reason when interpret is intentionally skipped.
- Do not store resource binaries, external provider URLs, or generation job runtime state in domain JSON.
- Use stable ids and MovScript `resource_id` references for generated or uploaded media.
- Preserve user-facing review boundaries. Generated or edited data is not stable product state until the relevant source or backend decision metadata records adoption/selection and has been interpreted successfully.
- Do not use domain compose tools to satisfy ordinary cutting, trimming, stitching, or rendering requests. Domain tools may hand off context and record explicit candidates/decisions, but editing tools own timeline mutations and mediaPipeline tasks.
- Current specialized `content_unit_type` adapters are `production_ref`, `segment_ref`, `asset_ref`, `keyframe_ref`, `storyboard_ref`, `scence_moment_ref` / `scene_moment_ref`, `expression_unit_ref`, and `shot_ref`. Unknown types are valid generic production slots, but the interpreter does not track their upstream dependencies or stale state.
