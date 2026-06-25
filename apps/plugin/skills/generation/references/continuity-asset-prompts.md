# Continuity Asset Prompts

Use this reference when a reusable concrete entity must stay consistent across image, keyframe, storyboard, video, audio, or editing work. It turns "make the character/product/place consistent" into a MovScript asset-ref workflow and a production-ready asset prompt.

## When to Use

Use this before downstream generation when any of these are true:

- A character, product, prop, place, costume, instrument, material, vehicle, creature, voice identity, or recurring environment state appears in more than one shot or scene.
- The user dislikes a generated look/sound and wants refinement.
- A downstream video depends on stable identity, silhouette, layout, material, costume, or voice tone.
- A model prompt needs `{{asset::id}}` as a tracked dependency instead of a loose raw resource.

Do not use this for abstract style, mood, genre, quality rules, one-off camera direction, or temporary prompt notes. Put those in project standards, keyframes, storyboards, or the scene/video prompt as appropriate.

## MovScript Asset Path

Asset stabilization should follow this order:

```text
setting
-> setting_state
-> asset
-> asset_ref content unit
-> generated/imported candidates
-> user/workflow adopt/select
-> downstream refs such as {{asset::id}}
```

The generated media is not stable just because a job succeeded. It becomes continuity evidence only after it is written as a content-unit candidate and adopted/selected.

## Identity vs Motion

Separate what the entity is from what it does.

Identity belongs in the asset prompt:

- stable face/body/silhouette or product shape;
- wardrobe/costume/state;
- material, color, texture, logo placement when safe;
- front/side/back views or expression rows;
- neutral pose, neutral lighting, clean background;
- voice timbre or instrument tone when generating audio references.

Motion and scene direction belong downstream:

- camera movement;
- dramatic lighting;
- action beats;
- plot emotion;
- environmental interaction;
- final video style;
- scene-specific props that are not part of the reusable asset.

If an asset prompt contains too much story lighting, action, or camera drama, it becomes less reusable and may reduce downstream consistency.

## Asset Prompt Pass

Before generating an `asset_ref`, fill the minimum relevant parts:

1. Entity role
   Name the concrete entity and why it needs continuity: hero character, villain costume, product packshot, room layout, damaged prop state, voice identity.

2. Stable identifiers
   Define distinctive features that should survive downstream generation: silhouette, proportions, facial features, hairstyle, color blocks, material finish, markings, accessories, product geometry, logo placement, instrument body shape.

3. State
   Name the state/version: base look, formal costume, wet hair, damaged, dusty, night exterior, clean product, open packaging, calm voice, angry voice.

4. View strategy
   Choose one view when simple, or multi-view/reference-sheet when cross-shot consistency matters. Use expression rows or prop callouts only when needed.

5. Background and light
   Prefer white, light gray, or very clean backgrounds. Use even neutral light unless material readability needs a simple highlight.

6. Reuse constraints
   Add negatives that protect identity: no extra accessories, no alternate costume, no changed logo, no expression change, no extra limbs/fingers, no random text, no scene background, no dramatic shadows.

7. Downstream hook
   State how downstream prompts should refer to the selected candidate: `{{asset::id}}` for tracked dependencies, or direct `{{resource::123}}` / resource inputs for loose guidance.

## Output Patterns

### Character Base Identity

Use for the first stable look of a recurring character.

```text
Clean character identity reference for [character name/role]. [Age/build/silhouette], [face/hair/skin/wardrobe/accessories], neutral standing pose, relaxed expression, full body visible, front view, plain light-gray background, even soft studio lighting, natural proportions, clear hands. Preserve [distinctive features]. Avoid action pose, dramatic scene lighting, extra accessories, changed outfit, distorted hands, extra fingers, identity drift, random text.
```

### Character Reference Sheet

Use when future shots need stronger consistency than one portrait.

```text
Character reference sheet for [character name/role], plain white background, consistent identity across all views. Include front view, three-quarter view, side view, and back view of the same character in the same outfit, plus a small row of expressions: neutral, worried, angry, relieved. Keep proportions, hairstyle, face, costume, colors, and accessories identical in every panel. Avoid scene background, action poses, changing outfit, mismatched faces, extra characters, random text, distorted hands.
```

### Costume or State Variant

