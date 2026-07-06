# Planning Workflows

Planning creates only the prerequisite structure needed for the user's current goal. Do not expand a simple request into a complete project, all shots, all storyboards, all keyframes, all audio/expression details, and all assets unless the user asks for that scope.

## Scope Check

When unclear, ask whether the user is:

- making a simple one-off video, or
- building a reusable project with continuity, later edits, and tracked generation.

For a simple video, use the smallest useful structure: a focused short story beat, optional shot/visual material, optional 分镜图/关键帧, and an internal output task with a saved prompt.

For a project, add reusable structure only where it helps: project standards, script source, timeline namespace nodes, characters, reusable locations/scene spaces/sets, props, costumes, instruments, voice identities, short story beats, shot/voice/subtitle/sound/music materials, 关键帧, 分镜图, and internal output tasks. Current production/segment tools and source paths are legacy projections for timeline namespace nodes, not proof that every project must be shaped as production -> segment.

Use `scripts/**` as the durable screenplay and project story memory. If the user gives important story intent, dialogue, scene order, character motivation, narration, or recurring world facts, write or update the script before turning that material into scene moments, expression units, content units, or generation prompts. In user-facing language these may become scene beats, concrete materials, 内容制作任务, or prompt work. If a downstream task is unclear, read the script before guessing.

## Deep Discussion And Inspiration Capture

When the user is exploring ideas, capture durable inspirations into `scripts/**` before planning downstream structure. This applies to story premise, scene order, character desire, relationship turns, world facts, recurring motifs, vivid images, possible endings, dialogue/narration lines, strong rejections, and unresolved options that the project may need later.

Read the current script first, then merge the new material instead of replacing the existing memory. Preserve the user's words when a phrase, line, or image idea may matter later. Mark uncertain but useful ideas as exploratory/候选/待定, and keep rejected ideas separate from confirmed story facts.

Do not wait for a generation request before saving the script memory. After a meaningful exploration turn, update the script with `domain_upsert_script`, run `domain_inspect`, and only then derive scene moments, expression units, content units, settings, assets, storyboards, keyframes, or generation prompts. Ask before writing only when the update is a major rewrite, agent-inferred synthesis, or ambiguous choice among options.

Before script-related image or video generation, require a confirmed project style baseline. If the style is simple and unambiguous, propose a reusable style prompt, ask the user to confirm, then save it in `project_standards.json` through `domain_upsert_project_standards` under `visual_style` or `project_style.custom_rules[key=style_prompt]`. If the style is special, composite, uncommon, subjective, or ambiguous, generate style reference images from the style prompt: create/update a project-level internal output task and saved `edit_prompt`, ask for full-context confirmation before calling the generation tool or importing the batch, let the user choose the image(s), then save the chosen RawResource IDs under `project_style.custom_rules[key=style_reference_images]`. After the baseline exists, every downstream saved prompt and generation prompt must cite and use it for global style consistency.

For video requests that resemble Seedance-style paths, open `video-production-paths.md` first and classify the request as concept-driven short clip, long-video pipeline, image-driven video, or storyboard-driven workflow. Use that path classification to decide how much structure is needed.

## New Production Structure Gate

Before creating a new production or timeline namespace root:

1. Clarify or infer the requested creative shape: deliverable, platform/audience, source material, duration, review granularity, continuity/reuse needs, and whether the work is a short video, film, episode, lesson, or custom structure.
2. Use a known production type only when it fits the user's intent. `video`, `film`, `episode`, and `lesson` are templates for internal timeline vocabulary, not hard requirements.
3. If none of the known shapes fits, use `custom` and name the user's internal timeline layers explicitly, such as `hook`, `proof`, `demo`, `cta`, `chapter`, `module`, `case`, or any domain-specific terms the user provides.
4. Write new nontrivial structures with `domain_upsert_timeline_namespace_tree`. Store user vocabulary on nodes with `namespace_kind` / `timeline_namespace_kind`; let path placement express the concrete parent tree.
5. Keep system primitives stable. Custom namespace nodes organize scope, order, and review boundaries; short story beats, shot/voice/subtitle/sound/music materials, 分镜图, 关键帧, reusable assets, and internal output tasks remain the makeable and trackable production objects.
6. When a namespace scope needs playable assembly or finishing, hand off to a production editing workspace. Do not invent namespace-specific `content_unit_type` values such as `episode_ref`, `module_ref`, or `beat_ref`.

## Output Granularity Decision

Before writing entities, decide what is actually being produced:

1. Decide whether the request is one output, one shot/visual material, one short story beat, multiple story beats, or a built-in/custom timeline namespace scope that needs production editing assembly.
2. Keep each `scene_moment` short and atomic, normally about 10 seconds or less. If the request spans multiple actions, time/place changes, or independently reviewable beats, split it into multiple scene moments.
3. Choose the working center. Use a shot/visual material when camera framing, blocking, motion, timing, or a single clip material is the main deliverable. Use a short story beat when the deliverable is a complete narrative beat that may contain one or more visual/audio/text materials.
4. Decide whether the working center needs evidence for consistency. Use `setting`, `setting_state`, and `asset` for concrete reusable production entities, including characters, props, places/scene spaces/sets, costumes, instruments, and voice identities; use 关键帧 and 分镜图 for shot visual anchors; use concrete materials for performance, text, voice, sound, or ambience.
5. Before ordinary video generation, prefer a schematic `gpt-image-2` 分镜图 for each short story beat unless the user explicitly wants a fast unstable draft. Storyboard/keyframe image generation also requires full-context user confirmation before any generation tool runs; in user-facing language, say 分镜图/关键帧.
6. If consistency requirements are low, do not force setting, asset, 关键帧, or 分镜图 prerequisites. Create the focused short story-beat or shot-material internal output task and its saved `edit_prompt`, then summarize the full generation context and ask for confirmation before calling the generation tool for a draft. This fast path still cannot skip a confirmed project style baseline for script-related image/video generation.
7. After writing the internal output task, derive or read its artifact bundle, dependency report, runtime panel, and selection validity before generation.

