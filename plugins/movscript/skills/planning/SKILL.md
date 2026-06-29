---
name: planning
description: "Plan MovScript production work in business terms: project context, production type or custom timeline vocabulary, script-derived beats, continuity references, scene beats, visual/audio materials, storyboard/keyframe evidence, and output tasks. Use only the needed internal source entities and domain tools for simple videos, reusable assets, custom structures, or larger productions."
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
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

Use this skill when a user asks to plan or change MovScript creative work: project standards, reusable characters/props/places/voices, story structure, scene beats, visual/audio/text materials, storyboard/keyframe references, or outputs to generate. Think like a production assistant first, then map the plan to MovScript internal entity names only when calling tools or editing source. If runtime ownership or service availability is unclear, use the `runtime` skill first.

## Planning Posture

- Start from the user's production goal and structure: quick draft, reusable reference, one scene beat, multiple beats, short-form video, film, episode, lesson, custom timeline, or finished production.
- Before creating a new production, clarify or infer the creative structure that matters: deliverable, source material, audience/platform, duration, review granularity, continuity/reuse needs, and whether the work fits a known production type or needs custom timeline vocabulary.
- Use user-facing words in analysis and replies: project context, continuity reference, scene beat, visual material, storyboard, keyframe, output task, generated option, adopted choice, and impact review.
- Use current `movscript-lang` entity names only in tool calls, source edits, and concise diagnostics. Chinese/product terms are not separate source entities.
- Prefer the smallest useful plan. Add continuity references, storyboards, keyframes, or expression materials only when they protect consistency, clarify the shot, or unblock generation.

## Rules

