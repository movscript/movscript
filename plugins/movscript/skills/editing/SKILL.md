---
name: editing
description: Compose selected MovScript content-unit candidates into a scene_moment output using derived edit plans, video/audio resource tools, and final scene-moment candidate writes.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_resource_video_probe
  - mcp__movscript__system_resource_video_trim_to_resource
  - mcp__movscript__system_resource_video_extract_audio_to_resource
  - mcp__movscript__system_resource_video_compose_to_resource
  - mcp__movscript__system_resource_video_concat_to_resource
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_scene_moment_edit_plan
  - mcp__movscript__domain_compose_scene_moment_from_edit_plan
  - mcp__movscript__domain_derive_content_unit_artifact
  - mcp__movscript__domain_read_content_unit_generation_prompt
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Editing

Use this skill when the user asks to cut, compose, align, stitch, render, or automatically edit a MovScript scene moment from generated or selected content-unit candidates.

## Concepts

- `scene_moment` is the final expression aggregation unit. It may be generated directly, or composed from selected expression-unit materials.
- `expression_unit` is a multimodal material intent inside a scene moment: visual shot material, dialogue, narration, subtitle, sfx, music, ambience, interaction, or metadata.
- `content_unit` is the generation task that creates candidates for a scene moment or expression unit.
- `edit_plan` is derived domain artifact context. It groups selected content-unit candidates into video, voice, subtitle, audio, image, and metadata tracks for a scene moment.
- Composition consumes selected RawResource IDs from `edit_plan.compose_inputs`. It does not accept unselected generated resources as stable materials.
- `domain_compose_scene_moment_from_edit_plan` is the default MVP path: it composes the selected video track, writes the scene-moment output candidate, and can optionally adopt it.

## Workflow

1. Resolve focus with `system_focus_get` when the project or scene moment is ambiguous.
2. Use `domain_query_production_context` to find the target `scene_moment` and its content units when needed.
3. Run or request `domain_interpret` if content units, candidates, or selections changed and the current edit plan may be stale.
4. Call `domain_read_scene_moment_edit_plan` with `sceneMomentId`.
5. If `edit_plan.status` is `missing_selection`, stop and report blockers by content unit. Generate/select missing material candidates before composing.
6. Inspect `edit_plan.tracks`. Use video track items as primary picture. Current MVP composition preserves voice/audio/subtitle tracks in candidate metadata; strict multi-track mixing is a later composition capability.
7. Use `system_resource_video_probe` when you need durations before trimming or aligning.
8. Prefer `domain_compose_scene_moment_from_edit_plan` with `sceneMomentId`, the scene-moment output `contentUnitId`, and `adopt: true` when the user wants the composed output selected immediately.
9. Use `system_resource_video_trim_to_resource`, `system_resource_video_concat_to_resource`, or `system_resource_video_compose_to_resource` only when you need manual in/out adjustments before writing a candidate.
10. Manual path: treat the composed RawResource as a new candidate for a scene-moment-level content unit such as `target_kind: scene_moment`, `target_ref: <scene_moment>`, `output_kind: video`, and `generation_role: composed_scene_moment`.
11. Run `domain_inspect` and `domain_interpret` after candidate/decision writes when downstream UI or agents must see the new selected scene-moment output.

## Rules

- Do not compose from candidates that are not selected unless the user explicitly asks for an unstable draft.
- Do not use a direct scene-moment video candidate as proof that expression-unit materials were aligned. Direct scene-moment generation and composed scene-moment output are separate production strategies.
- Voice alignment is primarily an edit-plan/composition responsibility. The current MVP composes the picture track and records voice/subtitle/audio materials; lip-sync strictness requires the visual content unit to reference selected voice audio before video generation, or a later lip-sync/reanimation step.
- If one dialogue or narration spans multiple visual materials, generate/select the voice once from the verbal expression unit, then compose visual track items around that selected voice resource.
- Prefer composing at scene-moment scope. Segment or production-level final assembly can concatenate selected scene-moment outputs later.

## Output

When reporting an editing result, include:

- scene moment id and edit-plan status,
- composed resource id when created,
- target scene-moment content unit id,
- whether the composed candidate was adopted/selected,
- remaining blockers such as missing selections, stale selections, or missing resource ids.
