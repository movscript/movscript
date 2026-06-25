# Content Unit Recipes

Content units are top-level project production tasks. They are not generated resources, candidates, selections, or production hierarchy nodes.

Final-shape production centers on `scene_moment`:

- `scene_moment` is the final expression aggregation unit and can be generated directly.
- `expression_unit` is multimodal material intent inside a scene moment: visual shot material, dialogue, narration, subtitle, sfx, music, ambience, interaction, or metadata.
- `content_unit` generates candidates for either a complete `scene_moment` or one `expression_unit` material.
- `edit_plan` composes selected content-unit candidates back into the scene moment output.

Create the necessary upstream structure first, then create the content unit. Do not invent all shots, storyboards, keyframes, assets, expression units, or audio cues just to fill a content unit. Use the smallest structure that supports the user's current goal.

## Specialized Types

- `asset_ref`: image output, requires `asset_ref`. Use to stabilize a reusable concrete production entity or state asset, such as a character, prop, place, instrument, costume, voice identity, front view, side view, material reference, or tone reference.
- `keyframe_ref`: image output, uses `scene_moment_ref`, `expression_unit_ref`, `storyboard_ref`, and `keyframe_ref` or `keyframe_refs`. Use to stabilize visual anchors for a visual expression unit or storyboard.
- `storyboard_ref`: image output, requires `storyboard_ref`. Use to stabilize storyboard panels/images for composition, blocking, timing, and shot rhythm before keyframes or final video.
- `production_ref`: video output, targets one complete production. Prefer `target_kind: production`, `target_ref`, and `production_ref` for new final production records. Use for the selected final assembly candidate produced by production timeline composition.
- `segment_ref`: video output, targets a segment-level video. Prefer `target_kind: segment`, `target_ref`, and `segment_ref` for new segment assembly records.
- `scene_moment_ref` / legacy `scence_moment_ref`: video output, targets one complete scene moment. Prefer `target_kind: scene_moment` and `target_ref` for new records. Use when directly generating one complete scene moment video without material breakdown first.
- `expression_unit_ref`: output kind may be video, audio, text, image, or metadata. Prefer `target_kind: expression_unit` and `target_ref` for new records. Use for visual material, voice material, subtitle text, sfx/music/ambience, or interaction metadata that will later be composed by an edit plan.
Unknown `content_unit_type` values are valid generic slots, but interpreter adapters do not collect upstream dependencies, hash source refs, mark selections stale, or include them in regeneration planning.

Legacy source may still contain `shot_ref` content units. Do not create them for new plans; use `expression_unit_ref` for camera-unit visual material.

For storyboard-panel upload after reference-shot imitation, use a clearly named generic type such as `storyboard_panel_ref` or `storyboard_upload_ref` until a specialized adapter exists. State that it is for storyboard-panel upload/candidate/selection, not final video generation.

## Asset References

`asset_ref` output should usually be reusable and weakly tied to plot:

- prefer plain white or very clean background images,
- prefer multi-view or reference-sheet style when useful,
- show identity, state, costume, makeup, prop shape, material, voice/tone identity, or instrument character,
- avoid complex scene lighting, one-off action, specific plot blocking, or final-shot composition.

Put story lighting, camera composition, action, and scene-specific mood in `keyframe` or `storyboard`, not in `asset`.

When a reusable visual entity appears in multiple generation tasks, or when the user is dissatisfied with its appearance, treat asset stabilization as a gate:

```text
setting / setting_state / asset
-> asset_ref content unit
-> generated/imported asset candidates
-> user/workflow adopts or selects a stable candidate
-> downstream keyframe/storyboard/video references
```

Build asset candidates from simple to complex. Start with base identity, neutral shape, material, tone, or layout; then use the selected base asset to generate white-background/clean-background multi-view/reference-sheet versions and state variants such as costume, makeup, weather, damage, wet hair, prop wear, or voice mood. Do not use unselected asset candidates as stable downstream references.

## Scene Moments and Expression Units

Fast direct scene generation:

```text
scene_moment
-> scene_moment_ref content unit with target_kind=scene_moment
-> generated/imported video candidates
-> user/workflow selects final scene-moment video candidate
```

