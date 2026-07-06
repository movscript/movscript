# Continuity Asset Prompts

Use this reference when a reusable concrete entity must stay consistent across image, keyframe, storyboard, video, audio, or editing work. It turns "make the character/product/place/scene space consistent" into a MovScript asset-ref workflow and a production-ready asset prompt.

## When to Use

Use this before downstream generation when any of these are true:

- A character, product, prop, place, scene space, set, costume, instrument, material, vehicle, creature, voice identity, or recurring environment state appears in more than one shot or scene.
- The user dislikes a generated look/sound and wants refinement.
- A downstream video depends on stable identity, silhouette, layout, material, costume, or voice tone.
- A model prompt needs `{{asset::id}}` as a tracked dependency instead of a loose raw resource.

Do not use this for abstract style, mood, genre, quality rules, one-off camera direction, or temporary prompt notes. Put those in project standards, keyframes, storyboards, or the scene/video prompt as appropriate.

If the user says "场景" and means a reusable location, environment, room, stage, or set, treat it as a `setting` that can have `asset_ref` layout/state references. Use `scene_moment` only for the dramatic/action beat that happens there.

## MovScript Asset Path

Asset stabilization should follow this order:

```text
setting
-> setting_state
-> asset
-> asset_ref 内容制作任务
-> generated/imported candidates
-> user/workflow adopt/select
-> downstream refs such as {{asset::id}}
```

The generated media is not stable just because a job succeeded. It becomes continuity evidence only after it is written as a 内容制作任务 candidate and adopted/selected.

## Setting Reference Set Source-of-Truth

Use this when the user asks for a group, batch, set, or "all reference images" for one setting or setting state. Do not generate multiple setting reference images in parallel from text. A reference set must have one source-of-truth base asset first, then derivative assets that explicitly reference it.

Reference set path:

```text
setting
-> base setting_state
-> base asset
-> base asset_ref 内容制作任务
-> user/workflow adopts or selects the base candidate
-> derivative asset_ref 内容制作任务 that reference {{asset::base_*}}
-> user/workflow adopts useful derivative candidates
-> downstream storyboard/keyframe/video prompts use selected refs
```

Rules:

- Generate and adopt/select the base asset before derivative views, states, sheets, or detail callouts. If no adopted/selected base exists, stop and ask the user to adopt/select a base or generate the base first.
- Every derivative `asset_ref` prompt must reference the selected base asset with a semantic ref such as `{{asset::base_character_id}}`, `{{asset::base_room_layout}}`, or `{{asset::base_prop_shape}}`. Do not rely on repeated text descriptions as the source of truth.
- Keep the same confirmed project style baseline through the base and every derivative prompt. The base asset provides identity/layout/material continuity; project style provides global visual consistency.
- Create only derivatives that have a downstream use. Prefer a small, coherent reference set over exhaustive sheets that will not guide generation.

Common source-of-truth bases:

- Character/person: base identity or neutral full-body reference first; then multi-view sheet, expression row, costume/state variants, makeup, injury, wet/dry, or age variants.
- Place, scene space, room, set, or environment: base layout or clean wide view first; then key angles, detail callouts, day/night/weather/state variants, dressing changes, or damage variants.
- Prop, product, vehicle, instrument, or material: base shape/material reference first; then orthographic views, scale/detail callouts, open/closed states, wear/damage variants, or usage-safe variants.
- Costume or makeup tied to a person: reference the selected character base identity first, then create the costume/makeup asset as a state variant. Do not let costume generation drift the character identity.

## Scene Reference Pack

Use this specialized setting reference set when the setting is a place, scene space, room, set, exterior location, stage, or environment. Do not treat scene reference work as a flat list of pretty images. A stable scene pack has a visual source, a structural source, then only useful derivative views.

Keep this inside existing MovScript architecture:

```text
setting
-> setting_state
-> asset slots such as base_scene_view / topdown_layout_ref / corner_view_ref
-> asset_ref 内容制作任务
-> adopted/selected candidates
-> downstream storyboard/keyframe/video prompts
```

Do not create new entity types for floor plans, control maps, or structure notes. Store them as `asset` slots and `asset_ref` prompts/candidates under the setting state.

Scene pack order:

