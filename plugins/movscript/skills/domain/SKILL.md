---
name: domain
description: "Work with MovScript creative project state using production-language first: project context, script, continuity references, scene beats, output tasks, generated options, adoption decisions, readiness checks, and impact review. Use when inspecting, changing, or reasoning about the underlying domain/source model through MCP tools."
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_remote_asset_groups
  - mcp__movscript__domain_query_remote_assets
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
  - mcp__movscript__domain_upsert_timeline_namespace_tree
  - mcp__movscript__domain_upsert_production
  - mcp__movscript__domain_upsert_production_tree
  - mcp__movscript__domain_upsert_segment
  - mcp__movscript__domain_upsert_scene_moment
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

# MovScript Production Workspace

Use this skill when a user asks to inspect, change, validate, or reason about MovScript project content. Think in film/production terms first: project context, script, continuity references, scene beats, scene materials, output tasks, generated options, adopted choices, readiness, and downstream impact. Use internal domain/entity names only for tool calls, source paths, and precise diagnostics.

The `domain_*` MCP tools are the internal editing and diagnostic surface for that production workspace. Do not make the conversation about "domain objects" unless the user is debugging MovScript itself; explain work in business terms such as "scene beat", "reference asset", "output task", "generated option", "chosen result", and "impact review".

Open `references/domain-story.md` when the task depends on the production workflow behind scene structure, output tasks, generated options, adopted choices, stale state, or impact review. Open `references/entity-glossary.md` only when mapping user/product terms to source entity names.

## Language Posture

- Use business language in reasoning and user-facing responses. Say "情节点", "镜头素材", "参考图", "产出任务", "候选结果", "采纳", and "影响复查" before internal words such as entity, content unit, candidate, selection, interpret, or stale.
- Use internal names exactly when calling tools or editing source: `scene_moment`, `expression_unit`, `content_unit`, `candidate`, `selection`, `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan`.
- Treat `domain` as an implementation prefix, not the product model to teach the user.
- Preserve strict review boundaries: a generated option is not a chosen result until the user or workflow adopts/selects it.

## Agent Surface URLs

- When an MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it to complete the next action.
- Name what the page is for: prompt editing/saving, candidate review, stale-impact acceptance, preview timeline inspection, project status review, or resource/reference lookup.
- Do not treat a returned URL as a completed decision. A prompt change, candidate adoption/rejection/defer, or accept-stale action is complete only after the user performs the page action or the agent writes the matching domain decision through a tool.
- If a result also includes secondary surfaces, lead with the primary `surface.url` and mention secondary URLs only when they help the next decision. Use URLs exactly as returned; do not invent or rewrite them.

## Core Concepts

