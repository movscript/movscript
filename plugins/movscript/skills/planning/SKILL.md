---
name: planning
description: "Plan MovScript production work in plain production language: project context, screenplay/script source, production structure, story beats, continuity references, shots, dialogue voice, narration voice, subtitles, sound effects, music, storyboard images, keyframe images, generated results, and next-step triage when the user is unsure what to do. Use internal source entities and project tools only as implementation details."
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__system_production_workflow
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_snapshot_script_version
  - mcp__movscript__domain_read_project_context_snapshot
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_setting_state
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_setting_tree
  - mcp__movscript__domain_upsert_production
  - mcp__movscript__domain_upsert_production_tree
  - mcp__movscript__domain_upsert_timeline_namespace_tree
  - mcp__movscript__domain_upsert_segment
  - mcp__movscript__domain_upsert_scene_moment
  - mcp__movscript__domain_upsert_keyframe
  - mcp__movscript__domain_upsert_storyboard
  - mcp__movscript__domain_upsert_expression_unit
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_update_entity_transition
  - mcp__movscript__domain_update_storyboard_timeline
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Planning

Use this skill when a user asks to plan or change MovScript creative work: project standards, durable script/story source, reusable characters/props/places/voices, story structure, story beats, shots, dialogue voice, narration voice, subtitles, sound effects, music, storyboard images, keyframe images, outputs to generate, or what to do next when the project feels unclear. Think like a production assistant first, then map the plan to MovScript internal names only when calling tools or editing source. If project locator, initialization, open/fetch state, or service availability is unclear, use the `project` skill's Project Management Gate before planning. If runtime ownership or service availability is unclear, use the `runtime` skill first.

## Production Contract

- Production step: planning content, including project context, continuity references, story beats, shots, dialogue/narration voice, subtitles, sound effects, music, storyboard images, keyframe images, and outputs before generation.
- Systems/config: Project Service/Data Service own source and project context; runtime/daemon supplies service readiness; admin/model config is only diagnosed, not changed, unless the user asks for admin work.
- Blockers: missing project locator, unresolved project initialization/open state, absent project standards when they matter, unclear scope/granularity, missing continuity reference, missing saved prompt backup for any planned generation, missing confirmed project style baseline for script-related visual generation, Project/Data service unavailable, or upstream plan not reviewable.
- Human review: require user confirmation before broad project standards changes, durable project/source writes beyond the requested scope, moving from plan to generation with unresolved assumptions, choosing MovScript for a generic text/image/video/audio generation request, or executing any generation task. Before generation, summarize the full context and wait for explicit confirmation; before calling a generation tool, confirm the specific tool task. This applies to images, 分镜图, 关键帧, reference assets, video, voice, music, sound effects, subtitles, free-scope generation, and external generation systems. Before script-related image/video generation, the user must also confirm a project style baseline saved in project standards: use a style prompt when the style is simple and unambiguous; generate style reference images from the style prompt and ask the user to choose when the style is special, composite, or ambiguous.
- Output: report planned scope, changed planning records, readiness class (`缺规划`, `可补图`, `缺选择`, `可生成`), review URL, and next step.
- CLI-only contract: use `bin/movscript production workflow --json` or MCP `system_production_workflow` when an agent or user needs the machine-readable four-stage production map (`plan_content`, `production_editing`, `generate`, `export`), blockers, review gates, and command handoffs without opening a frontend.

## Planning Posture

