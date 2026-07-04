# Prompt Mode Router

Use this reference before writing or diagnosing image/video prompts when the request has multiple possible output types, reference roles, model families, or failure modes. It distills the prompt-skill research snapshot from 2026-07-05 into MovScript-native rules.

## Route Before Writing

Do not start by drafting the prompt. First classify:

- **Image mode**: storyboard, keyframe, asset, product/prop, edit, poster, infographic, UI, environment, scene-specific still.
- **Video mode**: text-to-video, image-to-video, start/end transition, multi-reference, storyboard-driven, edit, extension, music-sync, ad/social hook, narrative scene, product demo.
- **Model family**: Seedance-like, GPT Image-like, Seedream-like, Kling/Veo-like, audio/dialogue-capable, text-strong image model, reference-heavy multimodal model.
- **Review need**: fast unstable draft, stable dependency candidate, reusable continuity asset, downstream editing source, or final export input.

If the output is project-scoped, keep MovScript semantics in the authored prompt. Provider syntax such as `@image1`, `@video1`, or `图片1` belongs in adapters or provider prompts, not in content-unit `edit_prompt`.

## Reference Role Table

Every referenced asset, storyboard, keyframe, candidate, audio cue, or RawResource should have a role in the prompt.

| Role | Use for | Common constraints |
| --- | --- | --- |
| `identity` | person, character, product, prop, costume, voice identity | preserve face, wardrobe, logo, proportions, timbre |
| `first_frame` | starting composition or locked initial visual anchor | preserve layout, lighting, pose, no new props |
| `end_frame` | target final state | continuous transition, no abrupt cut |
| `style` | color, medium, art direction, mood | transfer style only; do not copy subject/content |
| `action` | pose sequence, motion, gesture, choreography | follow motion only; preserve target identity |
| `camera` | framing, movement, focus, shot grammar | match camera path, not scene content |
| `storyboard` | blocking and shot sequence | guidance only; do not copy panel borders, captions, grid, frame numbers |
| `audio` | music, beat, dialogue, ambience, foley | sync visible beats; do not invent unsupported audio |
| `edit_source` | source image/video to modify or extend | preserve named elements; change only specified target |

Example:

```text
Use {{asset::hero_base}} as identity and wardrobe reference.
Use {{keyframe::shot_start}} as first-frame composition reference.
Use {{storyboard::fight_panels}} as action order only; do not copy panel borders, captions, or layout.
Use {{resource::123}} as music rhythm reference for beat-aligned motion.
```

## Video Prompt Rules

- Text-to-video needs a hook, subject/state, visible action progression, environment, camera, lighting/color, audio when supported, and concrete negatives.
- Image-to-video should trust the image. Do not re-describe every visible detail; describe what moves, changes, performs, or must remain locked.
- Multi-reference prompts must explain the role of each reference and what must not transfer.
- Long or multi-beat work should split into assets, storyboards/keyframes, short content-unit clips, and editing assembly. Do not hide a long video inside one giant prompt.
- A short clip should use one main camera axis and, at most, one supporting focus or height change.
- Audio belongs only when the model/workflow supports it; otherwise route music sync, voice placement, subtitles, and burn-in to editing.

Seedance-style base fields:

- Subject: who/what and visible state.
- Motion: action over time.
- Environment: location, era, weather, set layout.
- Aesthetics: style, material, color, atmosphere.
- Camera: shot size, angle, movement, focus, composition.
- Audio: dialogue, ambience, foley, music, silence, rhythm when supported.
- References: each reference role and forbidden transfer.
- Constraints: shot-specific failure risks.

## Image Prompt Rules

Choose the image purpose first:

- **storyboard**: composition, blocking, action, camera, lighting; schematic/stylized; not final identity.
- **keyframe**: one precise visual anchor for downstream video.
- **asset**: reusable identity/product/prop/state, clean background, weak plot binding.
- **product/prop**: materials, angles, silhouette, logo/text rules, reflection, multi-view when useful.
- **edit**: preserve/change-only structure.
- **infographic/UI/poster**: layout, information hierarchy, text requirements, reader, typography, and export surface.

Recommended structure:

