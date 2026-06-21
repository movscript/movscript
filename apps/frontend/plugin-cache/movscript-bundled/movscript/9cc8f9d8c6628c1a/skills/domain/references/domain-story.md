# Domain Story

MovScript is a film-production language, not a one-shot prompt system.

The shared story is:

```text
request
-> production granularity decision
-> focused scene_moment or shot
-> optional consistency evidence
-> content unit production task
-> candidates / selection
-> interpreter review and stale checks
```

MovScript planning should first ask what is being made: a single output, a shot, a scene moment, several scene moments, a segment, or a production. Most video work should then center on either a `scene_moment` or a `shot`.

Settings, assets, keyframes, storyboards, expression units, and audio cues are evidence or scaffolding for that center. Add them when they protect consistency, reuse, or generation quality; skip them when the user wants a quick low-stakes draft.

When a reusable concrete production entity, such as a character, prop, place, instrument, costume, or voice identity, will appear across generation tasks, or when the user is dissatisfied with its appearance or sound, stabilize it through `setting` / `setting_state` / `asset` and an adopted/selected `asset_ref` content unit before downstream keyframe, storyboard, audio, or video work. Do not use `setting` for abstract style/rules/mood; use project standards or production/expression fields. When composition or camera intent is important but underspecified, stabilize storyboard panels/images before keyframes and video.

## Structure Before Content Units

Everything except `content_unit` is production structure or a prerequisite for generation:

- `production`, `segment`, `scene_moment`, and `shot` describe story rhythm, dramatic moments, and camera units.
- `expression_unit` and `audio_cue` describe narrative expression and sound continuity inside a scene moment.
- `setting`, `setting_state`, and `asset` describe concrete reusable production entities, their state namespaces, and state-owned resource slots.
- `storyboard` and `keyframe` describe shot-owned visual organization and visual anchors.

Do not design every segment, scene moment, shot, storyboard, keyframe, expression unit, audio cue, and asset at once by default. Choose the smallest useful prerequisite structure for the user's current goal, then deepen it through review and generation work.

## Content Units

`content_unit` is a top-level production task. It references upstream production structure with refs and turns that context into a generated or uploaded output workflow.

The current tracked specialized types are:

- `asset_ref`: image output for reusable asset reference candidates.
- `keyframe_ref`: image output for shot/keyframe visual anchor candidates.
- `storyboard_ref`: image output for storyboard panel/image candidates.
- `production_ref`: video output for a complete production.
- `segment_ref`: video output for a segment-level assembly.
- `scence_moment_ref`: video output for directly generating one complete scene moment.
- `scene_moment_ref`: video output for directly generating one complete scene moment.
- `expression_unit_ref`: output kind depends on the material role.
- `shot_ref`: video output for directly generating one camera unit.

Unknown content unit types may be valid generic slots, but they are not fully tracked by interpreter dependency, hash, stale-selection, or regeneration artifacts.

## Selection Gate

Generated, uploaded, or imported outputs first become `candidate` records. A candidate becomes stable state only after `selection`.

If a downstream content unit needs an upstream content unit output, and the upstream content unit has no selected candidate/resource, stop before downstream generation. Ask the user to select, confirm, or explicitly accept an unstable draft path.

## Interpreter

The interpreter explains source state; it does not decide creative work for the user.

It answers:

- whether source files are valid,
- what changed semantically,
- whether a change affects only the edited entity or downstream references,
- whether a selection is stale,
- which content units need review.

`affected` means a decision is needed. It does not mean automatic regeneration.