- Start from the user's production goal and structure: quick draft, reusable reference, one scene beat, multiple beats, short-form video, film, episode, lesson, custom timeline, or finished production.
- Before creating a new production, clarify or infer the creative structure that matters: deliverable, source material, audience/platform, duration, review granularity, continuity/reuse needs, and whether the work fits a known production type or needs custom timeline vocabulary.
- Use concrete user-facing words in analysis and replies: 剧情段落, 镜头画面, 台词语音, 旁白语音, 字幕, 音效, 音乐, 环境声, 分镜图, 关键帧, 角色/场景/道具/服装/声音参考, 生成结果, 采纳, and 复查.
- Do not expose internal buckets such as `domain`, `content unit`, `content_unit`, `expression unit`, `scene_moment`, `storyboard`, or `keyframe` in ordinary replies. Say 内容制作任务/制作项 for content_unit only when a generic label is needed, say 分镜图 for storyboard and 关键帧 for keyframe, and otherwise translate work into the exact item being made.
- When generated materials exist but are hard for a user to distinguish, open `../domain/references/resource-discoverability.md` and treat unclear names, missing purpose, missing placement, or unknown status as a planning gap before asking the user to choose.
- Before project-status, gap, blocker, or next-step replies, open `../domain/references/user-facing-response.md` so the user hears project meaning and choices instead of internal entity/tool/file details. Do not say "not a normal code repository" or list `project.json`, `settings/`, `timeline/`, or `content_units/`; translate those signals into story, references, prompts, generated results, choices, and editing readiness.
- Use current `movscript-lang` entity names only in tool calls, source edits, and concise diagnostics. Chinese/product terms are not separate source entities.
- Treat `scripts/**` as the durable screenplay and project story memory. When the user provides important story intent, dialogue, scene order, character motivation, recurring world facts, or project-level narrative decisions, write or update the script before deriving scene beats, concrete materials, 内容制作任务, or generation prompts. Tool-facing equivalent: write or update the script before deriving scene moments, expression units, content units, or generation prompts.
- When a project task has unclear story, continuity, character, beat, or dialogue context, read the existing script before asking the user or guessing. Ask only when the script is missing, contradictory, or the ambiguity changes the user's intent.
- Prefer the smallest useful plan. Add continuity references, 分镜图, 关键帧, or concrete shot/voice/sound materials only when they protect consistency, clarify the shot, or unblock generation.

## Script Capture Gate

Use this gate during creative exploration, not only before formal screenplay writing.

1. During brainstorming or deep discussion, treat durable user inspirations as script material: story premise, scene order, character motive, relationship turn, world fact, recurring motif, dialogue/narration line, ending idea, rejection, or unresolved option that may affect later planning or generation.
2. Do not let important project inspiration live only in chat. If the idea may affect later story, continuity, scene design, setting/reference design, prompt writing, or generation, read the current script first, merge the new inspiration, and write it with `domain_upsert_script` before deriving scene moments, expression units, content units, settings, assets, or generation prompts.
3. Preserve the user's wording when a phrase, image, line, or emotional logic may matter later. Summarize only to organize it; do not flatten a vivid inspiration into generic production language.
4. Label uncertain but useful ideas as exploratory/候选/待定, and keep rejected ideas separate from confirmed story facts. Do not promote agent guesses, temporary task notes, provider/job state, URLs, or resource filenames into script truth.
5. For a clearly user-authored idea inside an active project discussion, capture it and briefly report what was saved. For a major rewrite, inferred synthesis, or ambiguous choice among options, summarize the proposed script update and ask before writing.
6. After meaningful script capture, run `domain_inspect`; run `domain_snapshot_script_version` when downstream scene moments, expression units, or content units need stable script-block references.

## Project Direction Triage

Use this gate when the user is unsure what to do next, asks "现在项目到哪了", "下一步干什么", "帮我看看缺什么", "继续推进", or gives a vague project-progress request without a concrete deliverable.

First inspect state; do not write source or trigger generation before the user chooses a direction:

1. Resolve the project with the Project Management Gate if needed.
2. Read `domain_read_project_context_snapshot`, `domain_overview`, and the relevant production/entity/asset context. Read the script source when story, character, beat, dialogue, or narration status is unclear.
3. Build a short state map across the production chain:
   - Story/script: concept, screenplay, scene order, dialogue, narration, and unresolved story questions.
   - Continuity/reference design: reusable characters/persons, locations/scene spaces/sets, props, costumes, voice identities, named states, and selected/adopted reference materials.
   - Concrete production items: story beats, shot visuals, dialogue voice, narration voice, subtitles, sound effects, music, ambience, blocking, camera/performance/audio intent, 分镜图, 关键帧, and missing choices.
   - Prompt readiness: saved prompts for images, videos, voice, subtitles, sound, music, 分镜图, 关键帧, reusable asset references, style baseline, prompt clarity, and generation blockers.
   - Generated material and editing: generated versions, adopted selections, whether saved materials are named/understandable, stale impact, preview/editing workspace readiness, and whether enough selected material exists to assemble.
