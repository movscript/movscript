# Image Prompt Craft

Use this reference before writing or updating a MovScript image-generation prompt, including `storyboard_ref`, `keyframe_ref`, `asset_ref`, non-person scene images, product/prop images, environment references, and image edits.

This file is an image prompt layer, not a provider adapter. Use available model IDs from `system_model_list`; prefer `gpt-image-2` for storyboards, schematic visual plans, environments, props, products, and non-person images, and prefer Seedream/Seedream 5.0 lite for reusable human/person identity images intended for Seedance video review.

## Image Prompt Pass

Before generating an image, fill the minimum useful parts:

1. Purpose
   Name what the image is for: storyboard panel, keyframe, character identity, prop reference, environment layout, product hero, style reference, thumbnail, poster, or edit guidance.

2. Subject
   Define the concrete subject, state, pose, wardrobe/materials, visible condition, and selected MovScript refs such as `{{asset::id}}` when continuity matters.

3. Composition
   Specify shot size, camera angle, crop, placement, foreground/background, negative space, panel count when needed, and where the viewer should look first.

4. Setting and Environment
   Describe physical place, era, weather, set dressing, surface detail, background elements, and layout. For reusable assets, keep the background clean.

5. Lighting and Color
   Name real light sources, direction, contrast, palette, and atmosphere. Avoid only saying "cinematic" or "beautiful".

6. Style and Medium
   Choose the visual form: schematic storyboard sketch, clean production design sheet, photoreal studio product image, anime keyframe, ink sketch, editorial poster, or UI-free reference image.

7. Details and Constraints
   Include identity/state locks, material readability, text rules, aspect/use constraints, and shot-specific negatives. Prefer concrete restrictions over generic long negative lists.

## Output-Type Patterns

### Storyboard Panel

Use for composition, blocking, camera, and rhythm evidence before video. Keep it schematic or stylized, especially when humans are present.

```text
Schematic storyboard frame for [story beat]. Subject/blocking: [roles, positions, foreground/background, props]. Setting/layout: [place and spatial anchors]. Composition: [shot size, camera angle, viewer attention path]. Lighting/color: [source and mood]. Style: rough cinematic storyboard sketch / stylized animatic frame, clear silhouettes, no photoreal real-person likeness. Avoid captions, panel borders, readable dialogue text, extra characters, random text, identity-detail portrait rendering, and confusing layout.
```

For multi-panel storyboard sheets, state the exact panel count and panel purpose, but keep downstream video clips split when the panels represent independently reviewable beats.

### Keyframe

Use for one frozen visual anchor that downstream video should preserve.

```text
Keyframe image for [scene moment / visual expression]. Use [selected refs] for continuity. [Subject/state] in [specific setting], frozen at [precise action or emotional moment]. Composition: [shot size, angle, placement, lens feel]. Lighting/color: [specific source, contrast, palette]. Style/texture: [project style]. Avoid motion blur unless intended, extra people, changed wardrobe/props, unreadable text, distorted hands, and identity drift.
```

### Non-Person Scene or Environment

Use `gpt-image-2` when available.

```text
Create an environment reference for [place/state]. Show [layout landmarks, entrances, furniture, props, surfaces] with [camera angle/shot size]. Lighting: [neutral or scene-specific source]. Style: [realistic / stylized / production design]. Keep geometry readable and reusable. Avoid characters, random text, clutter that hides layout, extreme mood lighting unless requested, and inconsistent scale.
```

### Product or Prop

Use for reusable objects, product images, tools, weapons, packaging, vehicles, signs, or inserts.

```text
Create a clean product/prop image of [object]. Composition: centered three-quarter view / required angle, crisp silhouette, enough negative space. Environment: plain studio or simple contextual surface. Lighting: soft directional light with readable material highlights. Details: [shape, material, color, markings, logo/text placement if required]. Avoid hands unless requested, deformation, wrong text/logo, extra parts, distracting reflections, and random labels.
```

### Human Identity Asset

Use `continuity-asset-prompts.md` as the primary reference. When the image will feed Seedance, prefer Seedream/Seedream 5.0 lite when available so the RawResource can carry trusted provider provenance. Keep the prompt identity-focused: neutral pose, clean background, stable wardrobe/features, and no one-off scene drama.

### Scene-Specific Human Image

Use only when a scene still/keyframe is needed, not as a reusable face identity. If it will feed Seedance as a face reference, route to Human Identity Asset instead.

```text
Scene key image for [beat]. Use {{asset::character_id}} for identity when selected. [Character] [pose/action state] in [setting] with [prop interaction]. Composition: [shot size, angle, placement]. Lighting/color: [specific source]. Style: [project style]. Avoid changing identity, extra people, distorted hands, random text, and photoreal real-person likeness when this is only storyboard guidance.
```

### Image Edit

When editing an existing RawResource, separate preserved elements from the change.

```text
Edit {{resource::123}}. Preserve [identity, pose, camera angle, composition, lighting, background, unchanged objects]. Change only [target element] to [desired state]. Keep perspective, shadows, reflections, material texture, and color grade physically consistent. Avoid global restyling, new objects, changed face/wardrobe, and layout drift.
```

## Script-Derived Images

When an image prompt comes from script text, run `content-unit-prompt-craft.md` first. Use its analysis to choose the image type, then write a single-frame prompt.

Do not paste dialogue or scene prose into the image prompt. Convert it into visible state:

- who is visible and where they stand;
- what prop or set element matters;
- what frozen gesture or reaction defines the beat;
- what camera angle and composition make the beat clear;
- what lighting/source/color expresses the mood;
- what must not appear.

## Quality Checks

Before submitting an image prompt, confirm:

- The prompt has a clear image purpose and target content-unit type.
- Subject, composition, setting, lighting, style, details, and restrictions are explicit enough to prevent guessing.
- A script-derived prompt is analyzed into visible single-frame direction, not pasted source text.
- Storyboard prompts stay schematic/stylized and avoid photoreal real-person likenesses.
- Human identity assets are routed through Seedream/Seedream 5.0 lite when intended for Seedance.
- Reusable assets avoid one-off scene lighting, camera drama, and action.
- Image edits clearly say what to preserve and what to change.