Use this decision before dependency-order planning. Dependency order tells you how to write the chosen structure; it does not decide how much structure the user needs.

## Dependency Order

Use this order when the requested scope needs it:

```text
project_standards / confirmed style baseline when required
-> script
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

1. Capture or read the source story/script. For durable project-level story material, update the script with `domain_upsert_script` before writing downstream planning entities.
2. Analyze each useful beat before writing internal output tasks: dramatic purpose, characters/entities, setting, visible action, blocking, camera intent, lighting, audio/performance, continuity notes, and any required semantic refs.
3. Extract reusable screenplay entities before moments when they matter: characters, scene places/spaces/sets, props, costumes, instruments, and voice identities are `setting` records. Do not turn "场景：老张的厨房" into a `scene_moment`; create/use the kitchen as `setting`, then create `scene_moment` records for actions that happen there.
4. Create the necessary timeline namespace nodes and scene moments. Prefer `domain_upsert_timeline_namespace_tree` for new path-first structures. Use `production` / `segment` write tools only as the current legacy projection of those namespace nodes.
5. Create only the visual expression units needed for the current task.
6. Add 关键帧/分镜图 only where visual anchoring is needed.
7. Add internal output tasks only for outputs the user wants to generate, upload, select, or track. The saved prompt should use the analyzed scene detail, not a raw pasted script block. Any MovScript, LibTV, or external executor should run from this saved 内容制作任务 `edit_prompt`, not from chat-only text.

For continuity:

1. Create `setting`.
2. Create `setting_state` only for reusable contextual changes.
3. Create `asset` slots only when cross-shot reuse matters.
4. Use `asset_ref` internal output tasks to generate/select reusable references.
5. Require adoption/selection before using the asset reference in 关键帧, 分镜图, or video.

Asset reference images should usually use plain white or very clean backgrounds, multi-view/reference-sheet views when useful, and be weakly tied to scene plot. Put story lighting, action, composition, and one-off scene details in 关键帧 or 分镜图, not in `asset`.

When a concrete production entity or state, such as a character, prop, place, scene space, set, instrument, costume, voice identity, or visual/sound variant, will be reused, or when the user is unhappy with its look or sound, use the continuity path before downstream generation. Do not keep retrying final shots, audio, or videos while the reusable identity is still unresolved.

Build reusable assets from simple to complex:

1. Stabilize the base identity, silhouette, shape, material, or location layout.
2. Generate a white-background/clean-background multi-view or reference-sheet candidate when it helps future consistency.
3. Generate state or variant assets such as costume, makeup, wet hair, damaged prop, weather state, or lighting-neutral environment state.
4. Use the selected simpler asset candidate as a reference for the next more specific asset candidate.
5. Move story lighting, action, camera composition, and final-shot mood into 关键帧 or 分镜图 after the asset is stable.

For reusable scene spaces, rooms, sets, exterior locations, stages, or environments, use the stricter scene reference pack order: adopt/select `base_scene_view`, derive `topdown_layout_ref` from that base, optionally create clean plates, corner/cardinal views, depth/line/control maps, material details, and state variants, then move to storyboard/keyframe/video. Treat the top-down layout as structural evidence, not an independent design pass.

For visual anchoring:

1. Create or update shot/visual-material camera, blocking, lighting, and timing intent.
2. When composition, blocking, camera motion, subject placement, or rhythm is underspecified, or when preparing ordinary scene-moment video production without an existing selected visual anchor, create `storyboard` structure first.
3. Create a `storyboard_ref` internal output task for 分镜图 and require adoption/selection when downstream work depends on it.
4. After storyboard selection, create `keyframe` records for required visual anchors such as start and end frames.
5. Create `keyframe_ref` internal output tasks for 关键帧 images and require adoption/selection before dependent video generation.
6. Do not start downstream generation until required upstream 分镜图/关键帧/asset selections exist. If generated results exist but are unselected, guide the user to adopt/select one first. For script-related images/videos, also require a confirmed project style baseline before 分镜图, 关键帧, asset-image, or final video generation. Use a style prompt for simple/unambiguous styles; use selected style reference images globally for special/ambiguous styles. After selections and style baseline are ready, summarize the full generation context and ask for explicit confirmation before calling the generation tool. Continue without stable selections only when the user explicitly asks for an unstable draft; do not apply that exception to a missing project style baseline.

For sound or expression continuity:

1. Use `expression_unit` for dialogue, narration, subtitles, captions, action text, or visual notes.
2. Use `audio_cue` for sound effects, music, ambience, dialogue cues, or foley.
3. Reference these from internal output tasks only when they are relevant to the output being generated or reviewed.

For reference-shot imitation:

1. Analyze the whole reference clip through extracted frames.
2. Decide which frames or contact sheets must be materialized as RawResources for downstream generation references.
3. Convert composition, motion, rhythm, blocking, lighting, and key moments into `shot`, `storyboard`, and `keyframe` structure.
4. Create a storyboard-panel or `storyboard_ref` 内容制作任务 for the generated/assembled panels/images.
5. Require selection of the storyboard-panel candidate before dependent video generation.