4. Identify the top one to three gaps. Prefer the earliest blocker in the chain, but mention a later option if it is already unblocked.
5. Ask the user to choose a next direction instead of asking an open-ended "what now".

Use this user-facing shape:

```text
我看了一下当前项目状态：
- [what exists / looks usable]
- [what is missing or unstable]

最明显的缺口：
1. [gap and why it blocks later work]
2. [optional gap]

我建议先 [recommended direction]，原因是 [short reason].
你想先走哪条？
A. 讨论剧情 / 写剧本
B. 推进角色、场景空间、道具、服装、声音等连续性参考
C. 推进具体制作内容（镜头画面、台词语音、旁白语音、字幕、音效、音乐、分镜图、关键帧）
D. 编写生成提示词
E. 调用生成工具生成 / 选择生成结果
F. 剪辑合成整个片子
```

Route the user's choice:

- A -> read/update script source first, then derive story beats and the concrete materials each beat needs.
- B -> use the Continuity Asset Gate for reusable references: characters/persons, locations/scene spaces/sets, props, costumes, voice identities, named states, and internal `asset_ref` output tasks.
- C -> plan concrete makeable items: shot visuals, dialogue voice, narration voice, subtitles, sfx/music/ambience, interaction, 分镜图, or 关键帧. Use the Visual Anchor Gate only when a shot needs 分镜图/关键帧 evidence.
- D -> create/update saved prompts for the concrete outputs; do not call generation tools.
- E -> switch to the `generation` skill after prompt/readiness context is clear, then call generation tools only after the full confirmation gate.
- F -> switch to `production-editing` only when enough adopted/selected materials exist, or explain which materials must be generated/selected first.

## Rules