Composed scene generation:

```text
scene_moment
-> expression_unit(modality=visual, role=shot)
-> expression_unit(modality=verbal, role=dialogue/narration)
-> expression_unit(modality=audio, role=sfx/music/ambience)
-> expression_unit_ref content units for each needed material
-> generated/imported material candidates
-> user/workflow selects material candidates
-> interpreted edit_plan groups selected resources into tracks
-> editing_project_create_from_edit_plan creates a MediaEditingProject
-> editing_timeline_* adjusts tracks/clips when needed
-> editing_task_render_create renders through Media Pipeline when render capability is available
-> editing_export_import_resource uploads the finished local export
-> editing_export_create_candidate explicitly writes the RawResource-backed scene-moment video candidate
-> HLS MediaStreamArtifact outputs stay hosted previews until domain candidate schema supports stream outputs
```

Use the editing path when cross-shot voice, subtitles, sound design, visual consistency, or local regeneration matters. `domain_compose_scene_moment_from_edit_plan` is not an available product editing path.

## Storyboards and Keyframes

Use storyboard panels before keyframes when the user has composition, blocking, camera, placement, or rhythm expectations but has not specified enough detail.

```text
shot intent
-> storyboard_ref content unit for panels/images
-> user/workflow adopts or selects storyboard candidate
-> keyframe_ref content units for start/end or other required anchors
-> user/workflow adopts or selects required keyframe candidates
-> expression_unit_ref visual-material content unit, or direct scene_moment_ref content unit
```

`storyboard_ref` is for storyboard panels/images, not the final video output. Final video should normally be a scene-moment content unit or an expression-unit visual-material content unit that references selected storyboard/keyframe/asset outputs when those are required for stable continuity.

## Flat Refs

Current source supports these flat refs on content units:

- `scene_moment_ref`
- `production_ref`
- `segment_ref`
- `expression_unit_ref`
- `storyboard_ref`
- `keyframe_ref`
- `keyframe_refs`
- `audio_cue_ref`
- `audio_cue_refs`
- `expression_unit_refs`
- `asset_ref`

For generic untracked content units, these refs are source context only. They do not imply the interpreter will collect dependencies, update input hashes, mark selections stale, or include the slot in regeneration planning.

## Strong Consistency Path

```text
asset_ref content unit
-> generated/imported asset candidates
-> user/workflow selects stable asset candidate
-> storyboard_ref content unit when composition or rhythm must be confirmed
-> generated/imported storyboard panel candidates
-> user/workflow selects stable storyboard candidate
-> keyframe_ref content unit
-> generated/imported keyframe candidates
-> user/workflow selects stable keyframe candidate
-> expression_unit_ref visual-material content unit or scene_moment_ref content unit
-> generated/imported video candidates
-> user/workflow selects final video candidate
```

Use this path when cross-shot or cross-scene continuity matters.

Do not start a downstream stage until the required upstream candidate has been selected. A generated candidate is not a stable dependency until it has a selection. If usable asset, storyboard, or keyframe candidates already exist but none is selected, stop and ask the user to adopt/select one before planning or generating downstream content.

## Fast Exploration Path

For rapid exploration, create only the needed generic or specialized content unit and generate candidates quickly. A direct `scene_moment_ref` content unit is appropriate when the user wants a draft, a low-stakes one-off output, or a simple generation without reusable continuity.

Do not create setting, asset, keyframe, or storyboard prerequisites just to satisfy a formal chain. Add them only when they protect identity, style, scene continuity, camera intent, or downstream reuse.

Tell the user that generic slots and skipped asset/keyframe/storyboard stages trade consistency, reusable references, and stale tracking for speed.

If the user explicitly asks for an unstable draft path with missing upstream selection, state that the result is not a stable continuity dependency. Do not infer this exception from urgency or silence; recommend adoption/selection first.

## Checkpoint

After writing content units:

1. Run `domain_inspect` or `domain_review`.
2. Fix blocking issues.
3. Run `domain_interpret`.
4. Read dependency report, input version, selection validity, and runtime panel before generation.
