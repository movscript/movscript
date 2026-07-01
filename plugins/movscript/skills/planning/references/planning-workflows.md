# Planning Workflows

Planning creates only the prerequisite structure needed for the user's current goal. Do not expand a simple request into a complete project, all shots, all storyboards, all keyframes, all audio/expression details, and all assets unless the user asks for that scope.

## Scope Check

When unclear, ask whether the user is:

- making a simple one-off video, or
- building a reusable project with continuity, later edits, and tracked generation.

For a simple video, use the smallest useful structure: a focused short `scene_moment`, optional visual `expression_unit`, `storyboard`, and/or `content_unit`.

For a project, add reusable structure only where it helps: project standards, timeline namespace nodes, settings, setting-state namespaces, assets, script blocks, scene moments, visual expression units, keyframes, storyboards, expression units, audio cues, and content units. Current production/segment tools and source paths are legacy projections for timeline namespace nodes, not proof that every project must be shaped as production -> segment.

For video requests that resemble Seedance-style paths, open `video-production-paths.md` first and classify the request as concept-driven short clip, long-video pipeline, image-driven video, or storyboard-driven workflow. Use that path classification to decide how much structure is needed.

## New Production Structure Gate

Before creating a new production or timeline namespace root:

1. Clarify or infer the requested creative shape: deliverable, platform/audience, source material, duration, review granularity, continuity/reuse needs, and whether the work is a short video, film, episode, lesson, or custom structure.
2. Use a known production type only when it fits the user's intent. `video`, `film`, `episode`, and `lesson` are templates for internal timeline vocabulary, not hard requirements.
3. If none of the known shapes fits, use `custom` and name the user's internal timeline layers explicitly, such as `hook`, `proof`, `demo`, `cta`, `chapter`, `module`, `case`, or any domain-specific terms the user provides.
4. Write new nontrivial structures with `domain_upsert_timeline_namespace_tree`. Store user vocabulary on nodes with `namespace_kind` / `timeline_namespace_kind`; let path placement express the concrete parent tree.
5. Keep system primitives stable. Custom namespace nodes organize scope, order, and review boundaries; `scene_moment`, `expression_unit`, `storyboard`, `keyframe`, `asset`, and `content_unit` remain the makeable and trackable production objects.
6. When a namespace scope needs playable assembly or finishing, hand off to a production editing workspace. Do not invent namespace-specific content-unit types such as `episode_ref`, `module_ref`, or `beat_ref`.

## Output Granularity Decision

Before writing entities, decide what is actually being produced:

1. Decide whether the request is one output, one visual expression unit, one `scene_moment`, multiple scene moments, or a built-in/custom timeline namespace scope that needs production editing assembly.
2. Keep each `scene_moment` short and atomic, normally about 10 seconds or less. If the request spans multiple actions, time/place changes, or independently reviewable beats, split it into multiple scene moments.
3. Choose the working center. Use a visual `expression_unit` when camera framing, blocking, motion, timing, or a single clip material is the main deliverable. Use `scene_moment` when the deliverable is a complete narrative beat that may contain one or more visual materials.
4. Decide whether the working center needs evidence for consistency. Use `setting`, `setting_state`, and `asset` for concrete reusable production entities, state namespaces, and state asset references; `keyframe` and `storyboard` for shot visual anchors; `expression_unit` and `audio_cue` for performance, text, voice, sound, or ambience.
5. Before ordinary video generation, prefer a schematic `gpt-image-2` storyboard panel for each scene moment unless the user explicitly wants a fast unstable draft.
6. If consistency requirements are low, do not force setting, asset, keyframe, or storyboard prerequisites. Create the focused short `scene_moment_ref` or `expression_unit_ref` content unit and generate a draft.
7. After writing the content unit, derive or read its artifact bundle, dependency report, runtime panel, and selection validity before generation.

Use this decision before dependency-order planning. Dependency order tells you how to write the chosen structure; it does not decide how much structure the user needs.