- When a planning, prompt, impact, candidate, preview timeline, or project-status MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it for the next planning/review action.
- Describe the page's purpose: edit/save a generation prompt, review missing selections, inspect stale impact, compare generated results, or inspect preview/project readiness. A URL handoff is not itself a completed user decision.
- If secondary surfaces are returned, lead with the primary `surface.url` and mention secondary URLs only when they help the next decision. Use URLs exactly as returned.
- Planning may define concrete outputs, write/refine prompts, and compile readiness, but it must not execute generation. Before any generation tool or external generation system runs, summarize the full context and ask the user to confirm the specific generation task; before that confirmation summary, ensure the matching 内容制作任务 exists internally and its `edit_prompt` is written as the durable prompt backup.
- If the user asks generically to generate text, images, video, voice, music, sound effects, or other audio and has not chosen MovScript, stop before MovScript source writes or generation and ask whether to use MovScript or another available system such as LibTV. If they choose another system, hand off to that tool/skill when available rather than silently planning in MovScript.
- If the user chooses LibTV or another external generation system for a MovScript story beat, shot/dialogue/narration/subtitle/sound item, reusable asset, 分镜图, 关键帧, audio cue, project style prompt, or project style-reference batch, still plan the corresponding 内容制作任务 first and write/update its `edit_prompt` before handing off. The external result must later be uploaded as a RawResource and manually registered as that task's candidate when it targets project content.
- Planning decides the output scope and prerequisite structure; MovScript project tools perform the source writes, readiness checks, diagnostic refresh, and impact review.
- Planning depends on Project Service and Data Service runtime capabilities. If project/domain tools fail because a service endpoint is missing, call `movscript_runtime_status`, classify local daemon, cloud/external data plane, or basic/diagnostic mode, and report the missing capability instead of changing source files directly.
- Before project-scoped planning, call `domain_read_project_context_snapshot`. Use its aspect ratio, style, prompt rules, negative rules, and style references as upstream context for planning decisions.
- If the snapshot reports missing project standards, mention the gap only when it matters to the user's goal. Do not add default standards unless the user explicitly asks to add, remove, or adjust project standards.
- Use `domain_upsert_script` for screenplay/source text writes. Do not hand-edit script metadata and markdown unless no structured tool covers the change and `domain_get_model` has returned the source scope.
- Keep scripts for durable story material: screenplay text, scene order, dialogue, narration, recurring world/character intent, and project-level creative decisions. Do not store transient task notes, generation tool runtime state, provider URLs, resource binaries, or unconfirmed guesses in script source.
- After meaningful script changes, run `domain_inspect`; run `domain_snapshot_script_version` when downstream scene beats, concrete materials, or 内容制作任务 need stable script-block references.
- Open `references/video-production-paths.md` when mapping a requested video into concept-short, long-video, image-driven, or storyboard-driven MovScript structure. Open `references/planning-workflows.md` when deciding planning depth, project-vs-simple-video scope, prerequisite ordering, continuity structure, or reference-shot imitation prerequisites. Open `../generation/references/continuity-asset-prompts.md` when planning reusable asset prompts or deciding how an `asset_ref` should stay reusable.
- Open `../domain/references/entity-glossary.md` or `references/entity-mapping.md` when mapping user terms to source entities.
- Start planning by deciding the output/scope granularity: one short direct story-beat output, one composed story beat from materials, multiple story beats, or a timeline namespace scope that will later be assembled in a production editing workspace. Use internal ids such as `scene_moment` only when calling tools.
- Treat built-in production types and timeline templates as planning aids, not constraints. If `video`, `film`, `episode`, or `lesson` does not express the user's creative structure, use `custom` timeline vocabulary and name the user's internal layers explicitly.
- Do not force new work into legacy `production -> segment` language. For new nontrivial or custom structures, use `domain_upsert_timeline_namespace_tree` and store user vocabulary in `namespace_kind` / `timeline_namespace_kind`; use legacy production/segment writers only for compatibility or older source flows.
- Custom timeline namespace nodes organize scope and review granularity; they are not generated resources and do not own candidates or selections. Keep makeable work in system primitives such as `scene_moment`, `expression_unit`, `storyboard`, `keyframe`, `asset`, and `content_unit`, but translate them into concrete production words in ordinary replies.
- Treat `scene_moment` as the scene beat users understand. Treat `expression_unit` as visual/audio/text/dialogue material inside that scene beat.
- Do not map a reusable story place, scene space, set, or environment to `scene_moment` just because the user says "场景". In Chinese, "场景" may mean location/space; use `setting` for that. Use `scene_moment` only for the dramatic/action beat that happens there.
- Keep each `scene_moment` as a short atomic video beat, normally no longer than about 10 seconds. If the requested beat is longer, has multiple location/time changes, or contains several independently reviewable actions, split it into finer `scene_moment` records instead of hiding the whole span in one prompt.
- Default to one direct `scene_moment_ref` internal output task only for a coherent short story-beat video. For longer or multi-beat requests, plan multiple short story beats and generate/approve each before editing composition.
- Before ordinary scene-moment video production, prefer planning a `storyboard_ref` internal output task per scene moment and preparing schematic 分镜图 with `gpt-image-2` through the generation skill after full-context confirmation. 分镜图 should be composition/blocking diagrams or stylized animatic frames; avoid photoreal real-person likenesses and do not make them final character portrait references.
- When internal output tasks are created from script text, plan enough analyzed scene detail for downstream prompts: story beat, characters/entities, setting, visible action, blocking, camera intent, lighting, audio/performance, and continuity notes. Do not let a `content_unit.edit_prompt` become a pasted script excerpt; generation should convert the analysis into the correct output-type prompt.
- Treat the saved prompt as the required backup before calling a generation tool. Do not let MovScript, LibTV, or another external executor be the only place where the prompt exists; every project-scoped generation task should have an internal output task and saved `edit_prompt` first. Before the confirmation summary, ensure that output task exists and its `edit_prompt` is written as the durable prompt backup.
- For image 内容制作任务 such as `storyboard_ref`, `keyframe_ref`, `asset_ref`, product/prop, environment, or image-edit slots, plan the prompt as a single-frame image brief: purpose, subject, composition, setting, lighting, style, continuity refs, and restrictions. Do not use video-style action timelines except to identify one frozen moment.
- For script-related image or video generation, treat a confirmed project style baseline as a prerequisite. If the style is simple and unambiguous, write a reusable style prompt and save it to `visual_style` or `project_style.custom_rules[key=style_prompt]`. If the style is special, composite, uncommon, subjective, or ambiguous, plan a style-reference image batch generated from the style prompt; after the user chooses image(s), save the chosen RawResource IDs to `project_standards.json` through `domain_upsert_project_standards` under `project_style.custom_rules[key=style_reference_images]`.
- After a style baseline exists, every downstream saved prompt and generation prompt must cite and use it. Treat the `edit_prompt` as the saved prompt backup. Use the confirmed style prompt in all generated prompts for simple styles; use confirmed `style_reference_resource_ids` as global visual references for all supported image/video/分镜图/关键帧/asset generation when the style is special or ambiguous.
- Create or update canonical upstream source entities before creating downstream internal output tasks, but only create the prerequisite structure needed for the user's current goal.
- Treat visual shots, dialogue, narration, subtitles, sfx, music, ambience, and interaction beats as internal `expression_unit` records with orthogonal `modality` and `role` fields. 分镜图 and 关键帧 are optional evidence for visual shot work, not the final design center.
- Treat setting/state/asset as continuity evidence only when reuse or consistency matters. `setting` must be a concrete screenplay/production entity to be made or reused, such as a character/person, script location/scene space/set, prop, instrument, costume, voice identity, `主角-老张`, `场景-老张的厨房`, or `道具-玉玺`; do not use it for abstract styles, rules, moods, genres, or one-off prompt notes.
- Treat `setting_state` as a namespace under one setting for a named condition/version of that entity, such as base look, wet hair, damaged prop, side-view variant, formal costume, calm voice, or angry voice.
- Treat `asset` as a setting-state-owned resource slot describing one state asset, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. Asset reference images should usually be white-background or clean-background, multi-view when useful, and weakly tied to plot.
- Asset is a carrier for internal output-task work, not a separate candidate mechanism. When a concrete reusable entity or one of its states will appear in more than one generation task, or when the user is dissatisfied with its appearance or sound, stop downstream generation and stabilize it first as `setting` / `setting_state` / `asset` plus an `asset_ref` 内容制作任务 with an adopted/selected candidate.
- When the user asks for a group, batch, set, or all reference images for one `setting`, treat it as a setting reference set with one source-of-truth base asset. Do not plan parallel independent `asset_ref` generations from text. First plan and adopt/select the base identity, shape, material, layout, or voice asset; then create derivative `asset_ref` prompts that reference the base semantically, such as `{{asset::base_character}}`, `{{asset::base_room_layout}}`, or `{{asset::base_prop_shape}}`.
- When the setting is a reusable place, scene space, room, set, exterior location, stage, or environment, plan a scene reference pack: `base_scene_view` first, then `topdown_layout_ref`, then optional clean plate, corner/cardinal views, depth/line/control maps, material details, and state variants. The top-down layout is a structural reference derived from the adopted base scene, not an independent pretty image or a redesign.
- Treat setting, asset, keyframe, and storyboard as auxiliary evidence produced on demand. Do not create or generate them just because a production exists; create them when the current output needs continuity, reusable identity, visual anchoring, or downstream dependency tracking.
- Treat 关键帧/分镜图 as optional visual evidence for a visual shot, not required ceremony for every generation. Their generated outputs still enter candidate/decision flow before becoming stable dependencies.
- When required asset, 分镜图, 关键帧, or audio cue candidates exist but are not adopted/selected, classify the work as `缺选择` and stop normal downstream generation planning. Guide the user to adopt/select one of the candidates; continue without adoption only when the user explicitly asks for an unstable draft.
- When composition, blocking, camera movement, subject placement, or shot rhythm matters but the user's request is underspecified, plan 分镜图 first and require user/workflow confirmation before generating 关键帧 or downstream video.
- Treat `content_unit` records as internal top-level 内容制作任务 with flat refs. Do not nest output-task semantics under storyboard paths.
- When a downstream 内容制作任务 should use a selected upstream asset/storyboard/keyframe/audio cue/reference as a tracked dependency, put a semantic prompt ref in `edit_prompt`, such as `{{asset::hero_base}}`, `{{storyboard::opening_panel}}`, `{{keyframe::shot_start}}`, or `{{audio_cue::phone_vibration}}`. Prompt compilation resolves the selected upstream candidate to a resource mention; the planning source should preserve the semantic ref. If the user only needs loose raw-resource guidance, direct RawResource IDs can be passed to generation without creating semantic refs.
- If the user wants a fast draft and consistency requirements are low, it is valid to create a short story-beat-level 内容制作任务 directly and generate without expression-unit breakdown. Use `content_unit_type: scene_moment_ref`, `target_kind: scene_moment`, and `target_ref` for the scene moment.
- When the scene moment needs multiple materials, create material-level 内容制作任务 with `content_unit_type: expression_unit_ref`, `target_kind: expression_unit`, and `target_ref` for each visual, voice, subtitle, or audio material.
- Prefer specialized 内容制作任务 types only when interpreter tracking is needed: `asset_ref`, `keyframe_ref`, `storyboard_ref`, `audio_cue_ref`, `scene_moment_ref`, or `expression_unit_ref`. Legacy namespace-scope `content_unit` refs may exist in old source, but do not create them for new namespace-scope playback; create/open a production editing workspace instead. Unknown `content_unit_type` values are valid generic slots but untracked for upstream hash/stale checks.
- Interpret after each coherent semantic planning step when downstream diagnostic/artifact tools need refreshed context, not after every field. Skip interpret for read-only planning, draft analysis, or blocking `domain_inspect` issues.
- Affected downstream outputs require review, not automatic regeneration.

