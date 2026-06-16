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
  - mcp__movscript__domain_read_production_timeline
  - mcp__movscript__domain_apply_production_timeline_commands
  - mcp__movscript__domain_compose_production_from_timeline
  - mcp__movscript__domain_read_scene_moment_edit_plan
  - mcp__movscript__domain_read_scene_moment_timeline
  - mcp__movscript__domain_apply_scene_moment_timeline_commands
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

Use this skill when the user asks to cut, compose, align, stitch, render, or automatically edit a MovScript scene moment or a whole production from generated or selected content-unit candidates.

## Concepts

- `scene_moment` is the final expression aggregation unit. It may be generated directly, or composed from selected expression-unit materials.
- `expression_unit` is a multimodal material intent inside a scene moment: visual shot material, dialogue, narration, subtitle, sfx, music, ambience, interaction, or metadata.
- `content_unit` is the generation task that creates candidates for a scene moment or expression unit.
- `edit_plan` is derived domain artifact context. It groups selected content-unit candidates into video, voice, subtitle, audio, image, and metadata tracks for a scene moment.
- `timeline_document` is an OpenCut-compatible MVP editing document derived from `edit_plan`. It is the handoff shape for UI or MCP agents to trim, split, move, delete, or insert timeline elements.
- Composition consumes selected RawResource IDs from `edit_plan.compose_inputs`. It does not accept unselected generated resources as stable materials.
- `domain_compose_scene_moment_from_edit_plan` is the default MVP render path: it composes the selected or edited video track, writes the scene-moment output candidate, and can optionally adopt it.
- `domain_read_production_timeline` is the production assembly path: it turns selected scene_moment output candidates into an OpenCut-compatible timeline for final ordering, trimming, and stitching.
- `domain_compose_production_from_timeline` writes the final production video as a candidate on a production output content unit.

## Workflow

1. Resolve focus with `system_focus_get` when the project or scene moment is ambiguous.
2. Use `domain_query_production_context` to find the target `scene_moment` and its content units when needed.
3. Run or request `domain_interpret` if content units, candidates, or selections changed and the current edit plan may be stale.
4. Call `domain_read_scene_moment_timeline` with `sceneMomentId` when the user needs cuts, trims, timing changes, or UI handoff. Call `domain_read_scene_moment_edit_plan` only for raw diagnostic inspection.
5. If `edit_plan.status` is `missing_selection`, stop and report blockers by content unit. Generate/select missing material candidates before composing.
6. Inspect `timeline_document.project.scenes[].tracks`. Use video track elements as primary picture. Current MVP composition preserves voice/audio/subtitle tracks in candidate metadata; strict multi-track mixing is a later composition capability.
7. Use `system_resource_video_probe` when you need durations before trimming or aligning.
8. Apply edits with `domain_apply_scene_moment_timeline_commands`. Supported command types include `update_element_trim`, `update_element_duration`, `update_element_start_time`, `move_element`, `split_elements`, `delete_elements`, and `insert_element`.
9. Prefer `domain_compose_scene_moment_from_edit_plan` with `sceneMomentId`, the scene-moment output `contentUnitId`, optional edited `timeline_document`, and `adopt: true` when the user wants the composed scene output selected immediately.
10. For whole-production editing, call `domain_read_production_timeline` with `productionId`. If it returns blockers, finish or select the blocked scene_moment output candidates first, then run `domain_interpret` and read the production timeline again.
11. Apply final assembly edits with `domain_apply_production_timeline_commands`, then call `domain_compose_production_from_timeline` with a `production_ref` video output `contentUnitId`, optional edited `timeline_document`, and `adopt: true` when the final video should be selected.
12. Use `system_resource_video_trim_to_resource`, `system_resource_video_concat_to_resource`, or `system_resource_video_compose_to_resource` only when you need manual resource-level drafts before writing a candidate.
13. Manual scene path: treat the composed RawResource as a new candidate for a scene-moment-level content unit such as `content_unit_type: scene_moment_ref`, `target_kind: scene_moment`, `target_ref: <scene_moment>`, `output_kind: video`, and `generation_role: composed_scene_moment`. For whole-production outputs, use `content_unit_type: production_ref`, `target_kind: production`, `target_ref: <production>`, `output_kind: video`, and `generation_role: composed_production`.
14. Run `domain_inspect` and `domain_interpret` after candidate/decision writes when downstream UI or agents must see the new selected scene-moment or production output.

## Rules

- Do not compose from candidates that are not selected unless the user explicitly asks for an unstable draft.
- Keep timeline edits in the OpenCut-compatible document until composition. Do not hand-edit `.interpret/**/edit_plan.json`; it is derived diagnostic output and will be regenerated.
- Do not use a direct scene-moment video candidate as proof that expression-unit materials were aligned. Direct scene-moment generation and composed scene-moment output are separate production strategies.
- Voice alignment is primarily an edit-plan/composition responsibility. The current MVP composes the picture track and records voice/subtitle/audio materials; lip-sync strictness requires the visual content unit to reference selected voice audio before video generation, or a later lip-sync/reanimation step.
- If one dialogue or narration spans multiple visual materials, generate/select the voice once from the verbal expression unit, then compose visual track items around that selected voice resource.
- Prefer composing at scene-moment scope first. Production-level final assembly should consume selected scene_moment output candidates through `domain_read_production_timeline`, not raw unselected shot or expression-unit materials.

## Output

When reporting an editing result, include:

- scene moment id and edit-plan status,
- production id when composing the whole product,
- composed resource id when created,
- target scene-moment or production content unit id,
- whether the composed candidate was adopted/selected,
- remaining blockers such as missing selections, stale selections, or missing resource ids.
