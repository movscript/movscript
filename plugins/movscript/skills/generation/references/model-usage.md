# Model Usage Strategy

Use this when deciding whether a MovScript scene moment should be generated directly, broken into materials, or composed through editing.

## Default Path

Default to a direct `scene_moment_ref` content unit and one complete video-generation prompt only when the requested output is one coherent short scene moment, normally about 10 seconds or less.

Do not split a short atomic scene moment into multiple shots or expression-unit material content units just because the structure would look more detailed. Split into multiple scene moments or material content units when one of these is true:

- the requested scene moment exceeds about 10 seconds, changes time/place, or contains several independently reviewable actions;
- the selected video model is confirmed to support the needed video input, start/end frames, multi-reference conditioning, or shot-continuity controls;
- the workflow is explicitly going through editing composition after separate materials are generated;
- the user asks for multi-shot planning, multiple clips, or a composed timeline;
- the scene moment truly contains independently reusable materials such as voiceover, subtitles, music, sfx, or a visual asset that must be generated and adopted separately.

If model capability is unknown, prefer direct generation with a strong prompt only for short atomic scene moments. For longer beats, split into short scene moments first and compose later.

After model discovery or selection, use `video-model-prompt-routing.md` to align the prompt shape with model capabilities. Do not choose multi-shot, audio/dialogue, start/end-frame, or reference-heavy prompting unless the selected model or workflow supports it.

For Seedance-like requests, use `seedance2-prompt-methods.md` before deciding whether the request is a short concept clip, long-video pipeline, image-driven video, or storyboard-driven workflow.

For image generation, open `image-prompt-craft.md`. Prefer `gpt-image-2` when available for non-person images, storyboard panels, schematic composition guides, environments, props, and visual anchors. Prefer Seedream/Seedream 5.0 lite when available for reusable human/person identity images that will be used as Seedance face references, so the resource can carry provider-generated trust/provenance required by Seedance review.

## Prompt Requirements

Prompts should be production-ready and minimize model guessing. Include the important elements that affect output quality:

- subject identity and continuity references;
- location, era, environment, props, costume, and visible state;
- action beat, emotion, blocking, and interaction;
- framing, camera movement, lens/shot size, composition, and timing;
- lighting, color, texture, visual style, and negative constraints;
- duration, aspect ratio, and motion requirements when relevant.

When the source is a script, screenplay block, scene note, or story-heavy user wording, do not paste it as the final content-unit prompt. Run `content-unit-prompt-craft.md` first: extract story beat, characters, setting, visible action, blocking, camera, lighting, audio/performance, continuity, and negatives, then write a prompt that matches the target output type.

For image outputs, use `image-prompt-craft.md` after the script analysis pass. A good image prompt is a single-frame production brief: purpose, subject, composition, setting, lighting, style/medium, details, and restrictions. Do not include video-like time progression unless describing one frozen key moment.

Before writing or refining a video prompt, use `video-model-prompt-routing.md` and `video-prompt-craft.md` to classify the prompt mode and run the prompt pass. A `scene_moment_ref` prompt for video generation is still a video prompt: it should direct a scene over time, not merely summarize the scene moment or describe a still image.

Use semantic refs such as `{{asset::id}}`, `{{storyboard::id}}`, and `{{keyframe::id}}` for selected upstream dependencies in the content unit `edit_prompt`. Before generation, compile the content unit with `domain_build_content_unit_backend_prompt` and inspect blockers, `semantic_ref_replacements`, and resolved `resource_ids`. Use direct RawResource IDs only for loose references or explicit `{{resource::123}}` inputs outside tracked dependency semantics.

## Settings and Standards

Create `setting` / `setting_state` / `asset` only for concrete reusable entities or states: characters, places, props, costumes, instruments, voice identities, recurring environment states, or other production objects.

Do not create settings for abstract styles, moods, genres, rules, or one-off prompt text. Put durable project-wide constraints in `project_standards` only when the user explicitly asks or clearly confirms they are reusable standards.

When an asset is needed, use `continuity-asset-prompts.md` to keep identity/state prompts reusable and separate from downstream motion, camera, and scene lighting.

When a conversation cannot complete all user tasks, persist only reusable standards that help future turns continue correctly. Do not persist temporary task plans, generated job state, candidate ids, resource URLs, or guesses.

## Candidate Semantics

Content-unit image/video generation creates or refreshes candidates automatically when the monitored job succeeds; it does not create final selected state. A generated RawResource becomes stable only after the resulting candidate is adopted/selected.

- RawResource: media/resource body.
- Candidate: content-unit candidate record that points to outputs.
- Selection: current stable chosen candidate/resource.
- Adoption: user or workflow decision that writes selection.

Do not manually call `domain_create_content_candidate` after `generation_submit` content-unit image/video jobs`. Use `domain_register_raw_resource_as_content_unit_candidate` only when an existing RawResource from upload, transform, import, editing export, or low-level generation should enter the candidate pool. Use `domain_decide_content_unit_candidate` with `adopt`, `reject`, or `defer` for user decisions.
