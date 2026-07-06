---
name: domain
description: "Work with MovScript creative project state and product workflow boundaries using production-language first: project context, script, continuity references, story beats, shots, dialogue/narration voice, subtitles, sound/music, storyboard images, keyframe images, generated options, adoption decisions, external output return-to-Resource/Candidate flow, readiness checks, and impact review. Use when inspecting, changing, or reasoning about the underlying project source model through MCP tools."
toolGrants:
  - mcp__movscript__movscript_runtime_status
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
  - mcp__movscript__domain_register_raw_resource_as_content_unit_candidate
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_create_content_candidate_batch
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate_batch
  - mcp__movscript__domain_delete_entity
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_production_status_summary
  - mcp__movscript__domain_regeneration_plan
---

# MovScript Production Workspace

Use this skill when a user asks to inspect, change, validate, or reason about MovScript project content. Think in film/production terms first: project context, durable script/source story, continuity references, story beats, shots, dialogue/narration voice, subtitles, sound/music, 分镜图, 关键帧, generated options, adopted choices, readiness, and downstream impact. Use internal names only for tool calls, source paths, and precise diagnostics. If project locator, initialization, open/fetch state, or service availability is unclear, use the `project` skill's Project Management Gate before domain reads or writes.

The `domain_*` MCP tools are the internal editing and diagnostic surface for that production workspace. Do not make the conversation about "domain objects" unless the user is debugging MovScript itself; explain work with concrete production words such as "剧情段落", "镜头画面", "台词语音", "旁白语音", "字幕", "音效", "音乐", "分镜图", "关键帧", "参考素材", "生成结果", "当前选中的结果", and "影响复查".

Open `references/product-workflow-contract.md` when deciding MovScript product boundaries, agent skill routing, external generation handoffs, or why work must return through Resource, Candidate, Selection, and impact review. Open `references/resource-discoverability.md` when generated/imported/uploaded/rendered artifacts become Resources or candidates. Open `references/user-facing-response.md` before ordinary user-facing summaries, blockers, confirmations, review choices, or next-step guidance. Open `references/domain-story.md` when the task depends on the production workflow behind scene structure, output tasks, generated options, adopted choices, stale state, or impact review. Open `references/entity-glossary.md` only when mapping user/product terms to source entity names.

## Production Contract

- Production step: project content/source state behind content planning, generation readiness, timeline inputs, and review.
- Systems/config: Project Service and Data Service expose source, read models, generated options, decisions, and context; runtime/daemon supplies the service endpoints; admin config is out of scope unless explicitly requested.
- Blockers: missing project locator, unresolved project initialization/open state, Project Service/Data Service unavailable, schema/reference errors, stale or unselected upstream candidates, or attempted writes to debug/runtime files.
- Human review: prompt edits, candidate adoption/rejection/defer, stale-impact acceptance, and destructive source deletes require explicit user action or an explicit domain decision tool call.
- Output: describe business changes, readiness, selected/adopted state, affected downstream work, surface URL actions, and exact next tool or user review gate.

## Language Posture

- Use concrete production language in reasoning and user-facing responses. Say "剧情段落", "镜头画面", "台词语音", "旁白语音", "字幕", "音效", "音乐", "分镜图", "关键帧", "内容制作任务", "角色/场景/道具/服装/声音参考", "生成结果", "采纳", and "复查" before internal words such as entity, content unit, expression unit, candidate, selection, interpret, or stale.
- For ordinary creative users, follow `references/user-facing-response.md`: lead with project meaning and next choices, and reserve IDs/tool names/service details for explicit debug or when the user needs them to act.
- Do not orient ordinary users by saying the project is a repository, codebase, file tree, or not an ordinary code repo. Translate file/source observations into video-production meaning: story status, continuity references, prompts, generated versions, chosen results, and editing readiness.
- Use internal names exactly when calling tools or editing source: `scene_moment`, `expression_unit`, `content_unit`, `candidate`, `selection`, `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan`.
- Treat `domain`, `content_unit`, `expression_unit`, `scene_moment`, `storyboard`, and `keyframe` as implementation labels, not concepts to teach ordinary users. Say 内容制作任务/制作项 for content_unit, 分镜图 for storyboard, and 关键帧 for keyframe.
- Preserve strict review boundaries: a generated option is not a chosen result until the user or workflow adopts/selects it.

