# Content Unit Recipes

Content units are top-level project production slots. They are not generated resources, candidates, or selections.

## Specialized Types

- `asset_ref`: image output, requires `asset_ref`. Use to stabilize a reusable character, location, prop, style, or state asset.
- `keyframe_ref`: image output, uses `scene_moment_ref`, `shot_ref`, `storyboard_ref`, and `keyframe_ref` or `keyframe_refs`. Use to stabilize visual anchors for a shot or storyboard.
- `storyboard_ref`: video output, uses `scene_moment_ref`, `shot_ref`, `storyboard_ref`, and `keyframe_refs`. Use for storyboard-level continuous visual expression.

Unknown `content_unit_type` values are valid generic slots, but interpreter adapters do not collect upstream dependencies, hash source refs, mark selections stale, or include them in regeneration planning.

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

## Fast Exploration Path

For rapid exploration, create only the needed generic or specialized content unit and generate candidates quickly. Tell the user that generic slots and skipped asset/keyframe stages trade consistency and stale tracking for speed.

## Checkpoint

After writing content units:

1. Run `domain_inspect` or `domain_review`.
2. Fix blocking issues.
3. Run `domain_interpret`.
4. Read dependency report, input version, selection validity, and runtime panel before generation.