## Workflow

1. Resolve the intended source workspace from explicit user input, a passed `projectDir`/`project_dir`/`cwd`, or a Project Service locator. Do not infer it from UI focus. If the project is not clearly initialized, open/fetched, or able to return Project Service context, switch to the `project` skill's Project Management Gate before planning. Use project init/create only when the user explicitly asks or confirms.
2. Call `domain_read_project_context_snapshot`, then `domain_overview`, then query existing continuity references, scripts, output tasks, and production context. If the task depends on story context that is unclear, read the script source before planning downstream structure.
3. If the user's request is open-ended or they do not know what to do next, run Project Direction Triage before creating or changing source.
4. Open `references/video-production-paths.md`, then decide scope and granularity: simple one-off video or reusable project; known production type or custom timeline vocabulary; concept-driven, long-video, image-driven, or storyboard-driven path; one short direct `scene_moment`, one composed `scene_moment`, multiple scene moments, or a timeline namespace scope that will be assembled in a production editing workspace.
5. Open `references/entity-mapping.md` when mapping product language or legacy terms to current entities.
6. If the user provides important project-level story, screenplay, dialogue, or narrative decisions, read the existing script and update it with `domain_upsert_script` before downstream planning. If using script text as source material, read the script and snapshot script versions/blocks before downstream planning when stable script refs are needed.
7. Choose the working center: direct story-beat output, or a story beat plus concrete shot/voice/subtitle/sound items for composed output. When the center comes from script text, analyze it into shootable scene details before creating downstream saved prompts.
8. Decide which evidence is needed for consistency: setting/state/asset for reuse, keyframe/storyboard for visual anchors, expression/audio for performance and sound. If an evidence item is not needed for the current goal, leave it uncreated.
9. Choose the path: direct short story-beat generation, or multiple short story beats plus editing composition when the request exceeds about 10 seconds or has several beats. Add schematic `gpt-image-2` 分镜图 before video generation unless the user explicitly wants a fast unstable draft; this does not bypass the confirmed project style baseline prerequisite for script-related images/videos.
10. Plan in dependency order only for the layers the chosen path needs: project standards and confirmed style baseline when required for script-related visual generation, then settings, setting states, assets, timeline namespace nodes using project or custom vocabulary, scene moments, expression units, optional visual/audio anchors, and 内容制作任务.
11. For continuity asset work, plan from the simplest stable identity/state asset toward more specific variants; each more complex asset should reference the user's selected simpler asset candidate.
12. For visual anchoring, plan 分镜图 before 关键帧 when composition is not fully specified; then plan start/end 关键帧 only after the 分镜图 candidate is adopted/selected.
13. For reference-shot imitation, plan frame extraction for inspection, materialized reference frame/contact-sheet RawResources when they will condition generation, shot analysis, 分镜图, and a 分镜图 internal output task before downstream video generation.
14. Use `domain_get_model` before direct source fallback. Prefer `domain_upsert_*` tools for supported entities; use `domain_upsert_setting_state` for one state, `domain_upsert_setting_tree` for setting -> multiple states -> multiple assets writes, and `domain_upsert_timeline_namespace_tree` for new path-first timeline namespace structures. Use `domain_upsert_production_tree` only as the current legacy production/segment projection writer for older source flows. Tree upserts merge by id and do not delete omitted existing children. For namespace-scope playback or final assembly, hand off to `production-editing` after the scene moments/material 内容制作任务 are ready.
15. After each coherent group of writes, run `domain_inspect`, fix blocking issues, then run `domain_interpret` when downstream artifact tools need refreshed context.
16. After interpret, run `domain_regeneration_plan` when changed planning source may affect selected outputs or downstream 内容制作任务.

