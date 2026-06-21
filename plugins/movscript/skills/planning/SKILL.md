---
name: planning
description: Plan only the needed MovScript production prerequisites, settings, scene moments, multimodal expression units, content units, and optional legacy visual anchors for simple videos or reusable projects.
toolGrants:
  - mcp__movscript__system_focus_get
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
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_production
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

Use this skill when a user asks to plan or change MovScript creative structure: settings, assets, productions, segments, scene moments, multimodal expression units, content units, or optional visual evidence.

## Rules

- Use current `movscript-lang` entity names in tool calls and source edits. Chinese product terms are user-facing aliases only.
- Planning decides the MovScript structure; domain tools perform the writes, `domain_inspect`, `domain_interpret`, and regeneration checks.
- Before project-scoped planning, call `domain_read_project_context_snapshot`. Use its aspect ratio, style, prompt rules, negative rules, and style references as upstream context for planning decisions.
- If the snapshot reports missing project standards, mention the gap only when it matters to the user's goal. Do not add default standards unless the user explicitly asks to add, remove, or adjust project standards.
- Open `references/planning-workflows.md` when deciding planning depth, project-vs-simple-video scope, prerequisite ordering, continuity structure, or reference-shot imitation prerequisites.
- Open `../domain/references/entity-glossary.md` or `references/entity-mapping.md` when mapping user terms to source entities.
- Start planning by deciding the production granularity: one direct `scene_moment` output, one composed `scene_moment` from expression materials, multiple scene moments, segments, or productions.
- Treat `scene_moment` as the final expression aggregation unit. Treat `expression_unit` as multimodal material intent inside the scene moment.
- Create or update canonical upstream source entities before creating downstream content units, but only create the prerequisite structure needed for the user's current goal.
- Treat visual shots, dialogue, narration, subtitles, sfx, music, ambience, and interaction beats as `expression_unit` records with orthogonal `modality` and `role` fields. Storyboards and keyframes are optional evidence for visual expression units, not the final design center.
- Treat setting/state/asset as continuity evidence only when reuse or consistency matters. `setting` must be a concrete film/music production entity to be made or reused, such as `主角-老张`, `道具-玉玺`, a place, an instrument, a costume, or a voice identity; do not use it for abstract styles, rules, moods, genres, or one-off prompt notes.
- Treat `setting_state` as a namespace under one setting for a named condition/version of that entity, such as base look, wet hair, damaged prop, side-view variant, formal costume, calm voice, or angry voice.
- Treat `asset` as a setting-state-owned resource slot describing one state asset, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. Asset reference images should usually be white-background or clean-background, multi-view when useful, and weakly tied to plot.
- When a concrete reusable entity or one of its states will appear in more than one generation task, or when the user is dissatisfied with its appearance or sound, stop downstream generation and stabilize it first as `setting` / `setting_state` / `asset` plus an `asset_ref` content unit with an adopted/selected candidate.
- Treat setting, asset, keyframe, and storyboard as auxiliary evidence produced on demand. Do not create or generate them just because a production exists; create them when the current output needs continuity, reusable identity, visual anchoring, or downstream dependency tracking.
- Treat keyframe/storyboard as optional visual evidence for a visual expression unit, not required ceremony for every generation. Their generated outputs still enter candidate/decision flow before becoming stable dependencies.
- When composition, blocking, camera movement, subject placement, or shot rhythm matters but the user's request is underspecified, plan storyboard panels first and require user/workflow confirmation before generating keyframes or downstream video.
- Treat content units as top-level project production slots with flat refs. Do not nest content unit semantics under storyboard paths.
- If the user wants a fast draft and consistency requirements are low, it is valid to create a scene-moment-level content unit directly and generate without expression-unit breakdown. Use `content_unit_type: scene_moment_ref`, `target_kind: scene_moment`, and `target_ref` for the scene moment.
- When the scene moment needs multiple materials, create expression-unit-level content units with `content_unit_type: expression_unit_ref`, `target_kind: expression_unit`, and `target_ref` for each visual, voice, subtitle, or audio material.
- Prefer specialized content unit types only when interpreter tracking is needed: `production_ref`, `segment_ref`, `asset_ref`, `keyframe_ref`, `storyboard_ref`, `scene_moment_ref`, or `expression_unit_ref`. Unknown `content_unit_type` values are valid generic slots but untracked for upstream hash/stale checks.
- Interpret after each coherent semantic planning step when downstream diagnostic/artifact tools need refreshed context, not after every field. Skip interpret for read-only planning, draft analysis, or blocking `domain_inspect` issues.
- Affected downstream content units require review, not automatic regeneration.