- When a planning, prompt, impact, candidate, preview timeline, or project-status MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it for the next planning/review action.
- Describe the page's purpose: edit/save a content-unit prompt, review missing selections, inspect stale impact, compare candidates, or inspect preview/project readiness. A URL handoff is not itself a completed user decision.
- If secondary surfaces are returned, lead with the primary `surface.url` and mention secondary URLs only when they help the next decision. Use URLs exactly as returned.
- Planning decides the output scope and prerequisite structure; domain tools perform the source writes, readiness checks, diagnostic refresh, and impact review.
- Planning depends on Project Service and Data Service runtime capabilities. If project/domain tools fail because a service endpoint is missing, call `movscript_runtime_status`, classify local daemon, cloud/external data plane, or basic/diagnostic mode, and report the missing capability instead of changing source files directly.
- Before project-scoped planning, call `domain_read_project_context_snapshot`. Use its aspect ratio, style, prompt rules, negative rules, and style references as upstream context for planning decisions.
- If the snapshot reports missing project standards, mention the gap only when it matters to the user's goal. Do not add default standards unless the user explicitly asks to add, remove, or adjust project standards.
- Open `references/video-production-paths.md` when mapping a requested video into concept-short, long-video, image-driven, or storyboard-driven MovScript structure. Open `references/planning-workflows.md` when deciding planning depth, project-vs-simple-video scope, prerequisite ordering, continuity structure, or reference-shot imitation prerequisites. Open `../generation/references/continuity-asset-prompts.md` when planning reusable asset prompts or deciding how an `asset_ref` should stay reusable.
- Open `../domain/references/entity-glossary.md` or `references/entity-mapping.md` when mapping user terms to source entities.
- Start planning by deciding the output/scope granularity: one short direct scene-beat output (`scene_moment`), one composed scene beat from materials, multiple scene beats, or a timeline namespace scope that needs a `timeline_assembly_ref` output.
- Treat built-in production types and timeline templates as planning aids, not constraints. If `video`, `film`, `episode`, or `lesson` does not express the user's creative structure, use `custom` timeline vocabulary and name the user's internal layers explicitly.
- Do not force new work into legacy `production -> segment` language. For new nontrivial or custom structures, use `domain_upsert_timeline_namespace_tree` and store user vocabulary in `namespace_kind` / `timeline_namespace_kind`; use legacy production/segment writers only for compatibility or older source flows.
- Custom timeline namespace nodes organize scope and review granularity; they are not generated resources and do not own candidates or selections. Keep makeable work in system primitives such as `scene_moment`, `expression_unit`, `storyboard`, `keyframe`, `asset`, and `content_unit`.
- Treat `scene_moment` as the scene beat users understand. Treat `expression_unit` as visual/audio/text/dialogue material inside that scene beat.
- Keep each `scene_moment` as a short atomic video beat, normally no longer than about 10 seconds. If the requested beat is longer, has multiple location/time changes, or contains several independently reviewable actions, split it into finer `scene_moment` records instead of hiding the whole span in one prompt.
- Default to one direct `scene_moment_ref` content unit only for a coherent short scene-moment video. For longer or multi-beat requests, plan multiple short scene moments and generate/approve each before editing composition.
- Before ordinary scene-moment video production, prefer planning a `storyboard_ref` content unit per scene moment and generating schematic storyboard panels with `gpt-image-2` through the generation skill. Storyboard images should be composition/blocking diagrams or stylized animatic frames; avoid photoreal real-person likenesses and do not make them final character portrait references.
- When content units are created from script text, plan enough analyzed scene detail for downstream prompts: story beat, characters/entities, setting, visible action, blocking, camera intent, lighting, audio/performance, and continuity notes. Do not let a `content_unit.edit_prompt` become a pasted script excerpt; generation should convert the analysis into the correct output-type prompt.
- For image content units such as `storyboard_ref`, `keyframe_ref`, `asset_ref`, product/prop, environment, or image-edit slots, plan the prompt as a single-frame image brief: purpose, subject, composition, setting, lighting, style, continuity refs, and restrictions. Do not use video-style action timelines except to identify one frozen moment.
- Create or update canonical upstream source entities before creating downstream content units, but only create the prerequisite structure needed for the user's current goal.
- Treat visual shots, dialogue, narration, subtitles, sfx, music, ambience, and interaction beats as `expression_unit` records with orthogonal `modality` and `role` fields. Storyboards and keyframes are optional evidence for visual expression units, not the final design center.
- Treat setting/state/asset as continuity evidence only when reuse or consistency matters. `setting` must be a concrete film/music production entity to be made or reused, such as `主角-老张`, `道具-玉玺`, a place, an instrument, a costume, or a voice identity; do not use it for abstract styles, rules, moods, genres, or one-off prompt notes.
- Treat `setting_state` as a namespace under one setting for a named condition/version of that entity, such as base look, wet hair, damaged prop, side-view variant, formal costume, calm voice, or angry voice.
- Treat `asset` as a setting-state-owned resource slot describing one state asset, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. Asset reference images should usually be white-background or clean-background, multi-view when useful, and weakly tied to plot.
- Asset is a carrier for content-unit work, not a separate candidate mechanism. When a concrete reusable entity or one of its states will appear in more than one generation task, or when the user is dissatisfied with its appearance or sound, stop downstream generation and stabilize it first as `setting` / `setting_state` / `asset` plus an `asset_ref` content unit with an adopted/selected candidate.
- Treat setting, asset, keyframe, and storyboard as auxiliary evidence produced on demand. Do not create or generate them just because a production exists; create them when the current output needs continuity, reusable identity, visual anchoring, or downstream dependency tracking.
- Treat keyframe/storyboard as optional visual evidence for a visual expression unit, not required ceremony for every generation. Their generated outputs still enter candidate/decision flow before becoming stable dependencies.
- When required asset, storyboard, keyframe, or audio cue candidates exist but are not adopted/selected, classify the work as `缺选择` and stop normal downstream generation planning. Guide the user to adopt/select one of the candidates; continue without adoption only when the user explicitly asks for an unstable draft.
- When composition, blocking, camera movement, subject placement, or shot rhythm matters but the user's request is underspecified, plan storyboard panels first and require user/workflow confirmation before generating keyframes or downstream video.
- Treat content units as top-level output tasks with flat refs. Do not nest output-task semantics under storyboard paths.
- When a downstream content unit should use a selected upstream asset/storyboard/keyframe/audio cue/reference as a tracked dependency, put a semantic prompt ref in `edit_prompt`, such as `{{asset::hero_base}}`, `{{storyboard::opening_panel}}`, `{{keyframe::shot_start}}`, or `{{audio_cue::phone_vibration}}`. Prompt compilation resolves the selected upstream candidate to a resource mention; the planning source should preserve the semantic ref. If the user only needs loose raw-resource guidance, direct RawResource IDs can be passed to generation without creating semantic refs.
- If the user wants a fast draft and consistency requirements are low, it is valid to create a short scene-moment-level content unit directly and generate without expression-unit breakdown. Use `content_unit_type: scene_moment_ref`, `target_kind: scene_moment`, and `target_ref` for the scene moment.
- When the scene moment needs multiple materials, create expression-unit-level content units with `content_unit_type: expression_unit_ref`, `target_kind: expression_unit`, and `target_ref` for each visual, voice, subtitle, or audio material.
- Prefer specialized content unit types only when interpreter tracking is needed: `timeline_assembly_ref`, legacy `production_ref` / `segment_ref`, `asset_ref`, `keyframe_ref`, `storyboard_ref`, `audio_cue_ref`, `scene_moment_ref`, or `expression_unit_ref`. Use `timeline_assembly_ref`, not custom namespace ref types such as `episode_ref` or `beat_ref`, when a timeline namespace scope needs an assembly video. Unknown `content_unit_type` values are valid generic slots but untracked for upstream hash/stale checks.
- Interpret after each coherent semantic planning step when downstream diagnostic/artifact tools need refreshed context, not after every field. Skip interpret for read-only planning, draft analysis, or blocking `domain_inspect` issues.
- Affected downstream content units require review, not automatic regeneration.