## Project Context Gate

Use this gate at the start of project-scoped planning.

- Read `domain_read_project_context_snapshot` before creating or changing productions, scene moments, expression units, 内容制作任务, storyboards, keyframes, or reusable settings/assets.
- If the project locator, initialization, open/fetch state, or Project Service context is unclear, run the `project` skill's Project Management Gate before reading snapshots or writing source.
- Treat project standards as a context harness, not ordinary setup ceremony. They constrain planning but should not be changed unless the user asks.
- If the user asks to add, remove, refine, replace, or normalize project-wide rules, use `domain_upsert_project_standards`, then run `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan` when downstream work may be affected.
- For script-related image or video generation, missing confirmed style baseline is a hard blocker. If the style is simple and unambiguous, summarize the proposed reusable style prompt, ask the user to confirm it, then save it in `project_standards.json` with `domain_upsert_project_standards` under `visual_style` or `project_style.custom_rules` key `style_prompt`, prompt_role `style`, enabled true.
- If the style is special, composite, uncommon, subjective, or ambiguous, generate style reference images from a style prompt and use the selected image(s) globally. The batch still needs a saved prompt, full-context confirmation, model/provider, candidate count, and adoption gate before generation.
- After the user chooses style reference image(s), save their RawResource IDs in `project_standards.json` with `domain_upsert_project_standards` under `project_style.custom_rules` key `style_reference_images`; include parseable IDs such as `reference_resource_ids: [123,456]` or `resource#123`, then run `domain_inspect` and `domain_interpret`.
- If the user asks for a fast draft and project standards are missing, continue with explicit caveats instead of blocking the planning flow, except that script-related image/video generation still cannot proceed without either a confirmed style prompt for simple styles or confirmed style reference images for special/ambiguous styles.

