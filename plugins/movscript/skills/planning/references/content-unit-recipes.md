# Content Unit Recipes

Content units are top-level project production tasks. They are not generated resources, candidates, selections, or production hierarchy nodes.

Create the necessary upstream structure first, then create the content unit. Do not invent all shots, storyboards, keyframes, assets, expression units, or audio cues just to fill a content unit. Use the smallest structure that supports the user's current goal.

## Specialized Types

- `asset_ref`: image output, requires `asset_ref`. Use to stabilize a reusable character, location, prop, style, or state asset.
- `keyframe_ref`: image output, uses `scene_moment_ref`, `shot_ref`, `storyboard_ref`, and `keyframe_ref` or `keyframe_refs`. Use to stabilize visual anchors for a shot or storyboard.
- `storyboard_ref`: video output, uses `scene_moment_ref`, `shot_ref`, `storyboard_ref`, and `keyframe_refs`. Use for storyboard-level continuous visual expression.
- `scence_moment_ref`: video output, uses a `{{scene_moment:id}}` primary prompt ref. Use when directly generating one complete scene moment video without committing to shot/storyboard breakdown first.
- `shot_ref`: video output, uses a `{{shot:id}}` primary prompt ref. Use when generating one camera unit directly, with optional upstream assets, keyframes, or storyboard references when consistency matters.

Unknown `content_unit_type` values are valid generic slots, but interpreter adapters do not collect upstream dependencies, hash source refs, mark selections stale, or include them in regeneration planning.

For storyboard-panel upload after reference-shot imitation, use a clearly named generic type such as `storyboard_panel_ref` or `storyboard_upload_ref` until a specialized adapter exists. State that it is for storyboard-panel upload/candidate/selection, not final video generation.

## Asset References

`asset_ref` output should usually be reusable and weakly tied to plot:

- prefer low-background, clean-background, or neutral-background images,
- prefer multi-view or reference-sheet style when useful,
- show identity, state, costume, makeup, prop shape, material, or style,
- avoid complex scene lighting, one-off action, specific plot blocking, or final-shot composition.

Put story lighting, camera composition, action, and scene-specific mood in `keyframe` or `storyboard`, not in `asset`.

## Flat Refs

Current source supports these flat refs on content units:

- `scene_moment_ref`
- `shot_ref`
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
-> keyframe_ref content unit
-> generated/imported keyframe candidates
-> user/workflow selects stable keyframe candidate
-> storyboard_ref content unit
-> generated/imported storyboard/video candidates
-> user/workflow selects final candidate
```

Use this path when cross-shot or cross-scene continuity matters.

Do not start a downstream stage until the required upstream candidate has been selected. A generated candidate is not a stable dependency until it has a selection.

## Fast Exploration Path

For rapid exploration, create only the needed generic or specialized content unit and generate candidates quickly. A direct `scence_moment_ref` or `shot_ref` content unit is appropriate when the user wants a draft, a low-stakes one-off output, or a simple generation without reusable continuity.

Do not create setting, asset, keyframe, or storyboard prerequisites just to satisfy a formal chain. Add them only when they protect identity, style, scene continuity, camera intent, or downstream reuse.

Tell the user that generic slots and skipped asset/keyframe/storyboard stages trade consistency, reusable references, and stale tracking for speed.

If the user explicitly accepts a draft path with missing upstream selection, state that the result is not a stable continuity dependency.

## Checkpoint

After writing content units:

1. Run `domain_inspect` or `domain_review`.
2. Fix blocking issues.
3. Run `domain_interpret`.
4. Read dependency report, input version, selection validity, and runtime panel before generation.
