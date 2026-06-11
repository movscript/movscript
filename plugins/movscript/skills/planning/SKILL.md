---
name: planning
description: Plan MovScript productions, settings, scene moments, shots, keyframes, storyboards, expression units, audio cues, and content units using domain APIs, inspect/review, interpret checkpoints, and regeneration awareness.
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
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_production
  - mcp__movscript__domain_upsert_segment
  - mcp__movscript__domain_upsert_scene_moment
  - mcp__movscript__domain_upsert_shot
  - mcp__movscript__domain_upsert_keyframe
  - mcp__movscript__domain_upsert_storyboard
  - mcp__movscript__domain_upsert_audio_cue
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

Use this skill when a user asks to plan or change MovScript creative structure: settings, assets, productions, segments, scene moments, shots, keyframes, storyboards, expression units, audio cues, or content units.

## Rules

- Use current `movscript-lang` entity names in tool calls and source edits. Chinese product terms are user-facing aliases only.
- Planning decides the MovScript structure; domain tools perform the writes, inspect/review, interpret, and regeneration checks.
- Create or update canonical upstream source entities before creating downstream content units.
- Treat scene moments as narrative events, shots as camera units, keyframes/storyboards as shot-owned visual anchors/assets, and expression units/audio cues as scene-moment-owned planning objects.
- Treat content units as top-level project production slots with flat refs. Do not nest content unit semantics under storyboard paths.
- Prefer specialized content unit types only when interpreter tracking is needed: `asset_ref`, `keyframe_ref`, or `storyboard_ref`. Unknown `content_unit_type` values are valid generic slots but untracked for upstream hash/stale checks.
- Interpret after each coherent semantic planning step, not after every field. Skip interpret only for read-only planning, draft analysis, or blocking inspect/review issues.
- Affected downstream content units require review, not automatic regeneration.

## Workflow

1. Resolve focus with `system_focus_get` when the selected project, production, or entity matters.
2. Call `domain_overview`, then query existing settings, assets, scripts, and production context.
3. Open `references/entity-mapping.md` when mapping product language or legacy terms to current entities.
4. If using script text as source material, read the script and snapshot script versions/blocks before downstream planning when stable script refs are needed.
5. Plan in dependency order when possible: project standards, settings, assets, production, segments, scene moments, shots, keyframes, expression units, audio cues, storyboards, content units.
6. Use `domain_get_model` before direct source fallback. Prefer `domain_upsert_*` tools for supported entities.
7. After each coherent group of writes, run `domain_inspect` or `domain_review`, fix blocking issues, then run `domain_interpret`.
8. After interpret, run `domain_regeneration_plan` when changed planning source may affect selected outputs or downstream content units.

## Readiness

When reporting planning state, briefly classify the focused scene_moment or shot:

- `缺规划`: missing narrative, expression, camera intent, continuity, references, or content unit anchors.
- `可补图`: story/shot direction is clear, but keyframes, storyboards, reference assets, or audio anchors are insufficient for stable generation.
- `可生成`: scene_moment, shot, keyframes/storyboards/audio cues, and content unit inputs are clear enough to generate or select candidates.

Tie the recommendation to the user's intent: continue planning for story/camera questions, supplement keyframes/storyboards for visual anchoring, supplement audio cues for sound continuity, or generate only when the relevant content unit artifacts are ready.

## References

- Open `references/production-planning-examples.md` for multi-step production planning from loose story material.
- Open `references/content-unit-recipes.md` when creating content units or choosing between `asset_ref`, `keyframe_ref`, `storyboard_ref`, and generic untracked slots.