## Continuity Asset Gate

Use this gate before downstream image/video generation when identity consistency matters.

- Trigger it when a concrete production entity or state, such as a person, place, prop, costume, makeup, instrument, voice identity, environmental state, or recurring visual/detail sound, will be reused across shots, scene moments, productions, or later edits.
- Trigger it when the user asks for a set of references for one setting: all views, multi-view sheets, expression rows, state variants, costume variants, place angles, environment states, prop details, or similar batches.
- Trigger it when the user rejects, questions, or wants to refine the look or sound of a concrete entity/state. Treat the refinement as asset stabilization, not as another direct downstream generation attempt.
- Create or update the smallest needed `setting`, optional `setting_state`, and `asset` first; use `domain_upsert_setting_tree` when authoring multiple states/assets together; then create an `asset_ref` 内容制作任务 for the reusable reference image.
- Generate/import asset candidates, record them as generated options for the 内容制作任务, and wait for `adopt` or selection before using the asset as a stable dependency.
- Downstream prompts should reference the selected asset through `{{asset::id}}` when continuity/dependency tracking matters. For one-off raw-resource guidance, a direct `{{resource::id}}` ref or generation resource-id input is fine.
- Build asset complexity in layers: base identity or shape, white-background/clean-background multi-view or reference sheet, state/costume/material/voice variants, then scene-specific references. Later layers should use the selected earlier layer as a reference image. For a setting reference set, the base asset is the source of truth; derivative assets must cite it in `edit_prompt` with a semantic asset ref instead of repeating text descriptions. For a scene reference pack, require `base_scene_view` before `topdown_layout_ref`; later angle/detail/state assets should cite the base scene and selected top-down layout when available. Use `../generation/references/continuity-asset-prompts.md` for prompt structure, reference-set source-of-truth rules, scene reference pack rules, and identity-vs-motion separation.
- Do not use an unselected asset candidate as a stable reference for keyframes, storyboards, or video. If usable candidates exist, recommend adoption/selection and wait. Continue only as an explicit unstable draft path requested by the user.