1. `base_scene_view`: first adopted/selected visual mother reference. Prefer a clean wide or three-quarter view that shows entrances, windows, major fixed furniture/landmarks, material palette, scale, and lighting. This is the visual source of truth.
2. `scene_structure_inventory`: write the structure into the next derived `asset_ref.edit_prompt`, not as a new domain entity. Capture boundaries, entrance/window count and position, major object placement, orientation labels, height/level changes, walk paths, and fixed vs movable objects.
3. `topdown_layout_ref`: derive an abstract top-down floor plan, zone map, or object-placement map from `{{asset::base_scene_view}}`. It should clarify geometry and object placement, not redesign the room and not become a polished illustration.
4. `clean_plate_ref`: optional clean no-character or low-clutter view for downstream keyframes/video.
5. `corner_view_ref` / `cardinal_view_ref`: optional north/east/south/west, front/back/side, or four-corner views. Each must cite `{{asset::base_scene_view}}` and, when available, `{{asset::topdown_layout_ref}}`.
6. `depth_line_layout_ref`: optional depth, lineart, canny-like, sketch, mask, or annotated control image when the selected model/tool supports structural conditioning. Store it as a RawResource/candidate if downstream generation will use it.
7. `material_detail_ref` and `state_ref`: optional material callouts and day/night/weather/damage/dressing states after the base and layout are stable.
8. `shot_ref` or storyboard/keyframe refs: scene-specific camera compositions come last. They reference the selected scene pack assets instead of redefining the location from text.

Prompt rules for scene derivatives:

- Top-down prompts must say they are derived from the selected base scene, for example: `Derive an abstract top-down layout from {{asset::base_scene_view}}; preserve room shape, entrances, windows, fixed furniture placement, scale relationships, and orientation. Do not redesign the space.`
- Corner/cardinal view prompts must use both the visual and structural anchors when available: `Use {{asset::base_scene_view}} as the visual source and {{asset::topdown_layout_ref}} as the layout source. Show the same room from [angle].`
- Clean plate, material detail, and state prompts must preserve the selected layout unless the state explicitly changes dressing or damage.
- If a derivative contradicts the base in door/window count, major object placement, orientation, scale, material palette, or light-source logic, do not use it as a stable downstream reference. Regenerate that derivative or ask the user which source should win.

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
   Name the concrete entity and why it needs continuity: hero character, villain costume, product packshot, room/set layout, damaged prop state, voice identity.

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

Use only for recurring locations, scene spaces, sets, or stable environment states. Keep it layout-focused, not final-scene dramatic.

```text
Clean environment layout reference for [place/state]. Show the stable spatial layout: [entrance/windows/furniture/landmarks/paths], neutral daylight or soft even interior lighting, wide view with clear geometry and readable scale, no dramatic action. Preserve [recurring visual identifiers]. Avoid characters, heavy mood lighting, extreme camera angle, clutter that hides layout, random text.
```

### Scene Base View

Use as the first selected visual mother reference for a reusable place, room, set, exterior location, or environment.

```text
Clean wide three-quarter scene reference for [place/state]. Show the whole reusable space clearly: [room/area shape], [entrances], [windows/openings], [major fixed furniture/landmarks], [floor/wall/ceiling or exterior materials], [paths/levels], and [signature props]. Neutral readable lighting, minimal clutter, no characters, no dramatic action, stable perspective, clear scale relationships. Preserve [recurring identifiers]. Avoid extreme lens distortion, hidden corners, inconsistent architecture, extra doors/windows, random text, and mood lighting that hides layout.
```

### Scene Top-Down Layout

Use only after `base_scene_view` has been adopted/selected. This is a structural reference, not a beauty image.

```text
Derive an abstract top-down layout from {{asset::base_scene_view}} for [place/state]. Preserve the room/area shape, entrance/window positions, major fixed furniture and landmarks, paths, levels, and scale relationships from the selected base scene. Use simple floor-plan or zone-map styling, readable labels only if requested, clean flat colors or linework, no dramatic lighting, no people, no redesign of the space, no new doors/windows/furniture.
```

### Scene Corner or Cardinal View

Use after `base_scene_view`, and preferably after `topdown_layout_ref`, when downstream shots need angle continuity.

