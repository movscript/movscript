# Video Model Prompt Routing

Use this reference after `system_model_list` and before finalizing a video prompt. It helps choose the right prompt structure for the selected model, input mode, and production goal.

This is not a model catalog. Use `system_model_list` as the source of truth for available model IDs and capabilities.

## Routing Order

1. Project semantics
   Read the content-unit runtime panel, dependency report, selection validity, and project context snapshot. Do not choose a prompt style before understanding selected assets, keyframes, storyboards, and style references.

2. Model capabilities
   Check whether the selected model supports text-to-video, image-to-video, video-to-video/editing, start/end frames, multiple references, native audio/dialogue, fixed camera, or prompt optimization controls.

3. Prompt mode
   Use `video-prompt-craft.md` to classify the request as direct scene moment, image-to-video, keyframe transition, reference-shot imitation, video extension/edit, music-synced clip, or multi-shot sequence.

4. Prompt structure
   Pick the smallest structure that can express the intent well. One coherent paragraph is often better for a direct short scene moment; labeled shots or time bands are better for long, multi-beat, music-synced, or ad-like work. If the work would exceed about 10 seconds, split it into multiple scene moments or route through editing composition.

5. External settings
   Keep duration, aspect ratio, resolution, seed, camera-fixed flags, prompt-strength values, and other provider parameters outside the prompt text unless the provider explicitly expects natural-language mention.

## Model-Family Behaviors

These are behavior patterns to adapt from the selected model's capabilities. Do not invent a model family if `system_model_list` does not show it or the UI has not selected it.

### Director-Friendly Video Models

Use for models that respond well to cinematic natural language, sequential action, and camera direction.

Prompt shape:

```text
[Specific scene setting]. [Subject identity/state] [action progression over time]. Camera [shot size + movement + focus change]. Lighting/color [specific sources]. Performance/audio [if supported]. Avoid [specific failures].
```

Best for:

- direct scene-moment generation;
- emotionally driven shots;
- short narrative clips;
- image-to-video when only motion and camera need direction.

Avoid:

- long keyword piles;
- generic "cinematic, high quality" without concrete light, camera, and action;
- multiple unrelated actions in one short clip.

### Reference-Heavy Multimodal Models

Use for models that support several images/videos/audio references and let prompts assign reference roles.

MovScript adaptation:

- Keep the provider's reference-role idea, but express roles through MovScript refs and resource inputs.
- In the content-unit prompt, say what each semantic ref is for: identity, first frame, last frame, camera motion, action rhythm, scene/background, style, product detail, music tempo, voice tone, or sound effect.
- Pass direct RawResource IDs through `input_resource_ids` / `reference_resource_ids` when dependency tracking is not needed.

Prompt shape:

```text
Use {{asset::character_id}} for subject identity, {{storyboard::shot_id}} for composition and camera rhythm, and {{keyframe::start_id}} as the start-frame anchor. [Action timeline]. [Camera and light direction]. Preserve the referenced identity/composition; avoid drift, unrelated new objects, and style changes.
```

Best for:

- Seedance-style workflows with many reference materials;
- shot-motion imitation;
- product or character consistency;
- music/card-beat synchronization;
- video extension or targeted video edit.

Avoid:

- writing provider-only placeholders such as `@image1` in MovScript content-unit prompts;
- passing unselected upstream content-unit outputs as if they were stable references;
- using every available reference when only one or two influence the shot.

If the selected model/provider is Seedance-like, also open `seedance2-prompt-methods.md`. Use its Path A/B/C/D routing, Z/Y/X/F camera codec, concise image-to-video rules, storyboard-driven modes, aesthetic constraints, and AI clip editing rhythm, while preserving MovScript refs and candidate semantics.

### Keyframe and Transition Models

Use when the selected model accepts start/end frames or strong image anchors.

Prompt shape:

```text
Transition from {{keyframe::start_id}} to {{keyframe::end_id}} while preserving identity, lighting direction, palette, and set geometry. The motion begins with [start action], develops through [middle motion], and resolves as [end state]. Avoid cuts, subject duplication, and abrupt style changes.
```

Best for:

- controlled transformation shots;
- product reveal;
- emotional pose change;
- loopable clips;
- precise start/end composition.

Avoid:

- overloading the text prompt with a new scene that conflicts with the frames;
- using mismatched keyframes with unrelated palette, scale, or lighting unless the user wants a surreal transition.

### Multi-Shot or Storyboard-Aware Models

Use only when the model/workflow supports multi-shot prompting, the user asks for multiple shots, or MovScript will route through editing composition.

Prompt shape:

