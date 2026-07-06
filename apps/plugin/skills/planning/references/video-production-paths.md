# Video Production Paths

Use this reference when a user asks for a video and the planning task must decide how much MovScript structure to create before generation or editing.

It adapts common Seedance-style prompt paths into MovScript planning entities. Planning chooses the structure; generation and editing execute later.

## Path Summary

### Path A: Concept-Driven Short Clip

Use when:

- the target is one short clip;
- the user has a concept rather than source media;
- duration is within one model generation and normally no more than about 10 seconds;
- continuity needs are low or optional.

MovScript internal structure:

```text
scene_moment
-> scene_moment_ref 内容制作任务
```

Optional evidence:

- `asset_ref` only when a reusable character/product/place must stay stable;
- `storyboard_ref` / `keyframe_ref` when composition, blocking, camera path, or first/last frame must be controlled.

Do not create full productions, segments, many expression units, or editing projects just because the prompt could be more detailed.

Before video production, prefer a `storyboard_ref` candidate generated with `gpt-image-2` as a schematic/stylized animatic panel. It should communicate composition, blocking, camera, and lighting, not photoreal real-person identity. Skip this only for an explicit fast unstable draft or when a selected storyboard/keyframe already exists.

### Path B: Long Video Pipeline

Use when:

- target output exceeds one model generation;
- any individual story beat would exceed about 10 seconds unless split;
- the user asks for a short drama, trailer, MV, brand film, course/explainer, multi-scene ad, or reusable project;
- continuity, subtitles, voice, music, or later edits matter.

MovScript internal structure:

```text
production
-> segment(s) when useful
-> scene_moment(s)
-> expression_unit(s) for visual, voice, subtitle, music, sfx, ambience
-> asset_ref / storyboard_ref / keyframe_ref 内容制作任务 where needed
-> expression_unit_ref or scene_moment_ref 内容制作任务
-> editing project for assembly
```

Rules:

- Stabilize reusable assets before downstream visual generation.
- Split long action into short scene moments that can each be prompted, reviewed, regenerated, and adopted independently.
- Use concrete material records for independently generated shots, dialogue voice, narration voice, subtitles, music, sound effects, or ambience that will be edited together.
- Use editing for assembly, trimming, color matching, subtitles, music sync, and final export.
- Do not hide a long video in one giant prompt.

### Path C: Image-Driven Video

Use when:

- the user provides one image, selected keyframe, or RawResource image and asks to animate it;
- the image should act as identity/composition evidence;
- the output can be one continuous clip.

MovScript structure:

```text
keyframe or direct RawResource
-> scene_moment
-> scene_moment_ref 内容制作任务 with prompt ref/input resource
```

Use `keyframe_ref` when:

- the image should become a tracked dependency;
- downstream stale checks matter;
- the user wants to adopt/select that image as the stable anchor.

Use direct `{{resource::123}}` or `reference_resource_ids` when:

- the image is loose guidance;
- dependency tracking is not needed;
- the user is experimenting quickly.

If the image is actually a storyboard/collage, route to Path D.

### Path D: Storyboard-Driven

Use when:

- the user provides a multi-panel storyboard, comic page, contact sheet, or collage;
- the user says each panel/格 should become a shot or video segment;
- panel relationships determine the output.

First classify panel relationships:

- Continuous action chain: same subject/place/event, panels are motion slices.
- Sequential scenes: same subject/theme with time/place progression.
- Independent montage: different scenes tied by mood, memory, product, or music.

MovScript structure:

For small, coherent storyboards:

```text
storyboard
-> storyboard_ref 内容制作任务
-> scene_moment
-> scene_moment_ref 内容制作任务
```

For many panels or independently reviewable clips:

```text
storyboard
-> storyboard_ref 内容制作任务
-> scene_moment(s) / expression_unit(s)
-> expression_unit_ref 内容制作任务 per shot/material
-> editing project for assembly
```

Rules:

- 分镜图 are visual evidence, not the final video output.
- Require adoption/selection of storyboard candidates when downstream video depends on them.
- Explicitly prevent panel borders, labels, captions, UI, or grid lines from becoming generated video content.

