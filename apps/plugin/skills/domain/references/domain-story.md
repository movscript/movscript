# Domain Story

MovScript is a film-production language, not a one-shot prompt system.

The shared story is:

```text
request
-> output/scope granularity decision
-> focused story beat or concrete material: shot video/image, dialogue voice, narration voice, subtitle, sound, music, ambience, 分镜图, or 关键帧
-> optional continuity reference: character, place, prop, costume, voice, style, or selected upstream material
-> internal output task and saved prompt
-> generated/imported options and user choice
-> interpreter review and stale checks
```

MovScript planning should first ask what is being made in user language: one simple video, one shot, a short story beat, several story beats, a dialogue/narration/subtitle/sound/music material, a 分镜图, a 关键帧, a reusable character/place/prop/costume/voice reference, or a larger piece that needs editing assembly. Internally, most short video work centers on a `scene_moment`; shot-like visual intent lives under that scene moment as an `expression_unit` with `modality=visual` and `role=shot`.

Settings, assets, 关键帧, 分镜图, visual/audio/text materials, and audio cues are evidence or scaffolding for that center. Add them when they protect consistency, reuse, or generation quality; skip them when the user wants a quick low-stakes draft.

When a reusable concrete production entity, such as a character/person, prop, place, scene space, set, instrument, costume, or voice identity, will appear across generation tasks, or when the user is dissatisfied with its appearance or sound, stabilize it through `setting` / `setting_state` / `asset` and an adopted/selected `asset_ref` content unit before downstream 关键帧, 分镜图, audio, or video work. Do not use `setting` for abstract style/rules/mood; use project standards or production/expression fields. When composition or camera intent is important but underspecified, stabilize 分镜图 before 关键帧 and video.

Chinese "场景" is overloaded. If it means a reusable place, environment, room, stage, or set, map it to `setting`; if it means the short dramatic/action event that happens there, map that beat to `scene_moment`.

## Structure Before Content Units

Everything except `content_unit` is production structure or a prerequisite for generation:

- Timeline namespace nodes organize story rhythm, order, and user vocabulary. Current source and MCP compatibility tools may write them as `production` / `segment`, but treat those as namespace projections.
- `scene_moment` describes the smallest stable dramatic moment that can become production work.
- `expression_unit` and `audio_cue` describe narrative expression and sound continuity inside a scene moment.
- `setting`, `setting_state`, and `asset` describe concrete reusable production entities, including characters, props, places/scene spaces/sets, costumes, instruments, voice identities, their state namespaces, and state-owned resource slots.
- `storyboard` and `keyframe` describe visual organization and visual anchors, usually for a visual expression unit or the scene moment itself.

Do not design every namespace node, scene moment, shot, storyboard, keyframe, expression unit, audio cue, and asset at once by default. Choose the smallest useful prerequisite structure for the user's current goal, then deepen it through review and generation work.

## Content Units

`content_unit` is a top-level production task. It references upstream production structure with refs and turns that context into a generated or uploaded output workflow.

The current tracked specialized types are:

- `asset_ref`: image output for reusable asset reference candidates.
- `keyframe_ref`: image output for shot/keyframe visual anchor candidates.
- `storyboard_ref`: image output for storyboard panel/image candidates.
- `audio_cue_ref`: audio output for sound effect, music, ambience, dialogue cue, or foley candidates.
- Legacy namespace-scope video output records may exist in old projects. Recognize them as historical data, but do not create them for new work.
- `scence_moment_ref`: video output for directly generating one complete scene moment.
- `scene_moment_ref`: video output for directly generating one complete scene moment.
- `expression_unit_ref`: output kind depends on the material role.

Unknown content unit types may be valid generic slots, but they are not fully tracked by interpreter dependency, hash, stale-selection, or regeneration artifacts.

Do not add user namespace-specific content unit types such as `episode_ref` or `beat_ref`. Namespace nodes organize story structure; production editing workspaces own namespace-scope playback and finishing.

Legacy source may still contain `shot` or `shot_ref` records. Do not create them for new plans; represent camera-unit work as shot/visual-material output tasks (`expression_unit_ref` content units targeting visual expression units).

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
- which internal output tasks need review.

`affected` means a decision is needed. It does not mean automatic regeneration.
