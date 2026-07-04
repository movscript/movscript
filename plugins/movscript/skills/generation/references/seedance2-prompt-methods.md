# Seedance 2.0 Prompt Methods

Use this reference when the selected model/provider is Seedance-like or when the user asks for 即梦 / Seedance 2.0 / 图生视频 / 运镜 / 音乐卡点 / 分镜板驱动 / 视频延长. It adapts Seedance prompt-writing methods to MovScript content-unit generation.

This file is based on public Seedance skill patterns, including MapleShaw's Seedance 2.0 prompt skill methods: path selection, Z/Y/X/F camera coding, concise image-to-video prompting, storyboard-driven generation, aesthetic constraints, and AI clip editing rhythm. In MovScript, keep semantic refs and candidate selection semantics; do not write platform-only placeholders such as `@图片1` into content-unit prompts.

Public Seedance prompt skills converge on one practical rule: write a short shooting brief the model can execute, not a story synopsis. Effective prompts assign each reference a role, describe what changes on screen, name the camera and timing, preserve what must stay stable, and remove filler that does not become pixels, motion, or sound.

## MovScript Adaptation Rules

- Use `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, or `{{resource::123}}` in prompts.
- Use `input_resource_ids` / `reference_resource_ids` for loose RawResource references when dependency tracking is not needed.
- Use `generation_submit` with `scope: "content_unit"` for content-unit candidates; do not treat the generated resource as selected until adoption/selection.
- Keep duration, aspect ratio, and provider parameters outside the prompt when the generation API already accepts them as settings.
- If a provider adapter converts MovScript refs to Seedance-style numbered references internally, keep that conversion outside the authored content-unit prompt.

## Seedance Model-Understandability Rule

Seedance-like models see only the prompt, provided image/video/audio references, and explicit settings. They do not see MovScript source files, chat context, unstated character relationships, or the dramatic reason behind a beat.

Before using a Seedance prompt, audit it against these questions:

- Have all references been assigned a concrete role, such as first frame, end frame, identity anchor, style reference, pose reference, storyboard guidance, source video to extend, or audio rhythm?
- Does every abstract idea become visible or audible: gesture, posture, gaze, prop movement, dialogue tone, camera emphasis, environmental motion, sound, or edit rhythm?
- Does the prompt say what must not transfer from a reference when using it only for style, pose, camera, or rhythm?
- For image-to-video, does the text add only motion, timing, camera, emotional micro-beats, environmental change, audio, and preservation constraints instead of fighting the image?
- Could someone film the prompt without reading the MovScript project? If not, rewrite it before generation.

Use time bands for longer or more complex clips, but keep a single Seedance clip focused on one coherent action. Split multi-beat stories into multiple content units and assemble them in editing.

## Four Production Paths

Choose one path before writing the prompt.

### Path A: Concept-Driven Short Clip

Use for a one-shot idea of 15 seconds or less. The concept should do one striking thing, not tell a full story.

Rules:

- The first two seconds need a clear visual hook.
- Use one simple impossible, surprising, emotional, or visually satisfying moment.
- Prefer one coherent scene-moment prompt.
- Use `video-prompt-craft.md` for subject, action timeline, camera, light, and negatives.

Prompt shape:

```text
[Hook concept]. [Subject and setting]. At first [opening beat], then [single escalation], ending with [payoff]. Camera [Z/Y/X/F-derived direction]. Lighting/color [specific sources]. Avoid [specific failures].
```

### Path B: Long Video Pipeline

Use for output longer than 15 seconds, trailers, short dramas, explainers, music videos, or any piece that needs continuity across segments.

MovScript path:

```text
continuity assets
-> scene moments / expression units
-> storyboards and keyframes when needed
-> multiple content-unit candidates
-> editing project and rhythm plan
```

Rules:

- Do not try to solve a long video with one prompt.
- Stabilize reusable characters, places, products, costumes, or voices first.
- Generate source clips with repeated style/identity locks.
- Use the editing skill for assembly, trimming, transitions, color unification, subtitles, and final export.

### Path C: Image-Driven Video

Use when the user provides one image or selected keyframe and wants it animated.

Core rule:

Trust the image as visual evidence. Text should add only what the image lacks or what must change: motion direction, emotional rhythm, camera direction, safety/negative constraints, and any necessary style lock.

Classify the image intent:

- Reaction mode: the image implies an emotional turn, surprise, fear, joy, pain, discovery, or dramatic response. Write sub-beats.
- Gaze mode: the image is a quiet daily moment. Use slow single-camera observation and natural micro-motion.

Reaction mode prompt shape:

```text
Use {{keyframe::id}} as the visual reference for identity, clothing, and setting, without forcing it to be an exact frame. The subject moves from [initial state] to [reaction] through [2-3 concrete micro-beats]. Camera [one controlled move]. Preserve style and identity; avoid frozen pose, exaggerated acting, identity drift, and unwanted cuts.
```

Gaze mode prompt shape:

```text
Use {{keyframe::id}} as the visual framework for identity, clothing, setting, and mood. Let the scene unfold as a natural observed moment: continuous breathing, subtle head/eye movement, small hand or hair motion, ambient light changes. Single slow camera move, no cuts, no dramatic pose change. Preserve the source look; avoid stiffness, overacting, identity drift, and random text.
```

Prompt length:

- Prefer concise prompts for image-to-video. Excessive detail can fight the image.
- Add time bands only when a reaction genuinely needs ordered sub-beats.
- If the image is a storyboard/collage, use Path D instead.

### Path D: Storyboard-Driven

Use when a reference image is a multi-panel storyboard, comic page, contact sheet, or collage of sequential frames.

First classify panel relationships:

- Continuous action chain: same subject, same place, one event split into motion slices. Merge panels into a single continuous action or a small number of phases.
- Sequential scenes: same subject or theme, coherent time/place progression. Use time bands or separate clips.
- Independent montage: different places/times/framing. Use an emotion/theme as the glue, or route to editing.

MovScript choices:

- If panels are <=4 and total duration fits the model, one content-unit prompt with time bands can work.
- If panels are >=5 or need independent review, create storyboard/expression-unit content units and route through editing.
- Always prevent the model from reproducing panel borders, labels, grid lines, UI, or frame numbers.

Prompt guard:

```text
Use {{storyboard::id}} as storyboard guidance only. Do not reproduce panel borders, grid lines, labels, numbers, captions, UI, or collage layout. Each panel should become a full-screen shot or clip.
```

## Z/Y/X/F Camera Codec

Use Z/Y/X/F internally to choose camera language, then write natural language in the final prompt.

- Z distance controls information scale: extreme close-up, close-up, medium, full shot, wide, extreme wide.
- Y height controls power relation: overhead, high angle, eye level, slight low angle, low angle, worm's-eye.
- X angle controls orientation: front, three-quarter, profile, back view.
- F lens/identity controls optical feel: wide angle, 35mm natural, 50mm cinematic, 85mm portrait, macro, anamorphic, POV, over-the-shoulder, mirror/reflection, frame-within-frame, symmetry, negative space.

Use at most two major camera axes in one shot. If the prompt asks for push-in, orbit, and crane-up all at once, split it into phases or remove one axis.

Avoid close-up plus large orbit on human faces; it often causes identity or face instability. Prefer medium close-up or wider when orbiting.

Emotion shortcuts:

- Pressure/danger: close-up or medium close-up, low angle, frontal, slow push-in, longer lens, dark low-key light.
- Loneliness: wide or extreme wide, high angle or back view, slow pullback, cool palette.
- Chaos/urgency: medium shot, handheld tracking, 35mm, quick pans, high contrast.
- Romance/memory: medium close-up, gentle orbit, 85mm or soft bokeh, warm light.
- Hero/power: three-quarter/full body, low angle, slow push-in, backlight.
- Suspense: side/profile, slow lateral move, rack focus, low saturation, optional slight Dutch angle.
- Ritual/formality: symmetrical frontal composition, locked-off or slow push-in, controlled lighting.

## Aesthetic Constraint Layer

Use this only when the user asks for commercial, cinematic, premium, game-trailer, product, fashion, fantasy, sci-fi, or epic quality. Do not overload simple image-to-video prompts.

Layer order:

1. Quality anchor: renderer/photography/VFX standard when useful.
2. Atmosphere continuity: one physical atmosphere across the clip, such as haze, rain, dust, neon reflection, or soft daylight.
3. Lighting: source -> behavior -> color. Example: "cold monitor light from below reflects on glass, warm practical lamp rim-lights the face."
4. Material details: skin, fabric, metal, glass, liquid, plastic, dust, scratches, fingerprints.
5. Composition: remove clutter, use strong geometry, negative space, foreground/midground/background layers.

Project shortcuts:

- Tech product: minimal geometry, metal/glass, neon or white-gold palette, controlled reflections.
- Luxury/fashion: clean background, large negative space, fabric texture, soft studio or elegant low-key light.
- Game/fantasy trailer: strong silhouette, volumetric light, armor/skin/material detail, cold/warm conflict.
- Emotional story: natural materials, skin/fabric detail, warm/cool gradient, restrained camera.

## Editing Rhythm for Generated Clips

Use when the final output is longer than a single generated clip or when multiple candidates will be assembled.

Common formulas:

- Breathing: short-short-short-long. Good for daily, travel, product use, calm explainers.
- Heartbeat: steady beats then faster cuts. Good for suspense, sports, chase, tension.
- Wave: small-medium-large-peak-calm. Good for emotional stories, music videos, brand films.
- Bullet-time: normal -> slow-motion detail -> quick impact. Good for product reveal or action climax.
- Pulse: increasingly dense very short shots then a held payoff. Good for promos and trailers.
- Silent hammer: long quiet hold -> short visual strike -> longer quiet hold -> stronger strike. Good for luxury, horror, avant-garde.

AI clip-specific editing rules:

- Trim unstable starts/ends of generated clips when assembling.
- Generate extra material so the editor can choose stable sections.
- Repeat color/style lock in each source prompt when clips must match.
- Use fast cuts or wider shots to hide minor AI artifacts.
- Choose transitions intentionally: hard cut for similar composition, match cut for shared shape/action/color, dissolve for memory/emotion, flash/black for time break.

For MovScript, these are editing concerns. Switch to the `editing` skill when the user asks to assemble, trim, color-match, subtitle, render, or export.

## Seedance Prompt Review

Before calling generation, confirm:

- The request is routed to Path A, B, C, or D.
- The prompt uses MovScript refs and resource inputs rather than raw `@图片` placeholders.
- Every reference has an explicit role and any negative-transfer rule needed for that role.
- The prompt is understandable from prompt plus resolved refs alone; hidden story context has been converted into visible action, camera, lighting, timing, or sound.
- Image-driven prompts are concise and do not fight the image.
- Storyboard/collage prompts explicitly reject grid borders, labels, UI, and panel layout.
- Camera direction uses a coherent Z/Y/X/F-derived move with no overloaded axes.
- Aesthetic constraints are useful, not decorative noise.
- Long videos or multi-clip outputs are planned for editing rather than one impossible prompt.