## Workflow

1. Resolve the intended project from explicit user input, a passed `projectId`/`project_id`, or a Project Service locator. Do not infer it from UI focus.
2. Call `domain_read_project_context_snapshot`, then `domain_overview`, then query existing continuity references, scripts, output tasks, and production context.
3. Open `references/video-production-paths.md`, then decide scope and granularity: simple one-off video or reusable project; known production type or custom timeline vocabulary; concept-driven, long-video, image-driven, or storyboard-driven path; one short direct `scene_moment`, one composed `scene_moment`, multiple scene moments, or a timeline namespace scope that needs `timeline_assembly_ref`.
4. Open `references/entity-mapping.md` when mapping product language or legacy terms to current entities.
5. If using script text as source material, read the script and snapshot script versions/blocks before downstream planning when stable script refs are needed.
6. Choose the working center: `scene_moment` for direct output, or `scene_moment` plus expression units for composed output. When the center comes from script text, analyze it into shootable scene details before creating downstream content-unit prompts.
7. Decide which evidence is needed for consistency: setting/state/asset for reuse, keyframe/storyboard for visual anchors, expression/audio for performance and sound. If an evidence item is not needed for the current goal, leave it uncreated.
8. Choose the path: direct short scene-moment generation, or multiple short scene moments plus editing composition when the request exceeds about 10 seconds or has several beats. Add schematic `gpt-image-2` storyboard panels before video generation unless the user explicitly wants a fast unstable draft.
9. Plan in dependency order only for the layers the chosen path needs: project standards only when explicitly requested, then settings, setting states, assets, timeline namespace nodes using project or custom vocabulary, scene moments, expression units, optional visual/audio anchors, and content units.
10. For continuity asset work, plan from the simplest stable identity/state asset toward more specific variants; each more complex asset should reference the user's selected simpler asset candidate.
11. For visual anchoring, plan storyboard panels before keyframes when composition is not fully specified; then plan start/end keyframes only after the storyboard candidate is adopted/selected.
12. For reference-shot imitation, plan frame extraction for inspection, materialized reference frame/contact-sheet RawResources when they will condition generation, shot analysis, storyboard panels, and a storyboard-panel content unit before downstream video generation.
13. Use `domain_get_model` before direct source fallback. Prefer `domain_upsert_*` tools for supported entities; use `domain_upsert_setting_state` for one state, `domain_upsert_setting_tree` for setting -> multiple states -> multiple assets writes, and `domain_upsert_timeline_namespace_tree` for new path-first timeline namespace structures. Use `domain_upsert_production_tree` only as the current legacy production/segment projection writer for older source flows. Tree upserts merge by id and do not delete omitted existing children. For namespace-scope video output, create an explicit `timeline_assembly_ref` content unit instead of relying on legacy `production_ref` / `segment_ref`.
14. After each coherent group of writes, run `domain_inspect`, fix blocking issues, then run `domain_interpret` when downstream artifact tools need refreshed context.
15. After interpret, run `domain_regeneration_plan` when changed planning source may affect selected outputs or downstream content units.

## Project Context Gate

Use this gate at the start of project-scoped planning.

- Read `domain_read_project_context_snapshot` before creating or changing productions, scene moments, expression units, content units, storyboards, keyframes, or reusable settings/assets.
- Treat project standards as a context harness, not ordinary setup ceremony. They constrain planning but should not be changed unless the user asks.
- If the user asks to add, remove, refine, replace, or normalize project-wide rules, use `domain_upsert_project_standards`, then run `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan` when downstream work may be affected.
- If the user asks for a fast draft and project standards are missing, continue with explicit caveats instead of blocking the planning flow.

