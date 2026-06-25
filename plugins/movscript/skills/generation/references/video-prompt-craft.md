# Video Prompt Craft

Use this reference before writing or updating a MovScript video-generation prompt. It turns project context, selected candidates, and user intent into a professional prompt that reads like scene direction instead of a loose keyword list.

## Role in MovScript

This file is a prompt-craft layer, not a provider adapter. Keep MovScript semantics intact:

- Use MovScript prompt refs such as `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, `{{candidate::id}}`, and `{{resource::123}}`.
- Do not write provider-only reference syntax such as `@image1`, `@video1`, or `@audio1` in a content-unit prompt. Translate those ideas into MovScript refs or `input_resource_ids` / `reference_resource_ids`.
- Treat duration, aspect ratio, resolution, model name, and provider parameter keys as external generation settings unless the specific provider requires those words inside the prompt.
- For image-to-video, use the selected image as the visual anchor. The prompt should focus on motion, performance, camera, environmental change, and audio, not re-describe every visible detail.
- For content-unit generation, a strong prompt still produces a candidate, not a final accepted selection.

## Prompt Pass

Before generating video, run this pass mentally and fill any missing part that materially affects the result.

1. Intent
   Identify whether the prompt is for a direct scene moment, image-to-video animation, keyframe transition, reference-shot imitation, video extension, video edit, music-synced clip, or multi-shot sequence. For narrative scenes, keep a one-line story overview, then translate it into shootable direction.

2. Continuity
   Anchor reusable identity first: character, costume, prop, place, product, voice, art direction, selected storyboard, selected keyframe, and house-style references. Use selected/adopted MovScript refs when dependency tracking matters.

3. Subject and State
   Describe the main subject with production-relevant traits: age/role/species/object type, wardrobe, silhouette, expression, posture, visible condition, and any prop interaction. Avoid vague subjects like "a person" when the project context provides a concrete entity.

4. Setting and Texture
   Ground the scene in a physical place with era, weather, set dressing, surface detail, atmosphere, and visible environmental motion. Replace generic phrases such as "cinematic environment" with concrete cues.

5. Action Timeline
   Direct what happens over time: beginning, middle, and end. For longer clips or complex action, use time bands such as `0-3s`, `3-6s`, `6-10s`. Each band should change action, camera, emotion, or reveal.

6. Camera and Blocking
   Specify shot size, composition, lens feel, camera movement, subject blocking, and attention shifts. Prefer cinematic verbs: slow dolly push-in, lateral tracking, handheld drift, rack focus, whip pan, tilt up, locked-off wide, overhead, low-angle tracking.

7. Lighting and Color
   Name real light sources and color behavior: golden-hour sun through curtains, flickering neon on wet pavement, candlelight on skin, cold monitor glow, practical lamps, smoke catching a backlight. Avoid only saying "dramatic lighting".

8. Performance and Emotion
   Direct expression, body language, micro-action, tension, rhythm, and interaction. If dialogue is present, identify the speaker, tone, pause timing, and any physical action around the line.

9. Audio
   Include audio only when the selected model/workflow supports it or when audio assets are being generated separately. Use concrete sound design: room tone, footsteps, fabric rustle, engine hum, distant sirens, music tempo, beat-sync moments, dialogue tone.

10. Negative Constraints
   Add only constraints that matter for this shot: identity drift, extra limbs/fingers, distorted hands, unreadable text, random subtitles, morphing objects, jitter, cartoon look, over-saturated colors, stock-photo staging, frozen expression, unwanted smiles, camera cuts, or duplicated subjects.

## Narrative to Shootable Direction

Do not remove story intent. Use it as the overview, then make the model-facing prompt executable.

When a source prompt says a character "pressures", "threatens", "begs", "seduces", "hides guilt", "forces a choice", "realizes the truth", or "protects the family", rewrite the abstract beat into visible and audible layers:

- Story overview: the dramatic purpose of this beat in one sentence.
- Cast and blocking: who is present, where each person stands, who is foreground/background, who holds or touches which prop.
- Visible action: gestures, posture changes, object movement, entrances/exits, reactions, and cause/effect beats.
- Dialogue or voice: speaker, short line, tone, timing, and whether subtitles should be absent.
- Lighting and color: practical light sources, direction, contrast, palette, and which faces/objects are emphasized.
- Camera and rhythm: shot size, angle, movement, focus shift, hold/cut behavior, and the viewer's attention path.
- Audio: room tone, impact sounds, clothing/prop sounds, footsteps, music or silence when supported.

Use this layered style especially for short-drama, dialogue, family conflict, romance, suspense, comedy, and any scene where the user's wording is more like plot summary than production direction.

Bad:

```text
The door is kicked open. Three relatives block the doorway and pressure him to pay 200 yuan.
```

Better:

```text
Story overview: three relatives invade the cramped room and turn a money demand into a physical threat.
Cast/blocking: the older woman stands in the center of the doorway, one hand gripping the doorframe; the younger man leans behind her left shoulder; the young woman in a red coat stands on the right with arms crossed. The father holds the child near the wooden bed; the wife freezes beside the old square table.
Action/dialogue: the door slams against the wall and dust shakes from the peeling plaster. The older woman steps half a pace inside, jabs a finger toward the father, and snaps, "The 200 yuan comes out today." The younger man taps the doorframe with a mocking smile. The young woman glances at the wife's empty ring finger; the wife instinctively touches it and lowers her eyes.
Light/camera/audio: cold daylight from the hallway silhouettes the three intruders while the room stays dim and gray. Handheld medium close-up from inside the room, then a low-angle push toward the doorway. Door impact, falling dust, tense room tone; no subtitles.
```

## Output Patterns

### Direct Scene Moment

Use one coherent prompt when the scene moment is a single continuous action. The prompt may be one paragraph, but it must contain identity, setting, action progression, camera, lighting, style/texture, and negatives when needed.

Template:

```text
{{scene_moment::id}} with {{asset::character_id}} as the visual identity anchor. [Subject/state] in [specific setting]. At first [opening action], then [development], finally [ending beat]. Camera: [shot size + movement + lens/composition]. Lighting/color: [specific sources and palette]. Performance/audio: [emotion, dialogue, ambient sound if supported]. Avoid [shot-specific failures].
```

### Layered Narrative Beat

Use this when the source material is story-heavy or dialogue/action driven. Keep the story overview short; spend most tokens on shootable layers.

Template:

```text
Story overview: [dramatic purpose of this beat].
Cast/blocking: [characters, positions, props, foreground/background].
Action/dialogue: [visible actions in order; short labeled dialogue lines if supported].
Light/color: [sources, direction, contrast, palette, emphasized faces/objects].
Camera/rhythm/audio: [shot size, angle, movement, focus, pacing, sounds].
Avoid [shot-specific failures].
```

### Image-to-Video

Do not over-describe the reference image. Treat it as identity/composition evidence and direct only the changes.

Template:

```text
Use {{keyframe::id}} as the locked visual anchor. Preserve the subject identity, wardrobe, layout, and overall composition. Animate [specific motion/action] while [environmental change] unfolds. Camera [movement] and [focus/composition change]. Keep [style/lighting continuity]. Avoid identity drift, new props, unwanted cuts, and morphing.
```

### Start/End Keyframe Transition

Use this when a model supports start and end frames, or when MovScript has selected keyframes that should constrain the motion.

Template:

```text
Transition from {{keyframe::start_id}} to {{keyframe::end_id}}. Preserve shared identity, palette, lighting direction, and set geometry. The motion begins with [start action], passes through [middle transformation or camera move], and resolves into [end state]. Keep the transition physically plausible and continuous; avoid abrupt cuts, subject duplication, and style changes.
```

### Reference-Shot Imitation

Use this only after the shot-imitation workflow has analyzed frames or a contact sheet.

Template:

```text
Recreate the shot grammar from {{storyboard::id}} while replacing the subject/context with [project subject/context]. Match the reference pacing, camera path, composition shifts, and action rhythm, but preserve MovScript project identities and selected assets. Describe each reference-controlled element explicitly: camera, blocking, light direction, movement timing, and final reveal.
```

### Multi-Shot Sequence

Use multi-shot structure only when the user asks for multiple clips/shots, the provider supports multi-shot prompting, or the workflow is explicitly going through editing composition.

Template:

```text
Shared continuity: [selected assets, setting, palette, style, negative constraints].
Shot 1 (0-3s): [framing, subject, action, camera, lighting, audio].
Shot 2 (3-6s): [framing, subject, action, camera, lighting, audio].
Shot 3 (6-10s): [framing, subject, action, camera, lighting, audio].
```

For MovScript content-unit generation, prefer separate expression-unit material content units plus editing when the shots must become independently selectable assets.

### Video Extension or Edit

When extending or editing an existing video resource, preserve what should stay stable and name the exact change.

Template:

```text
Continue from {{resource::123}}. Preserve the existing subject identity, camera style, lighting, color grade, and spatial layout. Extend only the next action: [new action timeline]. The ending should [new final state]. Avoid resetting the scene, changing wardrobe, adding unrelated subjects, or cutting to a new location.
```

For edits:

```text
Modify {{resource::123}} while preserving the original camera movement, timing, environment, and all unchanged subjects. Change only [target element/action/state] into [desired result]. Keep the edit physically integrated with the existing light, perspective, and motion. Avoid global restyling or replacing unaffected objects.
```

## Camera Vocabulary

Use only camera language that helps the model. Prefer these terms when they match the shot:

- Shot size: establishing wide, full shot, medium shot, medium close-up, close-up, extreme close-up, macro insert, overhead, low angle, high angle, POV.
- Movement: slow dolly push-in, dolly pullback, lateral tracking, handheld drift, steadicam follow, orbit, tilt up/down, pan left/right, whip pan, crash zoom, rack focus, locked-off tripod, FPV move.
- Composition: centered hero frame, rule-of-thirds profile, foreground occlusion, silhouette against backlight, leading lines, negative space for later overlay, shallow depth of field, deep focus.
- Lens/texture: anamorphic flare, 35mm film grain, macro lens, wide-angle spatial distortion, telephoto compression, camcorder texture.

## Weak to Strong

Weak:

```text
A woman walks in a city at night, cinematic, dramatic lighting.
```

Strong:

```text
{{asset::lina}} walks alone through a narrow rain-soaked alley, red coat darkened by water, breath visible in the cold air. At first she slows beside a humming vending machine, then turns as a distant train rumbles overhead; the camera tracks beside her at shoulder height and racks focus from neon reflections in the puddles to her anxious face. Flickering magenta and cyan signs light the wet brick walls; avoid smiling, extra people, unreadable text, and identity drift.
```

## Quality Checks

Before submitting a video prompt, confirm:

- The prompt directs a scene over time, not a still image.
- Story-heavy wording has been translated into cast/blocking, visible actions, dialogue, lighting, camera, and audio layers.
- The subject identity and selected MovScript refs are explicit when continuity matters.
- The action has a beginning, middle, and end if duration or complexity calls for it.
- Camera and lighting are concrete enough to influence output.
- Negative constraints are relevant and not a generic junk drawer.
- Provider-only syntax has not leaked into MovScript content-unit prompts.
- Required upstream refs have selected/adopted candidates. If candidates exist but are unselected, guide the user to adopt/select one first. Continue only when the user explicitly asks for an unstable draft.
