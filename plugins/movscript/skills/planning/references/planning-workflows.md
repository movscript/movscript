# Planning Workflows

Planning creates only the prerequisite structure needed for the user's current goal. Do not expand a simple request into a complete project, all shots, all storyboards, all keyframes, all audio/expression details, and all assets unless the user asks for that scope.

## Scope Check

When unclear, ask whether the user is:

- making a simple one-off video, or
- building a reusable project with continuity, later edits, and tracked generation.

For a simple video, use the smallest useful structure: a focused `scene_moment`, `shot`, `storyboard`, and/or `content_unit`.

For a project, add reusable structure only where it helps: project standards, settings, states, assets, script blocks, scene moments, shots, keyframes, storyboards, expression units, audio cues, and content units.

## Production Granularity Decision

Before writing entities, decide what is actually being produced:

1. Decide whether the request is one output, one `shot`, one `scene_moment`, multiple scene moments, segments, or productions.
2. Choose the working center. Use `shot` when camera framing, blocking, motion, timing, or a single video clip is the main deliverable. Use `scene_moment` when the deliverable is a complete narrative beat that may contain one or more shots.
3. Decide whether the working center needs evidence for consistency. Use `setting`, `setting_state`, and `asset` for reusable facts or references; `keyframe` and `storyboard` for shot visual anchors; `expression_unit` and `audio_cue` for performance, text, voice, sound, or ambience.
4. If consistency requirements are low, do not force setting, asset, keyframe, or storyboard prerequisites. Create the focused `scence_moment_ref` or `shot_ref` content unit and generate a draft.
5. After writing the content unit, derive or read its artifact bundle, dependency report, runtime panel, and selection validity before generation.

Use this decision before dependency-order planning. Dependency order tells you how to write the chosen structure; it does not decide how much structure the user needs.

## Dependency Order

Use this order when the requested scope needs it:

```text
project_standards
-> setting / setting_state / asset
-> production / segment / scene_moment
-> shot
-> keyframe / storyboard
-> expression_unit / audio_cue
-> content_unit
-> inspect / interpret
```

This is an ordering guide, not a requirement to create every layer.

## Common Paths

For story-to-shot planning:

1. Capture or read the source story/script.
2. Create the necessary production, segment, and scene moments.
3. Create only the shots needed for the current task.
4. Add keyframes/storyboards only where visual anchoring is needed.
5. Add content units only for outputs the user wants to generate, upload, select, or track.

For continuity:

1. Create `setting`.
2. Create `setting_state` only for reusable contextual changes.
3. Create `asset` slots only when cross-shot reuse matters.
4. Use `asset_ref` content units to generate/select reusable references.

Asset reference images should usually be clean, low-background or neutral-background, multi-view, and weakly tied to scene plot. Put story lighting, action, composition, and one-off scene details in `keyframe` or `storyboard`, not in `asset`.

For visual anchoring:

1. Create or update shot camera/blocking/lighting/timing intent.
2. Create `keyframe` for key visual anchors.
3. Create `keyframe_ref` content units for keyframe images.
4. Do not start downstream video generation until required upstream selections exist.

For sound or expression continuity:

1. Use `expression_unit` for dialogue, narration, subtitles, captions, action text, or visual notes.
2. Use `audio_cue` for sound effects, music, ambience, dialogue cues, or foley.
3. Reference these from content units only when they are relevant to the output being generated or reviewed.

For reference-shot imitation:

1. Analyze the whole reference clip through extracted frames.
2. Decide which frames or contact sheets must be materialized as RawResources for downstream generation references.
3. Convert composition, motion, rhythm, blocking, lighting, and key moments into `shot`, `storyboard`, and `keyframe` structure.
4. Create a storyboard-panel upload content unit for the generated/assembled panels.
5. Require selection of the storyboard-panel candidate before dependent video generation.