## Agent Surface URLs

- When an MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it to complete the next action.
- Name what the page is for: prompt editing/saving, candidate review, stale-impact acceptance, preview timeline inspection, project status review, or resource/reference lookup.
- Do not treat a returned URL as a completed decision. A prompt change, candidate adoption/rejection/defer, or accept-stale action is complete only after the user performs the page action or the agent writes the matching domain decision through a tool.
- If a result also includes secondary surfaces, lead with the primary `surface.url` and mention secondary URLs only when they help the next decision. Use URLs exactly as returned; do not invent or rewrite them.

## Core Concepts

- MovScript MCP access is a thin adapter over the daemon MCP endpoint or a cloud/external runtime gateway. Domain tools should see project/source/candidate state through Project Service and Data Service capabilities. If a tool reports a missing service endpoint, call `movscript_runtime_status`, classify the runtime owner/data plane, and report the missing capability; do not assume Desktop is required.
- MCP does not infer project from session, cwd, route, or focus. Every project-scoped domain call must include the intended source workspace locator, normally `projectDir`/`project_dir` or `cwd`; include `projectUid`/`project_uid` when writing scoped backend candidate or decision metadata.
- Current UI candidate and selection metadata lives in scoped project-data keyed by `projectUid` plus runtime/app scope. Do not use top-level `movscript candidate add/select`, `MOVSCRIPT_PROJECT_ID=...`, or `/api/v1/projects/:id/decisions` as a fallback. If a scoped decisionStore is unavailable, diagnose projectUid, scope, auth, and runtime context, then stop instead of writing legacy project decisions.
- If the locator exists but the project is not clearly initialized, open/fetched, or able to return Project Service context, switch to the `project` skill's Project Management Gate before project-scoped domain work. Use project init/create only when the user explicitly asks or confirms.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- `source`: Editable creative project source. It may be incomplete while the user or agent is editing.
- `scripts/**`: Durable screenplay and project story memory. Store important story intent, scene order, dialogue, narration, character/world continuity, and project-level creative decisions here before deriving short story beats, concrete shot/voice/subtitle/sound/music materials, internal output tasks, or prompts. Also store brainstormed but durable inspirations here when they may affect later story, continuity, scene design, prompt writing, or generation.
- Product state lives in editable source files plus backend generated-option/decision metadata exposed through domain APIs.
- `.interpret/**`: Interpreter debug artifacts only. Do not treat them as product state, source of truth, or a workflow contract.
- `domain_inspect`: Primary project readiness check. It reports source changes, issues, and interpret readiness without writing interpreted artifacts.
- `domain_review`: Compatibility diagnostic alias for older review workflows. Prefer `domain_inspect` unless the user explicitly asks for review.
- `domain_interpret`: Refreshes project diagnostics and derived artifacts when enabled. It is not publish, approval, commit, or user-intent checkpoint.
- `domain_regeneration_plan`: After interpret, reports downstream output tasks, prompt bundles, chosen outputs, or preview timelines that need impact review.
- `domain_read_project_context_snapshot`: Read-only project context entrypoint. Use it before project-scoped planning, output-task work, or generation so house style, prompt rules, negative rules, aspect ratio, and style reference resources are visible to the agent.
- Except for `content_unit`, entities are production structure or generation prerequisites. Do not create every prerequisite at once unless the user asks for that scope.
- Internally, `content_unit` records are content-production tasks: they describe something to generate, import, or review, such as a reference image, 分镜图, 关键帧, scene-beat video, or finished segment. In ordinary replies, call them 内容制作任务/制作项 or name the exact output.
- Assets are reference slots for generation and review: asset outputs/options should be represented through `asset_ref` 内容制作任务, using the same backend option/decision flow as story-beat video, 关键帧, and 分镜图 outputs.
- Generated/imported resources should be preserved as RawResources before quality judgment whenever they can be materialized, with discoverable title, purpose, placement, status, version, and provenance when available. They become effective project state only through backend-stored candidates and selections. A candidate is not a stable dependency until selected.
- Terms are strict: RawResource is the media/resource body; candidate is a generated/imported option record that points to outputs; selection is the current stable chosen candidate/resource; adoption is the user or workflow action that writes selection. Do not use these words interchangeably.
- Downstream prompts reference selected upstream candidates by semantic prompt refs when dependency tracking and selected-candidate semantics matter. Use `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{audio_cue::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, `{{candidate::id}}`, or `{{resource::123}}` in the 内容制作任务 `edit_prompt`. Prompt compilation resolves selected backend candidates into resource mentions such as `@[resource:123]`; legacy `[[resource::123]]` mentions are also recognized. For loose raw-resource guidance without semantic dependency tracking, direct RawResource IDs can be passed as generation inputs/references instead.
- 内容制作任务 candidate decisions are `adopt`, `reject`, or `defer`. `adopt` selects the candidate as stable output/reference, while `reject` and `defer` only annotate the candidate and must not unblock downstream stable generation or delete/hide the underlying RawResource.
- Affected does not mean regenerate. Affected means the downstream target needs an explicit keep, relink, re-prompt, regenerate, re-shoot, deprecate, or accept-stale decision.
- `setting` must be a concrete screenplay/production entity to be made or reused, such as a character/person, script location/scene space/set, prop, instrument, costume, voice identity, `主角-老张`, `场景-老张的厨房`, or `道具-玉玺`. Do not create settings for abstract styles, world rules, genres, moods, or one-off prompt notes; use project standards or the relevant production/expression fields instead.
- Do not map a reusable story place, scene space, set, or environment to `scene_moment` just because the user says "场景". In Chinese, "场景" may mean location/space; use `setting` for that. Use `scene_moment` only for the dramatic/action beat that happens there.
- `setting_state` is a namespace under exactly one setting for a named condition/version of that same entity, such as base look, wet hair, damaged prop, side-view variant, formal costume, calm voice, or angry voice.
- `asset` is a resource slot under a setting state that describes that state, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. For image asset generation, prefer plain white or very clean backgrounds unless the user explicitly asks for scene context.
- Provider asset certification is a provider-account remote asset-library capability. `domain_query_remote_asset_groups`, `domain_query_remote_assets`, and `domain_certify_asset_provider` are CLI-backed through `movscript domain provider ... --json`, but still represent provider/legacy productization boundaries. Use `domain_query_remote_asset_groups` before certification when the target group is not explicit, then use `domain_certify_asset_provider` with a concrete `provider`, `model`, and selected/explicit remote `asset_group_id`. MovScript mirrors remote groups, remote assets, and model-specific certifications separately; RawResource and asset JSON certification fields are compatibility mirrors only. Treat `asset://` values as scoped to one provider account, group, and certified model. A RawResource certified for Seedance 2.0 is not automatically certified for Seedance 2.0 fast/pro. Official Ark provider-asset settings provide the Volcengine OpenAPI URL, region, and AK/SK. Yunwu private-avatar certification reuses the Yunwu Provider base URL and API key; do not ask for a second asset-library gateway credential. This path still needs a public backend URL for signed resource URLs or an explicit `source_url`.
- Provider-generated artifact trust is a separate RawResource-level provenance capability stored in `provider_generated_artifact`. Use it to decide whether Seedance 2.0 face videos, their tail-frame images, or Seedream 5.0 lite face images are still inside the provider trust window. Do not infer trusted-reference eligibility from asset selection, candidate adoption, filenames, prompts, or `provider_asset_certifications`.
- Shot-like visual intent belongs to `expression_unit` records under a scene moment, with `modality=visual` and `role=shot`. Do not call or request `domain_upsert_shot` for new work; legacy shot source records may exist only for old data migration/compatibility.