## Workflow

1. Resolve focus with `system_focus_get` when the selected project, production, or entity matters.
2. Call `domain_read_project_context_snapshot`, then `domain_overview`, then query existing settings, assets, scripts, and production context.
3. Decide scope and granularity: simple one-off video or reusable project; one direct `scene_moment`, one composed `scene_moment`, multiple scene moments, segments, or productions.
4. Open `references/entity-mapping.md` when mapping product language or legacy terms to current entities.
5. If using script text as source material, read the script and snapshot script versions/blocks before downstream planning when stable script refs are needed.
6. Choose the working center: `scene_moment` for direct output, or `scene_moment` plus expression units for composed output.
7. Decide which evidence is needed for consistency: setting/state/asset for reuse, keyframe/storyboard for visual anchors, expression/audio for performance and sound. If an evidence item is not needed for the current goal, leave it uncreated.
8. Choose the path: fast exploration through a direct scene-moment content unit, or composed production through expression-unit content units and an edit plan.
9. Plan in dependency order only for the layers the chosen path needs: project standards only when explicitly requested, then settings, assets, production, segments, scene moments, expression units, optional visual/audio anchors, and content units.
10. For continuity asset work, plan from the simplest stable identity/state asset toward more specific variants; each more complex asset should reference the user's selected simpler asset candidate.
11. For visual anchoring, plan storyboard panels before keyframes when composition is not fully specified; then plan start/end keyframes only after the storyboard candidate is adopted/selected.
12. For reference-shot imitation, plan frame extraction for inspection, materialized reference frame/contact-sheet RawResources when they will condition generation, shot analysis, storyboard panels, and a storyboard-panel content unit before downstream video generation.
13. Use `domain_get_model` before direct source fallback. Prefer `domain_upsert_*` tools for supported entities.
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
- Create or update the smallest needed `setting`, optional `setting_state`, and `asset` first; then create an `asset_ref` content unit for the reusable reference image.
- Generate/import asset candidates, record them as content-unit candidates, and wait for `adopt` or selection before using the asset as a stable dependency.
- Build asset complexity in layers: base identity or shape, white-background/clean-background multi-view or reference sheet, state/costume/material/voice variants, then scene-specific references. Later layers should use the selected earlier layer as a reference image.
- Do not use an unselected asset candidate as a stable reference for keyframes, storyboards, or video. Continue only as an explicit unstable draft path.

## Visual Anchor Gate

Use this gate before video generation when the visual expression unit's arrangement is still ambiguous.

- Trigger it when the user cares about composition, framing, blocking, camera motion, subject placement, timing, or shot rhythm but has not described enough detail to make the output unambiguous.
- Create or update the visual `expression_unit` first, then create `storyboard` structure and a `storyboard_ref` content unit for storyboard panels/images when panel evidence is needed.
- Ask for or wait for adoption/selection of the storyboard candidate before generating keyframe candidates.
- After storyboard selection, create `keyframe_ref` content units for required visual anchors such as the start frame and end frame; require adoption/selection for each keyframe that downstream video depends on.
- Generate the final video through `expression_unit_ref` materials or direct `scene_moment_ref` only after required selected storyboards/keyframes/assets are available, unless the user explicitly accepts an unstable draft.

## Readiness

When reporting planning state, briefly classify the focused scene_moment or expression unit:

- `缺规划`: missing narrative, expression, camera intent, continuity, references, or content unit anchors.
- `可补图`: scene/expression direction is clear, but keyframes, storyboards, reference assets, or audio anchors are insufficient for stable generation.
- `缺选择`: upstream asset/keyframe/storyboard-panel/reference candidates exist or are required, but no stable adoption/selection exists yet. `待定` and `放弃` candidates do not satisfy this gate.
- `可生成`: scene_moment, expression units, optional visual/audio evidence, and content unit inputs are clear enough to generate or select candidates.

Tie the recommendation to the user's intent: continue planning for story/camera questions, supplement keyframes/storyboards for visual anchoring, supplement audio cues for sound continuity, or generate only when the relevant content unit artifacts are ready.

## References

- Open `references/production-planning-examples.md` for multi-step production planning from loose story material.
- Open `references/planning-workflows.md` for scope selection, minimal prerequisite design, continuity planning, and reference-shot imitation planning.
- Open `references/content-unit-recipes.md` when creating content units or choosing between `production_ref`, `segment_ref`, `asset_ref`, `keyframe_ref`, `storyboard_ref`, `scene_moment_ref`, `expression_unit_ref`, and generic untracked slots.
