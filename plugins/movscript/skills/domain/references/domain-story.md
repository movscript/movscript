# Domain Story

MovScript is a film-production language, not a one-shot prompt system.

The shared story is:

```text
film/source structure
-> reusable continuity facts
-> shot visual/audio anchors
-> content unit production tasks
-> candidates / selection
-> interpreter review and stale checks
```

## Structure Before Content Units

Everything except `content_unit` is production structure or a prerequisite for generation:

- `production`, `segment`, `scene_moment`, and `shot` describe story rhythm, dramatic moments, and camera units.
- `expression_unit` and `audio_cue` describe narrative expression and sound continuity inside a scene moment.
- `setting`, `setting_state`, and `asset` describe reusable facts, states, and resource slots.
- `storyboard` and `keyframe` describe shot-owned visual organization and visual anchors.

Do not design every segment, scene moment, shot, storyboard, keyframe, expression unit, audio cue, and asset at once by default. Choose the smallest useful prerequisite structure for the user's current goal, then deepen it through review and generation work.

## Content Units

`content_unit` is a top-level production task. It references upstream production structure with refs and turns that context into a generated or uploaded output workflow.

The current tracked specialized types are:

- `asset_ref`: image output for reusable asset reference candidates.
- `keyframe_ref`: image output for shot/keyframe visual anchor candidates.
- `storyboard_ref`: video output for storyboard or shot video candidates.
- `scence_moment_ref`: video output for directly generating one complete scene moment.

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
