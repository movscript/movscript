# Content Unit Prompt Craft

Use this reference before writing or updating a MovScript content-unit `edit_prompt` from script text, scene notes, or story-heavy user wording. The goal is to turn source material into production direction, not to copy the source into the prompt.

Open `prompt-mode-router.md` first when the output type, model family, reference roles, quality score, or failure diagnosis is not already obvious.

## Core Rule

Never use a script excerpt as the saved prompt by itself. First analyze the excerpt, then write a prompt-ready description for the specific output type.

Keep exact dialogue only when the generated output must contain that line. Otherwise translate dialogue and prose into visible performance, blocking, emotion, camera, lighting, sound, continuity, and negative constraints.

Treat the `edit_prompt` as model-facing production direction. It may use MovScript semantic refs because the backend can resolve them into resources, but it must not depend on hidden project memory, unresolved pronouns, source-only labels, or abstract story logic that the model cannot see.

## Script Analysis Pass

Before authoring the prompt, extract:

1. Story beat: the dramatic purpose of this content unit in one sentence.
2. Characters/entities: concrete cast, wardrobe, posture, expression, state, props, and semantic refs such as `{{asset::id}}` when selected continuity assets matter.
3. Setting: location, time, era, weather, layout, background action, set dressing, and recurring objects.
4. Visible action: beginning, middle, and end of the beat; convert abstract words like pressures, threatens, realizes, hides, seduces, or sacrifices into observable gestures and reactions.
5. Blocking and camera: who is foreground/background, distance between characters, shot size, angle, camera movement, focus shift, and viewer attention path.
6. Lighting/color/texture: motivated light sources, contrast, palette, surface details, atmosphere, and style rules from project standards.
7. Audio/performance: dialogue tone, pauses, room tone, impact sounds, foley, music, subtitles, or silence when relevant.
8. Continuity and negatives: identity drift, wardrobe/prop state, location layout, unwanted captions/text, extra people, random cuts, distorted hands, or other shot-specific failures.

If any required field is missing and it materially affects generation quality, infer conservatively from project context. Ask only when the ambiguity changes the user's intent or continuity.

## Model-Understandability Pass

Before saving the prompt or using it for generation, reread it as if you were the image/video model and could see only the final prompt plus resolved resources.

Reject and rewrite the prompt if:

- It requires source context not present in the prompt or resolved refs, such as "the previous betrayal", "same as before", "their secret plan", or an unnamed "she".
- It describes hidden emotion or plot state without observable behavior, such as "he realizes the truth" without eye movement, posture, prop reaction, dialogue, camera emphasis, or sound.
- It names a relationship or dramatic pressure without visible blocking, gesture, prop, dialogue, camera, or timing.
- It says "cinematic", "premium", "tense", "sad", "beautiful", or similar taste words without concrete lighting, composition, material, performance, or audio cues.
- It leaves the model to guess the subject, setting, action order, camera, lighting, or continuity state that materially affects the output.

Rewrite abstract intent into frameable instructions: who/what is visible, where they are, how they move, what changes from beginning to end, how the camera watches it, which light sources shape it, what the viewer hears, and what concrete failures to avoid.

## Output-Type Routing

### `storyboard_ref`

Open `image-prompt-craft.md` and write a storyboard prompt as a schematic or stylized visual-planning image. Focus on composition, blocking, camera, lighting, scene layout, and emotional beat. Avoid photoreal real-person likenesses, final human identity portraits, UI labels, panel borders, and readable dialogue text unless explicitly required.

Template:

```text
Schematic storyboard frame for [story beat]. Characters/entities: [roles or selected refs, non-photoreal if human]. Setting/layout: [place, foreground/background, props]. Visual beat: [observable action/reaction]. Camera/composition: [shot size, angle, movement cue if useful]. Lighting/color: [source and mood]. Continuity: [wardrobe/prop/location state]. Avoid photoreal real-person likeness, captions, panel borders, random text, extra characters, and identity drift.
```

### `keyframe_ref`

Open `image-prompt-craft.md` and write a still-image prompt for one precise visual anchor. Include subject, setting, pose/action state, camera, lighting, style, continuity refs, and negatives. Do not include multi-second action timelines unless it is describing the frozen moment.

### `scene_moment_ref` or video `expression_unit_ref`

Use `video-prompt-craft.md`. A video prompt must direct motion over time: action progression, blocking, camera movement, lighting changes, performance/audio, and negatives. Do not use a storyboard prompt or still-image prompt as the video prompt.

### Asset-like `asset_ref`

Use `continuity-asset-prompts.md` and `image-prompt-craft.md`. Keep reusable identity/state prompts separate from one-off scene drama, final-shot lighting, camera, and motion.

## Anti-Copy Checks

Before saving or generating, confirm:

- The prompt contains analyzed production details that were not merely copied from the script.
- Abstract plot language has been converted into visible/audible direction.
- A model seeing only the prompt plus resolved refs could understand the subject, setting, action, camera, lighting, timing, and constraints.
- No unresolved pronouns, private project shorthand, hidden backstory, or invisible motivation remains unless it is converted into visible behavior or dialogue.
- Characters, setting, props, wardrobe/state, emotion, camera, lighting, and continuity are explicit when relevant.
- The prompt matches the target content-unit type: storyboard image, keyframe image, asset reference, image edit, or video.
- Any selected upstream asset/storyboard/keyframe/audio cue dependency is written as a MovScript semantic ref, not as an unresolved prose mention.
- For stable generation, the prompt would score at least 12/16 using `prompt-mode-router.md` unless the user explicitly asks for a rough unstable draft.