## Cross-Path Gates

### Video Spend Gate

Planning may create internal output tasks, write/refine saved prompts, and compile readiness for videos, 分镜图, 关键帧, asset references, voice, music, sound effects, subtitles, or any other generated output. Do not run any generation tool or external generation system until the user has seen the full generation context and explicitly confirmed the specific task. Without that confirmation, the next step is readiness reporting and a confirmation request, not `generation_prepare`, `generation_submit`, or external generation.

### Saved Prompt Gate

Before any MovScript, LibTV, or external generation executor runs for project content, create or update the target internal output task and save its `edit_prompt`. This saved prompt is the durable prompt backup; provider prompts, node prompts, and chat prose must be derived from it, not replace it.

### Project Style Gate

Before script-related image or video generation, require a confirmed project style baseline. This applies to 分镜图, 关键帧, asset images derived from the script, story-beat videos, and concrete visual shot outputs. If the style is simple and unambiguous, summarize the proposed reusable style prompt, ask the user to confirm it, then save it to `project_standards.json` with `domain_upsert_project_standards` under `visual_style` or `project_style.custom_rules[key=style_prompt]`; use that prompt in every downstream generation prompt. If the style is special, composite, uncommon, subjective, or ambiguous, generate a style-reference image batch from the style prompt: write the project-level internal output-task `edit_prompt`, summarize the full context, ask the user to confirm the batch, then save the user-selected RawResource IDs under `project_style.custom_rules[key=style_reference_images]`; use those selected style images as global references for every supported downstream visual generation.

### Scene Moment Duration Gate

Use `scene_moment` as a short atomic video beat. If a requested moment is likely to run longer than about 10 seconds, split it into several scene moments with clear beginning/middle/end actions and compose them later through editing.

For each planned short story beat, prefer a schematic `gpt-image-2` 分镜图 before downstream video generation. Avoid real-person likenesses in these 分镜图; use them as visual direction evidence, not as human identity assets.

### Continuity Gate

Open `../../generation/references/continuity-asset-prompts.md` when a character/person, product, prop, reusable place/scene space/set, costume, material state, instrument, or voice identity must stay stable. If the user says "场景" and means a location, environment, room, stage, or set, treat it as `setting`, not `scene_moment`.

Planning structure:

```text
setting
-> setting_state
-> asset
-> asset_ref 内容制作任务
-> adoption/selection
```

Only after adoption/selection should downstream prompts use `{{asset::id}}` as a stable dependency.

### Visual Anchor Gate

Use 分镜图/关键帧 when:

- composition, blocking, camera motion, subject placement, timing, or rhythm matters;
- prior generations failed because composition drifted;
- first/last frame continuity matters;
- reference-shot imitation is requested.

Planning structure:

```text
shot or visual expression_unit
-> storyboard
-> storyboard_ref 内容制作任务
-> keyframe(s)
-> keyframe_ref 内容制作任务
-> downstream video 内容制作任务
```

### Editing Gate

Route to editing when:

- multiple generated clips must be assembled;
- generated material needs trimming or color/style matching;
- subtitles, text overlays, music sync, or audio mix are part of the deliverable;
- final export/package/HLS/preview is requested.

Open `../../editing/references/ai-clip-editing-rhythm.md` when the edit needs rhythm, clip trimming, transition, or AI artifact mitigation guidance.

## Decision Checklist

Before writing entities:

- Which path is this: A, B, C, or D?
- Is the output one clip, one scene moment, multiple materials, or a full production?
- Is source media loose guidance or tracked dependency evidence?
- Are reusable assets required before downstream generation?
- Are storyboard/keyframe anchors required before video?
- Will the final deliverable require editing?
- Which 内容制作任务 type (`content_unit_type`) is the smallest stable fit?

## Reporting

When reporting the plan, state:

- chosen path and why;
- planned MovScript entities;
- required upstream selections before generation;
- whether the path is stable or an explicit fast/unstable draft;
- next action: create/update planning records, summarize full context and ask for generation confirmation, or switch to editing.