```text
Purpose: [output use]
Subject: [identity/state/posture/material/product details]
Composition: [shot size, angle, crop, placement, negative space, attention path]
Setting: [space, era, weather, set dressing, surfaces]
Lighting/Color: [source, direction, contrast, temperature, grade]
Style/Medium: [photo, sketch, animatic, 3D, UI, infographic]
Details: [exact text/logo/structure that must be right]
Constraints: [preserve, change only, forbidden failures]
```

For edits:

```text
Edit {{resource::123}}. Preserve [identity, pose, angle, background geometry, light direction, shadows, color grade]. Change only [specific target]. Do not alter [critical invariants] or add [forbidden extras].
```

## Prompt Quality Score

Before saving, compiling, requesting paid video confirmation, or submitting generation, score the prompt 0-2 on each item. A stable generation prompt should usually be at least 12/16. If it scores lower, rewrite before generation unless the user explicitly requests a rough unstable draft.

| Item | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Mode routing | wrong/unknown | plausible but vague | output type and model family are clear |
| Subject/action/environment | missing | partial | concrete and visible/audible |
| Time or frozen moment | absent | implied | precise timeline or single-frame moment |
| Camera/composition | absent | generic | specific, not overloaded |
| Reference roles | refs missing/ambiguous | some roles named | every ref has role and forbidden transfer |
| Preserve/change/constraints | generic | partially concrete | shot-specific and failure-oriented |
| Hidden context | relies on story memory | some shorthand remains | self-sufficient after refs resolve |
| MovScript semantics | provider syntax or raw paths | mixed | semantic refs/resources are valid |

## Failure Diagnostics

| Failure | Likely cause | Fix |
| --- | --- | --- |
| Identity drift | no selected identity asset, reference role unclear, scene prompt too heavy | stabilize/adopt `asset_ref`; write identity role; simplify downstream action |
| Muddy action | too many actions in one clip | split timeline or content units; keep one visible progression |
| Chaotic camera | camera axes overloaded | choose one primary movement plus one focus/height change |
| Garbled text | model weak at text or text too dense | route text to editing/subtitles or a text-strong image model; split infographic |
| Product/logo deformation | product reference role unclear | create/adopt clean product asset, multi-view when needed, preserve logo/material/proportion |
| Storyboard grid copied | storyboard treated as final image | say storyboard guidance only; forbid panel borders, captions, grid, frame numbers |
| Generic "cinematic" look | abstract taste words without production detail | replace with motivated light, lens/framing, materials, color, sound, and physical detail |
| Downstream blocker | upstream candidate missing/stale/unselected | ask for adoption/selection or continue only as explicit unstable draft |

## Model Family Signatures

- **GPT Image-like**: good for text, UI, brand assets, editing preservation, information layout, and precise image briefs.
- **Seedream-like**: useful for human/product reference consistency, Chinese scenes, knowledge-grounded images, and multi-reference asset work.
- **Seedance-like**: write short director briefs with subject, motion, environment, aesthetics, camera, audio, references, constraints; use selected trusted references for face/identity-sensitive video.
- **Kling/Veo-like**: treat as model-specific video families with their own reference and duration constraints; do not copy Seedance-only syntax by default.

## Research Anchors

The 2026-07-05 research snapshot prioritized practical patterns from Seedance-focused and cross-model prompt skills. Use these as method anchors, not as provider syntax to paste into MovScript prompts:

- Seedance-focused: `dexhunter/seedance2-skill`, `songguoxs/seedance-prompt-skill`, `MapleShaw/seedance2.0-prompt-skill`, `liangdabiao/make-prompt-seedance2`, `beshuaxian/higgsfield-seedance2-jineng`.
- Scenario/template systems: `rediumvex/ai-video-generator-claude`, `cclank/lanshu-awesome-ai-video-kit`, `Hao0321/ai-media-generator`, `smixs/visual-skills`, `CyberJ0605/cinematic-video-prompt-engineer-skill`.
- Official/model-side guidance: ByteDance Seedance 1.0/2.0, Seedream 4.0, BytePlus Seedance prompt guides, OpenAI GPT Image prompting guide.

Absorb routing, reference roles, prompt scoring, and failure diagnosis. Do not absorb unverified prices, fixed duration limits, provider-only placeholders, broad negative-word dumps, or unselected upstream candidates as stable dependencies.