```text
Shared continuity: [assets, setting, palette, style, constraints].
Shot 1 (0-3s): [framing + action + camera + light + audio].
Shot 2 (3-6s): [framing + action + camera + light + audio].
Shot 3 (6-10s): [framing + action + camera + light + audio].
```

Best for:

- short ads;
- trailers;
- social clips;
- explainers;
- scenes that need hook/build/payoff rhythm.

MovScript rule:

If the shots must be independently reviewed, regenerated, adopted, or edited, create separate expression-unit material content units and route through the editing skill instead of hiding all shots in one content-unit prompt.

### Audio/Dialog-Capable Models

Use only when the selected model can generate or follow audio/dialogue, or when audio will be generated as a separate source resource.

Prompt shape:

```text
[Visual action]. Audio: [ambient sound], [music behavior], [dialogue with speaker identity, emotion, timing]. The speaker's mouth movement and body action should match the line.
```

Dialogue format:

```text
[Character name, tone]: "Short line."
```

Best for:

- dialogue performance;
- lip-sync clips;
- music-synced visuals;
- sound-design-heavy moments.

Avoid:

- long dialogue in short clips;
- unlabeled speakers;
- asking for readable on-screen text when a subtitle/editing workflow would be more reliable.

## Scenario Routing

### Direct Narrative Scene

Default to one direct scene-moment prompt only for a short atomic beat. Use `video-prompt-craft.md` and keep the prompt coherent.

A direct `scene_moment_ref` prompt must still be written as a video prompt: include action progression over time, camera/blocking, lighting/color, performance/audio when supported, and relevant negatives. Do not submit a scene synopsis or still-image description as the video prompt.

When the source wording is story-summary-heavy, use the layered narrative beat pattern from `video-prompt-craft.md`: story overview first, then cast/blocking, visible action/dialogue, light/color, camera/rhythm/audio, and shot-specific negatives. Trust capable models with story intent, but give them the production signals they need to render it.

Escalate to storyboard/keyframes when:

- the scene moment lacks a selected visual anchor and the workflow is not an explicit fast unstable draft;
- blocking, camera path, or subject placement is central and underspecified;
- a user rejected earlier generations because composition or identity drifted;
- the shot imitates a specific reference video;
- the scene needs exact first/last pose, framing, or product reveal.

For storyboard candidates, prefer `gpt-image-2` when available and prompt schematic/stylized animatic frames without photoreal real-person likenesses.

### Product or Ad Clip

Use hook/build/payoff rhythm. Name product details and benefits visually rather than abstractly.

For 10-15 second clips, use time bands:

```text
0-3s: hook visual.
3-7s: product use or problem/solution.
7-12s: benefit or transformation.
12-15s: hero ending with clean space for overlay if needed.
```

Do not request final readable marketing copy inside generated video unless the model is known to render text well. Prefer clean negative space for later editing.

### Character Consistency

If the same character appears across multiple shots or the user complains about appearance drift, treat character identity as a continuity asset gate:

1. Generate/refine the `asset_ref` content unit.
2. Wait for adoption/selection.
3. Use `{{asset::id}}` in downstream video prompts.

For identity assets, prefer simple reference-sheet prompts before scene-specific video prompts.

### Reference Video Imitation

Open `shot-imitation-workflow.md` first. Extract frames, analyze shot grammar, and create/select storyboard or keyframe anchors before dependent video generation.

The final prompt should describe which shot properties to imitate:

- camera path;
- pacing;
- subject blocking;
- action rhythm;
- light direction;
- transition or reveal;
- sound/music rhythm when relevant.

### Video Extension

Preserve identity, style, camera, timing, and location. Only describe the new continuation. Do not re-stage the whole scene unless the provider expects full recap.

### Targeted Video Edit

Name what stays unchanged before naming the edit. Keep the changed element specific and physically integrated with the original perspective, lighting, and motion.

### Music-Synced Clip

If the model supports audio reference or tempo-following, use a selected audio resource or direct RawResource input. Describe beat-aligned visual changes by count or time band. If the model does not support audio conditioning, generate visual source clips first and route synchronization through editing.

## Prompt Review Gate

Before calling a video generation tool, verify:

- The prompt mode and reference roles are classified with `prompt-mode-router.md` when they are not trivial.
- The chosen prompt structure matches model capabilities and scenario.
- `scene_moment_ref` video prompts are written as motion/camera/time-based video prompts, not scene summaries.
- The prompt uses MovScript refs or resource inputs, not provider placeholder syntax.
- External parameters are not mixed into prompt text unless necessary.
- Image-to-video prompts focus on motion/camera/change rather than re-describing the anchor image.
- Multi-shot prompts are used only when supported or intentionally routed through editing.
- Audio/dialogue is included only when supported or planned as a separate generated source resource.
- Readable text is handled by editing/subtitles unless the model is explicitly good at text.