- MovScript MCP host may run as a cloud/external entrypoint, a local daemon-attached session, or a diagnostic/basic session. Domain tools should see project/source/candidate state through Project Service and Data Service capabilities. If a tool reports a missing service endpoint, call `movscript_runtime_status`, classify the runtime owner/data plane, and report the missing capability; do not assume Desktop is required.
- MCP does not infer project from session, cwd, route, or focus. Every project-scoped domain call must include the intended `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- `source`: Editable creative project source. It may be incomplete while the user or agent is editing.
- Product state lives in editable source files plus backend generated-option/decision metadata exposed through domain APIs.
- `.interpret/**`: Interpreter debug artifacts only. Do not treat them as product state, source of truth, or a workflow contract.
- `domain_inspect`: Primary project readiness check. It reports source changes, issues, and interpret readiness without writing interpreted artifacts.
- `domain_review`: Compatibility diagnostic alias for older review workflows. Prefer `domain_inspect` unless the user explicitly asks for review.
- `domain_interpret`: Refreshes project diagnostics and derived artifacts when enabled. It is not publish, approval, commit, or user-intent checkpoint.
- `domain_regeneration_plan`: After interpret, reports downstream output tasks, prompt bundles, chosen outputs, or preview timelines that need impact review.
- `domain_read_project_context_snapshot`: Read-only project context entrypoint. Use it before project-scoped planning, output-task work, or generation so house style, prompt rules, negative rules, aspect ratio, and style reference resources are visible to the agent.
- Except for `content_unit`, entities are production structure or generation prerequisites. Do not create every prerequisite at once unless the user asks for that scope.
- Content units are output tasks: they describe something to generate, import, or review, such as a reference image, storyboard panel, keyframe, scene-beat video, or finished segment. They are not production hierarchy nodes and not generated resources.
- Assets are reference slots for generation and review: asset outputs/options should be represented through `asset_ref` content units, using the same backend option/decision flow as scene_moment, keyframe, and storyboard outputs.
- Generated/imported resources become effective project state only through backend-stored candidates and selections. A candidate is not a stable dependency until selected.
- Terms are strict: RawResource is the media/resource body; candidate is a generated/imported option record that points to outputs; selection is the current stable chosen candidate/resource; adoption is the user or workflow action that writes selection. Do not use these words interchangeably.
- Downstream prompts reference selected upstream candidates by semantic prompt refs when dependency tracking and selected-candidate semantics matter. Use `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{audio_cue::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, `{{candidate::id}}`, or `{{resource::123}}` in content-unit `edit_prompt`. Prompt compilation resolves selected backend candidates into resource mentions such as `@[resource:123]`; legacy `[[resource::123]]` mentions are also recognized. For loose raw-resource guidance without semantic dependency tracking, direct RawResource IDs can be passed as generation inputs/references instead.
- Content-unit candidate decisions are `adopt`, `reject`, or `defer`. `adopt` selects the candidate as stable output/reference, while `reject` and `defer` only annotate the candidate and must not unblock downstream stable generation.
- Affected does not mean regenerate. Affected means the downstream target needs an explicit keep, relink, re-prompt, regenerate, re-shoot, deprecate, or accept-stale decision.
- `setting` must be a concrete film/music production entity to be made or reused, such as `主角-老张`, `道具-玉玺`, a place, an instrument, a costume, or a voice identity. Do not create settings for abstract styles, world rules, genres, moods, or one-off prompt notes; use project standards or the relevant production/expression fields instead.
- `setting_state` is a namespace under exactly one setting for a named condition/version of that same entity, such as base look, wet hair, damaged prop, side-view variant, formal costume, calm voice, or angry voice.
- `asset` is a resource slot under a setting state that describes that state, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. For image asset generation, prefer plain white or very clean backgrounds unless the user explicitly asks for scene context.
- Provider asset certification is a provider-account remote asset-library capability. Use `domain_query_remote_asset_groups` before certification when the target group is not explicit, then use `domain_certify_asset_provider` with a concrete `provider`, `model`, and selected/explicit remote `asset_group_id`. MovScript mirrors remote groups, remote assets, and model-specific certifications separately; RawResource and asset JSON certification fields are compatibility mirrors only. Treat `asset://` values as scoped to one provider account, group, and certified model. A RawResource certified for Seedance 2.0 is not automatically certified for Seedance 2.0 fast/pro. Official Ark provider-asset settings provide the Volcengine OpenAPI URL, region, and AK/SK. Yunwu private-avatar certification reuses the Yunwu Provider base URL and API key; do not ask for a second asset-library gateway credential. This path still needs a public backend URL for signed resource URLs or an explicit `source_url`.
- Provider-generated artifact trust is a separate RawResource-level provenance capability stored in `provider_generated_artifact`. Use it to decide whether Seedance 2.0 face videos, their tail-frame images, or Seedream 5.0 lite face images are still inside the provider trust window. Do not infer trusted-reference eligibility from asset selection, candidate adoption, filenames, prompts, or `provider_asset_certifications`.
- Shot-like visual intent belongs to `expression_unit` records under a scene moment, with `modality=visual` and `role=shot`. Do not call or request `domain_upsert_shot` for new work; legacy shot source records may exist only for old data migration/compatibility.

## Tool Map

- Focus and overview: `system_focus_get`, `domain_overview`.
- Model discovery: `domain_get_model`.
- Query/read: `domain_query_entities`, `domain_query_settings`, `domain_query_assets`, `domain_query_production_context`, `domain_read_*`.
- Project context: `domain_read_project_context_snapshot` for read-only context assembly; `domain_upsert_project_standards` only for explicit user-requested standard additions, removals, or edits.
- Structured writes: `domain_upsert_*`, `domain_update_*`, `domain_delete_entity`. Use `domain_upsert_setting_state` for one setting state, `domain_upsert_setting_tree` for setting -> multiple states -> multiple assets writes, and `domain_upsert_timeline_namespace_tree` for new path-first timeline namespace trees. That tool treats path as the instance parent source, stores user vocabulary in `namespace_kind`, strips namespace content-unit/candidate state, can write `scene_moment` plus expression/storyboard/keyframe/audio primitives under namespace paths, and writes namespace-scope outputs as `timeline_assembly_ref` content units. For a single new scene moment under a timeline namespace, call `domain_upsert_scene_moment` with `targetPath` or `namespacePath`; for expression/keyframe/storyboard/audio children, call their `domain_upsert_*` tools with `targetPath`, `sceneMomentPath`, or `expressionUnitPath`. `productionId`/`segmentId` are legacy compatibility inputs. Use `domain_upsert_production_tree` only as the legacy production/segment projection writer for older source flows. Tree upserts are merge/patch operations: omitted existing children are not deleted. For namespace-scope video output, write an explicit `timeline_assembly_ref` content unit instead of relying on legacy `production_ref` / `segment_ref`.
- Candidate writes: `domain_register_raw_resource_as_content_unit_candidate`, `domain_create_content_candidate`, batch content-candidate tools, `domain_decide_content_unit_candidate`, and content-unit selection tools write backend decision metadata. Use raw-resource registration when a RawResource already exists and only needs to enter a content-unit candidate pool. Asset candidates must use `asset_ref` content units. Inline candidate tools remain compatibility/migration APIs for legacy asset/keyframe/source-entity candidates.
- Prefer `domain_decide_content_unit_candidate` when recording a user-facing generated-candidate choice. Use `decision: "adopt"` for 采纳, `decision: "reject"` for 放弃, and `decision: "defer"` for 待定. Use direct selection tools only for legacy or explicitly confirmed selection flows.
- Use `domain_production_status_summary` for a compact read of production prerequisites, content-unit candidate counts, selected resources, stale hints, and blockers before broad review or generation.
- For completed generated content-unit candidates, omit `status`; the backend defaults it to `succeeded`. If status is needed, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; do not use workflow words such as `completed`, `ready`, `selected`, or `accepted`.
- Interpreter steps: `domain_inspect`, `domain_interpret`, `domain_regeneration_plan`. `domain_review` is compatibility-only.
- `domain_compose_scene_moment_from_edit_plan` and `domain_compose_production_from_timeline` are not available editing paths. For video editing, use the `editing` skill and the `editing_*` tool family so timeline state runs through Editing Service and render/transcode/HLS execution runs through Media Pipeline when available.

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
- When writing downstream `edit_prompt` text that should use a selected asset, storyboard, keyframe, or audio cue as a tracked dependency, reference it with semantic prompt-ref syntax, such as `{{asset::hero_base}}`, `{{storyboard::opening_panel}}`, or `{{audio_cue::phone_vibration}}`. If the user only needs raw resources as loose model references, use direct resource refs or generation `input_resource_ids` / `reference_resource_ids`.
- Do not replace semantic prompt refs with raw resource numbers before compilation. Use raw resource refs only when the resource is intentionally a loose input or explicit `{{resource::123}}`.
- If a direct edit is needed, call `domain_get_model` first and edit only the returned source scope.
- After completing any user request that changes domain source, run `domain_inspect` and then `domain_interpret` when diagnostics pass and derived domain artifacts should be refreshed. After content candidate, decision, or selection writes, run `domain_interpret` when downstream artifact tools need the latest backend decision metadata.
- Do not interpret for read-only review, draft-only analysis, or source states with blocking issues; state the reason when interpret is intentionally skipped.
- Do not store resource binaries, external provider URLs, or generation job runtime state in domain JSON.
- Use stable ids and MovScript `resource_id` references for generated or uploaded media.
- Preserve user-facing review boundaries. Generated or edited data is not stable product state until the relevant source or backend decision metadata records adoption/selection and has been interpreted successfully.
- Do not use domain compose tools to satisfy ordinary cutting, trimming, stitching, or rendering requests. Domain tools may hand off context and record explicit candidates/decisions, but editing tools own timeline mutations and Media Pipeline tasks.
- Current specialized `content_unit_type` adapters are `timeline_assembly_ref`, legacy `production_ref` / `segment_ref`, `asset_ref`, `keyframe_ref`, `storyboard_ref`, `audio_cue_ref`, `scence_moment_ref` / `scene_moment_ref`, and `expression_unit_ref`. Unknown types are valid generic production slots, but the interpreter does not track their upstream dependencies or stale state. Do not invent namespace-specific content unit types such as `episode_ref` or `beat_ref`; use `timeline_assembly_ref` for namespace-scope assembly video.