## Tool Map

- Project locator and overview: explicit `projectDir`/`cwd` or Project Service locator, then `domain_overview`. Use `projectUid` only for scoped backend candidate/decision metadata.
- Model discovery: `domain_get_model`.
- Query/read/status: `domain_overview`, `domain_query_entities`, `domain_query_settings`, `domain_query_assets`, `domain_query_production_context`, `domain_read_*`, `domain_production_status_summary`, and `domain_regeneration_plan` are CLI-backed through `movscript domain ... --json`; MCP responses should include reproducible `debug.cli_argv`.
- Project context: `domain_read_project_context_snapshot` for read-only context assembly; `domain_upsert_project_standards` only for explicit user-requested standard additions, removals, or edits.
- Structured writes: `domain_upsert_*`, `domain_update_*`, `domain_delete_entity`. These source writes are CLI-backed through `movscript domain source ... --json`; MCP responses should include reproducible `debug.cli_argv`, and write calls must include an explicit project locator or `projectUid` instead of UI focus. Use `domain_upsert_script` for script metadata plus `script.md` text; it is the default path for screenplay/source text writes. Use `domain_upsert_setting_state` for one setting state, `domain_upsert_setting_tree` for setting -> multiple states -> multiple assets writes, and `domain_upsert_timeline_namespace_tree` for new path-first timeline namespace trees. That tool treats path as the instance parent source, stores user vocabulary in `namespace_kind`, strips namespace content-unit/candidate state, and can write `scene_moment` plus expression/storyboard/keyframe/audio primitives under namespace paths. For a single new scene moment under a timeline namespace, call `domain_upsert_scene_moment` with `targetPath` or `namespacePath`; for expression/keyframe/storyboard/audio children, call their `domain_upsert_*` tools with `targetPath`, `sceneMomentPath`, or `expressionUnitPath`. `productionId`/`segmentId` are legacy compatibility inputs. Use `domain_upsert_production_tree` only as the legacy production/segment projection writer for older source flows. Tree upserts are merge/patch operations: omitted existing children are not deleted. For namespace-scope playback or final assembly, hand off to `production-editing` after source structure and selected materials are ready.
- Candidate writes: `domain_register_raw_resource_as_content_unit_candidate`, `domain_create_content_candidate`, batch content-candidate tools, `domain_decide_content_unit_candidate`, and content-unit selection tools write backend decision metadata. These 内容制作任务 candidate gates are CLI-backed through `movscript domain candidate ... --json`; MCP calls should return reproducible `debug.cli_argv`. Use raw-resource registration when a RawResource already exists and only needs to enter a 内容制作任务 candidate pool. Asset candidates must use `asset_ref` 内容制作任务. Inline candidate tools are no longer granted by the default domain skill; they remain CLI/MCP `temporary_fallback` compatibility APIs through `movscript domain candidate legacy ... --json` only for legacy asset/keyframe/source-entity migration.
- Candidate/selection writes for current UI projects must use scoped project-data through the domain candidate tools. Never recover from scoped-store errors by switching to top-level `movscript candidate ...`, `MOVSCRIPT_PROJECT_ID`, or legacy project decisions.
- Prefer `domain_decide_content_unit_candidate` when recording a user-facing generated-candidate choice. Use `decision: "adopt"` for 采纳, `decision: "reject"` for 放弃, and `decision: "defer"` for 待定. Use direct selection tools only for legacy or explicitly confirmed selection flows.
- Use `domain_production_status_summary` for a compact read of production prerequisites, 内容制作任务 candidate counts, selected resources, stale hints, and blockers before broad review or generation.
- For completed generated 内容制作任务 candidates, omit `status`; the backend defaults it to `succeeded`. If status is needed, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; do not use workflow words such as `completed`, `ready`, `selected`, or `accepted`.
- Interpreter steps: `domain_inspect`, `domain_interpret`, `domain_regeneration_plan`. `domain_review` is compatibility-only.
- `domain_compose_scene_moment_from_edit_plan` and `domain_compose_production_from_timeline` are not available editing paths. For video editing, use the `editing` skill and the `editing_*` tool family so timeline state runs through Editing Service and render/transcode/HLS execution runs through Media Pipeline when available.