## Continuity Asset Gate

Use this gate before downstream image/video generation when identity consistency matters.

- Trigger it when a concrete production entity or state, such as a person, place, prop, costume, makeup, instrument, voice identity, environmental state, or recurring visual/detail sound, will be reused across shots, scene moments, productions, or later edits.
- Trigger it when the user rejects, questions, or wants to refine the look or sound of a concrete entity/state. Treat the refinement as asset stabilization, not as another direct downstream generation attempt.
- Create or update the smallest needed `setting`, optional `setting_state`, and `asset` first; use `domain_upsert_setting_tree` when authoring multiple states/assets together; then create an `asset_ref` content unit for the reusable reference image.
- Generate/import asset candidates, record them as content-unit candidates, and wait for `adopt` or selection before using the asset as a stable dependency.
- Downstream prompts should reference the selected asset through `{{asset::id}}` when continuity/dependency tracking matters. For one-off raw-resource guidance, a direct `{{resource::id}}` ref or generation resource-id input is fine.
- Build asset complexity in layers: base identity or shape, white-background/clean-background multi-view or reference sheet, state/costume/material/voice variants, then scene-specific references. Later layers should use the selected earlier layer as a reference image. Use `../generation/references/continuity-asset-prompts.md` for prompt structure and identity-vs-motion separation.
- Do not use an unselected asset candidate as a stable reference for keyframes, storyboards, or video. If usable candidates exist, recommend adoption/selection and wait. Continue only as an explicit unstable draft path requested by the user.

## Visual Anchor Gate

Use this gate before video generation when the visual expression unit's arrangement is still ambiguous.

- Trigger it when the user cares about composition, framing, blocking, camera motion, subject placement, timing, or shot rhythm but has not described enough detail to make the output unambiguous.
- Trigger it by default before scene-moment video generation when the scene is not already backed by selected storyboard/keyframe evidence. Use `gpt-image-2` storyboard candidates as schematic composition guides, not photoreal human portrait sources.
- Create or update the visual `expression_unit` first, then create `storyboard` structure and a `storyboard_ref` content unit for storyboard panels/images when panel evidence is needed.
- Ask for or wait for adoption/selection of the storyboard candidate before generating keyframe candidates.
- Downstream keyframe/video prompts should reference adopted storyboard candidates through `{{storyboard::id}}`, letting prompt compilation resolve the chosen storyboard resource.
- After storyboard selection, create `keyframe_ref` content units for required visual anchors such as the start frame and end frame; require adoption/selection for each keyframe that downstream video depends on.
- Generate the final video through `expression_unit_ref` materials or direct `scene_moment_ref` only after required selected storyboards/keyframes/assets are available. If candidates exist but are unselected, guide the user to adopt/select before proceeding. Continue without them only when the user explicitly asks for an unstable draft.

## Readiness

When reporting planning state, briefly classify the focused scene_moment or expression unit:

- `缺规划`: missing narrative, expression, camera intent, continuity, references, or content unit anchors.
- `可补图`: scene/expression direction is clear, but keyframes, storyboards, reference assets, or audio anchors are insufficient for stable generation.
- `缺选择`: upstream asset/keyframe/storyboard-panel/reference candidates exist or are required, but no stable adoption/selection exists yet. `待定` and `放弃` candidates do not satisfy this gate.
- `可生成`: scene_moment, expression units, optional visual/audio evidence, and content unit inputs are clear enough to generate or select candidates.

Tie the recommendation to the user's intent: continue planning for story/camera questions, supplement keyframes/storyboards for visual anchoring, supplement audio cues for sound continuity, or generate only when the relevant content unit artifacts are ready.

## References

- Open `references/production-planning-examples.md` for multi-step production planning from loose story material.
- Open `references/video-production-paths.md` when converting Seedance-style A/B/C/D video paths into MovScript entities and content units.
- Open `references/planning-workflows.md` for scope selection, minimal prerequisite design, continuity planning, and reference-shot imitation planning.
- Open `references/content-unit-recipes.md` when creating content units or choosing between `timeline_assembly_ref`, legacy `production_ref` / `segment_ref`, `asset_ref`, `keyframe_ref`, `storyboard_ref`, `scene_moment_ref`, `expression_unit_ref`, and generic untracked slots.