## Visual Anchor Gate

Use this gate before video generation when the shot arrangement is still ambiguous.

- Trigger it when the user cares about composition, framing, blocking, camera motion, subject placement, timing, or shot rhythm but has not described enough detail to make the output unambiguous.
- Trigger it by default before story-beat video generation when the scene is not already backed by selected 分镜图/关键帧 evidence. Use `gpt-image-2` 分镜图 candidates as schematic composition guides, not photoreal human portrait sources.
- Create or update the visual shot intent first, then create internal storyboard structure and a `storyboard_ref` output task for 分镜图 when panel evidence is needed.
- Ask for or wait for adoption/selection of the 分镜图 candidate before generating 关键帧 candidates.
- Downstream keyframe/video prompts should reference adopted 分镜图 candidates through `{{storyboard::id}}`, letting prompt compilation resolve the chosen storyboard resource.
- After 分镜图 selection, create `keyframe_ref` output tasks for required visual anchors such as the start frame and end frame; require adoption/selection for each 关键帧 that downstream video depends on.
- Generate the final video through concrete shot materials or direct story-beat video only after required selected 分镜图/关键帧/assets are available. If candidates exist but are unselected, guide the user to adopt/select before proceeding. Continue without them only when the user explicitly asks for an unstable draft.

## Readiness

When reporting planning state, briefly classify the focused story beat or concrete output item:

- `缺规划`: missing story, shot, dialogue/narration, camera intent, continuity, references, or prompt anchors.
- `可补图`: the scene or shot direction is clear, but 关键帧, 分镜图, reference assets, or audio anchors are insufficient for stable generation.
- `缺选择`: upstream asset/关键帧/分镜图/reference candidates exist or are required, but no stable adoption/selection exists yet. `待定` and `放弃` candidates do not satisfy this gate.
- `可生成`: the story beat, concrete output items, optional visual/audio evidence, and prompt inputs are clear enough to summarize full generation context and ask for explicit confirmation; only after that confirmation may the agent call a generation tool.

Tie the recommendation to the user's intent: continue planning for story/camera questions, supplement 关键帧/分镜图 for visual anchoring, supplement audio cues for sound continuity, or summarize full generation context for confirmation when the relevant output prompts and references are ready.

## References

- Open `references/production-planning-examples.md` for multi-step production planning from loose story material.
- Open `references/video-production-paths.md` when converting Seedance-style A/B/C/D video paths into MovScript entities and 内容制作任务.
- Open `references/planning-workflows.md` for scope selection, minimal prerequisite design, continuity planning, and reference-shot imitation planning.
- Open `references/content-unit-recipes.md` when creating 内容制作任务 or choosing between `asset_ref`, `keyframe_ref`, `storyboard_ref`, `scene_moment_ref`, `expression_unit_ref`, legacy `content_unit` refs, and generic untracked slots.