Use after a base identity has been selected.

```text
Use {{asset::base_character_id}} as the identity anchor. Create a [state/costume] variant: [specific changes]. Preserve face, body proportions, hairstyle, posture language, and core accessories from the selected base asset. Show a clean full-body front view on a plain light background with even lighting. Avoid changing identity, changing unrelated clothing details, adding scene props, dramatic lighting, and action poses.
```

### Product or Prop Reference

Use for products, tools, weapons, books, packaging, vehicles, or other reusable objects.

```text
Clean product/prop reference for [object name]. Show [shape, scale, material, color, markings, logo/label placement if required], centered on a plain white background, three-quarter front view, soft even studio lighting, crisp edges and readable silhouette. Include one small detail inset for [important detail] if needed. Avoid hands, scene background, random text, wrong logo placement, extra parts, deformation, reflections that hide the shape.
```

### Place or Environment Layout

Use only for recurring locations or stable environment states. Keep it layout-focused, not final-scene dramatic.

```text
Clean environment layout reference for [place/state]. Show the stable spatial layout: [entrance/windows/furniture/landmarks/paths], neutral daylight or soft even interior lighting, wide view with clear geometry and readable scale, no dramatic action. Preserve [recurring visual identifiers]. Avoid characters, heavy mood lighting, extreme camera angle, clutter that hides layout, random text.
```

### Voice or Sound Identity

Use when the selected generation workflow supports voice/audio references or when audio resources will become reusable source material.

```text
Voice identity reference for [speaker/role]: [age/voice texture/register/accent/pacing], clean dry recording style, short neutral line with steady emotion, no background music, no reverb, no crowd noise. Preserve timbre and articulation for later dialogue generation.
```

## Layering Strategy

Build assets from simple to complex:

1. Base identity, shape, material, layout, or voice timbre.
2. Multi-view/reference sheet when consistency matters.
3. State variants that reference the selected base asset.
4. Scene-specific keyframes or storyboards that reference selected assets.
5. Video prompts that reference selected assets/keyframes/storyboards and add motion.

Do not skip to scene-specific video prompts when the recurring identity itself is still unresolved.

## Seedance Human Identity Gate

When the downstream target is Seedance/即梦 video and the scene depends on a reusable human face or identity, stabilize the portrait before video generation.

Accepted upstream paths:

- Virtual portrait certification: create or import a virtual-person portrait, write it as an `asset_ref` candidate, adopt/select it, then certify the selected RawResource into the Seedance provider asset library.
- Real-person portrait certification: use only when rights/consent are confirmed, then write the portrait as an `asset_ref` candidate, adopt/select it, and certify the selected RawResource into the Seedance provider asset library.
- Seedream 5.0 lite identity generation: generate the identity image with Seedream 5.0 lite text-to-image, write/adopt it as an `asset_ref` candidate, and require valid `provider_generated_artifact.trust_claim.scope == "seedream5_lite_face_image"`.

If none of these upstream paths is complete, classify downstream Seedance video as `缺选择` or `可补图`, not `可生成`. Do not continue to Seedance video as a stable path until the portrait asset is adopted/selected and either certified or covered by the Seedream 5.0 lite trust claim.

## Prompt Ref Rules

- Use `{{asset::id}}` in downstream content-unit prompts when dependency tracking and selected-candidate semantics matter.
- Use direct `{{resource::123}}` or `reference_resource_ids` only for loose raw-resource guidance.
- Do not replace semantic refs with resolved resource numbers in author-written content-unit prompts unless the user explicitly provides a loose resource.
- Do not use `{{asset::id}}` downstream until the upstream `asset_ref` has an adopted/selected candidate. If usable asset candidates exist but none is adopted, stop and guide the user to adopt/select one. Continue without adoption only when the user explicitly asks for an unstable draft.

## Quality Checks

Before generating or accepting a continuity asset candidate, confirm:

- The asset represents a concrete reusable entity/state, not an abstract style.
- The prompt protects identity/state and avoids scene-specific motion or camera drama.
- Background and lighting support reuse.
- Multi-view/expression/reference-sheet complexity is justified by downstream need.
- The candidate will enter content-unit candidate flow and wait for adoption/selection.
- Downstream prompts will reference the selected asset semantically with `{{asset::id}}`.