## Edit Workflow

1. Resolve the intended source workspace from explicit user input, a passed `projectDir`/`project_dir`/`cwd`, or a Project Service locator. Do not infer it from UI focus. If project initialization, open/fetch state, or Project Service context is unclear, run the `project` skill's Project Management Gate before domain reads or writes.
2. For project-scoped planning, 内容制作任务, generation, or style-sensitive work, call `domain_read_project_context_snapshot` before designing or changing source. Treat missing standards as context gaps to mention, not permission to edit.
3. Query existing context with `domain_query_*` or read derived artifact context with `domain_read_*`. When story, continuity, character, beat, or dialogue context is unclear, read the script source before guessing or asking for details the script may already contain.
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
- Resource binaries, backend database state, or generation tool runtime records.

## Rules

- APIs first, source files second. Direct file editing is a controlled fallback, not the default write path.
- Always pass `projectDir`/`cwd` to project-scoped source tools, include `projectUid` when backend candidate/decision metadata is involved, and never use user or organization identity as a project routing shortcut.
- Read `domain_read_project_context_snapshot` before project-scoped creative work that may depend on house style or constraints. Do not call `domain_upsert_project_standards` merely because the snapshot has missing fields.
- Read existing script source before executing project-scoped creative work with unclear story, continuity, character, beat, or dialogue context. Prefer the script over UI focus, recent chat fragments, or generated artifacts when reconstructing project story intent.
- Use `domain_upsert_script` for screenplay/source text changes. Do not hand-edit `scripts/**/script.json` and `script.md` unless no structured API covers the change and `domain_get_model` has returned the source scope.
- During brainstorming or deep discussion, use `domain_read_script_source` then `domain_upsert_script` to capture durable user-authored inspiration before downstream structure, prompt, or generation work. Keep confirmed story facts separate from exploratory/候选/待定 ideas and rejected ideas.
- Snapshot script versions/blocks with `domain_snapshot_script_version` when story beats, concrete materials, or internal output tasks need stable references back to script text.
- Do not store transient task notes, provider job state, resource URLs, binaries, or unconfirmed guesses in scripts.
- Use `domain_upsert_project_standards` only when the user explicitly asks to add, remove, refine, replace, or otherwise change project standards. After changing standards, run `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan` when downstream content may be affected.
- For `domain_upsert_setting`, `domain_upsert_setting_state`, and `domain_upsert_asset`, put the data to write under `payload`; `record` and `entity` are existing-context objects, not the write body. For setting -> states -> assets authoring, prefer `domain_upsert_setting_tree`.
- Before calling `domain_upsert_setting`, check that the payload describes a concrete screenplay/production entity, including a character/person, reusable location/scene space/set, prop, costume, instrument, or voice identity, not a style/rule/task. Before calling `domain_upsert_asset`, check that the asset belongs under a named `setting_state` and describes one asset slot for that state.
- Do not create or select ordinary asset candidates through `asset.json` inline candidate arrays. Create an `asset_ref` 内容制作任务 for the asset and write/select candidates through the standard candidate tools so frontend, MCP, stale checks, and decision history stay aligned.
- When writing downstream `edit_prompt` text that should use a selected asset, storyboard, keyframe, or audio cue as a tracked dependency, reference it with semantic prompt-ref syntax, such as `{{asset::hero_base}}`, `{{storyboard::opening_panel}}`, or `{{audio_cue::phone_vibration}}`. If the user only needs raw resources as loose model references, use direct resource refs or generation `input_resource_ids` / `reference_resource_ids`.
- Do not replace semantic prompt refs with raw resource numbers before compilation. Use raw resource refs only when the resource is intentionally a loose input or explicit `{{resource::123}}`.
- If a direct edit is needed, call `domain_get_model` first and edit only the returned source scope.
- After completing any user request that changes domain source, run `domain_inspect` and then `domain_interpret` when diagnostics pass and derived domain artifacts should be refreshed. After content candidate, decision, or selection writes, run `domain_interpret` when downstream artifact tools need the latest backend decision metadata.
- Do not interpret for read-only review, draft-only analysis, or source states with blocking issues; state the reason when interpret is intentionally skipped.
- Do not store resource binaries, external provider URLs, or generation tool runtime state in domain JSON.
- Use stable ids and MovScript `resource_id` references for generated or uploaded media.
- Preserve user-facing review boundaries. Generated or edited data is not stable product state until the relevant source or backend decision metadata records adoption/selection and has been interpreted successfully.
- Do not use domain compose tools to satisfy ordinary cutting, trimming, stitching, or rendering requests. Domain tools may hand off context and record explicit candidates/decisions, but editing tools own timeline mutations and Media Pipeline tasks.
- Current specialized `content_unit_type` adapters for new work are `asset_ref`, `keyframe_ref`, `storyboard_ref`, `audio_cue_ref`, `scence_moment_ref` / `scene_moment_ref`, and `expression_unit_ref`. Legacy namespace-scope `content_unit` refs may appear in old source, but do not create them for new namespace-scope playback. Unknown types are valid generic production slots, but the interpreter does not track their upstream dependencies or stale state. Do not invent namespace-specific content unit types such as `episode_ref` or `beat_ref`; use a production editing workspace for assembled playback.