## Dependency Order

Use this order when the requested scope needs it:

```text
project_standards
-> setting / setting_state / asset
-> timeline namespace node (legacy production/segment projection when needed) / scene_moment
-> expression_unit
-> keyframe / storyboard
-> audio_cue
-> content_unit
-> inspect / interpret
```

This is an ordering guide, not a requirement to create every layer.

## Common Paths

For story-to-shot planning:

1. Capture or read the source story/script.
2. Analyze each useful beat before writing content units: dramatic purpose, characters/entities, setting, visible action, blocking, camera intent, lighting, audio/performance, continuity notes, and any required semantic refs.
3. Create the necessary timeline namespace nodes and scene moments. Prefer `domain_upsert_timeline_namespace_tree` for new path-first structures. Use `production` / `segment` write tools only as the current legacy projection of those namespace nodes.
4. Create only the visual expression units needed for the current task.
5. Add keyframes/storyboards only where visual anchoring is needed.
6. Add content units only for outputs the user wants to generate, upload, select, or track. The content-unit prompt should use the analyzed scene detail, not a raw pasted script block.

For continuity:

1. Create `setting`.
2. Create `setting_state` only for reusable contextual changes.
3. Create `asset` slots only when cross-shot reuse matters.
4. Use `asset_ref` content units to generate/select reusable references.
5. Require adoption/selection before using the asset reference in keyframes, storyboards, or video.

Asset reference images should usually use plain white or very clean backgrounds, multi-view/reference-sheet views when useful, and be weakly tied to scene plot. Put story lighting, action, composition, and one-off scene details in `keyframe` or `storyboard`, not in `asset`.

When a concrete production entity or state, such as a character, prop, place, instrument, costume, voice identity, or visual/sound variant, will be reused, or when the user is unhappy with its look or sound, use the continuity path before downstream generation. Do not keep retrying final shots, audio, or videos while the reusable identity is still unresolved.

Build reusable assets from simple to complex:

1. Stabilize the base identity, silhouette, shape, material, or location layout.
2. Generate a white-background/clean-background multi-view or reference-sheet candidate when it helps future consistency.
3. Generate state or variant assets such as costume, makeup, wet hair, damaged prop, weather state, or lighting-neutral environment state.
4. Use the selected simpler asset candidate as a reference for the next more specific asset candidate.
5. Move story lighting, action, camera composition, and final-shot mood into keyframes or storyboards after the asset is stable.

For visual anchoring:

1. Create or update visual expression-unit camera/blocking/lighting/timing intent.
2. When composition, blocking, camera motion, subject placement, or rhythm is underspecified, or when preparing ordinary scene-moment video production without an existing selected visual anchor, create `storyboard` structure first.
3. Create a `storyboard_ref` content unit for storyboard panels/images and require adoption/selection when downstream work depends on it.
4. After storyboard selection, create `keyframe` records for required visual anchors such as start and end frames.
5. Create `keyframe_ref` content units for keyframe images and require adoption/selection before dependent video generation.
6. Do not start downstream video generation until required upstream storyboard/keyframe/asset selections exist. If candidates exist but are unselected, guide the user to adopt/select one first. Continue only when the user explicitly asks for an unstable draft.

For sound or expression continuity:

1. Use `expression_unit` for dialogue, narration, subtitles, captions, action text, or visual notes.
2. Use `audio_cue` for sound effects, music, ambience, dialogue cues, or foley.
3. Reference these from content units only when they are relevant to the output being generated or reviewed.

For reference-shot imitation:

1. Analyze the whole reference clip through extracted frames.
2. Decide which frames or contact sheets must be materialized as RawResources for downstream generation references.
3. Convert composition, motion, rhythm, blocking, lighting, and key moments into `shot`, `storyboard`, and `keyframe` structure.
4. Create a storyboard-panel or `storyboard_ref` content unit for the generated/assembled panels/images.
5. Require selection of the storyboard-panel candidate before dependent video generation.