```text
Use {{asset::base_scene_view}} as the visual source of truth and {{asset::topdown_layout_ref}} as the layout source. Show [place/state] from [north/east/south/west/front/back/corner angle]. Preserve the same room shape, entrances, windows, major furniture/landmarks, materials, scale, and light-source logic. Clean reference image, no characters, no action, minimal clutter. Avoid redesigning the space, moving fixed objects, adding/removing doors or windows, changing materials, or contradicting the selected layout.
```

### Voice or Sound Identity

Use when the selected generation workflow supports voice/audio references or when audio resources will become reusable source material.

```text
Voice identity reference for [speaker/role]: [age/voice texture/register/accent/pacing], clean dry recording style, short neutral line with steady emotion, no background music, no reverb, no crowd noise. Preserve timbre and articulation for later dialogue generation.
```

## Layering Strategy

Build assets from simple to complex:

1. Base identity, shape, material, layout, or voice timbre.
2. Adopt/select the base candidate as the source of truth.
3. Multi-view/reference sheet when consistency matters, referencing the selected base asset.
4. State variants that reference the selected base asset.
5. Scene-specific keyframes or storyboards that reference selected assets.
6. Video prompts that reference selected assets/关键帧/分镜图 and add motion.

Do not skip to scene-specific video prompts when the recurring identity itself is still unresolved.

For reusable scene/place packs, layer scene evidence more strictly: adopt/select `base_scene_view`, derive `topdown_layout_ref`, optionally create clean plates/corner views/control maps/details/states, then use those selected assets in 分镜图/关键帧/video. Do not generate a top-down layout, corner view, or final shot by repeating text only when the base scene exists.

## Seedance Human Identity Gate

When the downstream target is Seedance/即梦 video and the scene depends on a reusable human face or identity, stabilize the portrait before video generation.

Accepted upstream paths:

- Virtual portrait certification: create or import a virtual-person portrait, write it as an `asset_ref` candidate, adopt/select it, then certify the selected RawResource into the Seedance provider asset library.
- Real-person portrait certification: use only when rights/consent are confirmed, then write the portrait as an `asset_ref` candidate, adopt/select it, and certify the selected RawResource into the Seedance provider asset library.
- Seedream 5.0 lite identity generation: generate the identity image with Seedream 5.0 lite text-to-image, write/adopt it as an `asset_ref` candidate, and require valid `provider_generated_artifact.trust_claim.scope == "seedream5_lite_face_image"`.

If none of these upstream paths is complete, classify downstream Seedance video as `缺选择` or `可补图`, not `可生成`. Do not continue to Seedance video as a stable path until the portrait asset is adopted/selected and either certified or covered by the Seedream 5.0 lite trust claim.

## Prompt Ref Rules

- Use `{{asset::id}}` in downstream saved prompts when dependency tracking and selected-candidate semantics matter.
- Use direct `{{resource::123}}` or `reference_resource_ids` only for loose raw-resource guidance.
- Do not replace semantic refs with resolved resource numbers in author-written saved prompts unless the user explicitly provides a loose resource.
- Do not use `{{asset::id}}` downstream until the upstream `asset_ref` has an adopted/selected candidate. If usable asset candidates exist but none is adopted, stop and guide the user to adopt/select one. Continue without adoption only when the user explicitly asks for an unstable draft.
- For setting reference sets, do not author derivative `asset_ref` prompts without a semantic base ref. A derivative prompt such as "same character, side view" is not enough; write the selected source explicitly, for example `Use {{asset::base_character_id}} as the identity anchor`.

## Quality Checks

Before generating a continuity asset candidate, run this quality check, then summarize the full asset-generation context to the user and wait for explicit confirmation. Before accepting an existing candidate, confirm:

- The asset represents a concrete reusable entity/state, not an abstract style.
- The prompt protects identity/state and avoids scene-specific motion or camera drama.
- Background and lighting support reuse.
- Multi-view/expression/reference-sheet complexity is justified by downstream need.
- For scene packs, top-down layouts, corner/cardinal views, clean plates, detail callouts, and state variants preserve the selected base scene's door/window count, object placement, orientation, scale, materials, and light-source logic.
- The candidate will enter 内容制作任务 candidate flow and wait for adoption/selection.
- Downstream prompts will reference the selected asset semantically with `{{asset::id}}`.
- For a reference set, derivative assets cite the adopted source-of-truth base asset rather than restating the same description from scratch.
