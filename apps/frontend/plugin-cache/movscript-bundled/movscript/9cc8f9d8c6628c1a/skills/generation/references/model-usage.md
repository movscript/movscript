# Model Usage Strategy

Use this when deciding whether a MovScript scene moment should be generated directly, broken into materials, or composed through editing.

## Default Path

Default to a direct `scene_moment_ref` content unit and one complete video-generation prompt when the requested output is one coherent scene moment.

Do not split a scene moment into multiple shots or expression-unit material content units just because the structure would look more detailed. Split only when one of these is true:

- the selected video model is confirmed to support the needed video input, start/end frames, multi-reference conditioning, or shot-continuity controls;
- the workflow is explicitly going through editing composition after separate materials are generated;
- the user asks for multi-shot planning, multiple clips, or a composed timeline;
- the scene moment truly contains independently reusable materials such as voiceover, subtitles, music, sfx, or a visual asset that must be generated and adopted separately.

If model capability is unknown, prefer direct generation with a strong prompt over speculative decomposition.

## Prompt Requirements

Prompts should be production-ready and minimize model guessing. Include the important elements that affect output quality:

- subject identity and continuity references;
- location, era, environment, props, costume, and visible state;
- action beat, emotion, blocking, and interaction;
- framing, camera movement, lens/shot size, composition, and timing;
- lighting, color, texture, visual style, and negative constraints;
- duration, aspect ratio, and motion requirements when relevant.

Use semantic refs such as `{{asset::id}}`, `{{storyboard::id}}`, and `{{keyframe::id}}` for selected upstream dependencies. Use direct RawResource IDs only for loose references or explicit `{{resource::123}}` inputs.

## Settings and Standards

Create `setting` / `setting_state` / `asset` only for concrete reusable entities or states: characters, places, props, costumes, instruments, voice identities, recurring environment states, or other production objects.

Do not create settings for abstract styles, moods, genres, rules, or one-off prompt text. Put durable project-wide constraints in `project_standards` only when the user explicitly asks or clearly confirms they are reusable standards.

When a conversation cannot complete all user tasks, persist only reusable standards that help future turns continue correctly. Do not persist temporary task plans, generated job state, candidate ids, resource URLs, or guesses.

## Candidate Semantics

Content-unit generation creates candidates, not final state. A generated RawResource becomes stable only after it is recorded as a candidate and then adopted/selected.

- RawResource: media/resource body.
- Candidate: content-unit candidate record that points to outputs.
- Selection: current stable chosen candidate/resource.
- Adoption: user or workflow decision that writes selection.

Use `domain_register_raw_resource_as_content_unit_candidate` when an existing RawResource should enter the candidate pool. Use `domain_decide_content_unit_candidate` with `adopt`, `reject`, or `defer` for user decisions.
