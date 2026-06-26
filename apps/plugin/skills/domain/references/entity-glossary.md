# Entity Glossary

Use this file as a translation layer from production language to MovScript source names. Think and respond in business terms first; use current MovScript entity names only in tool calls, source files, and compact technical diagnostics. Chinese and product words are aliases, not separate source entities.

| Product term | Entity |
| --- | --- |
| project | `project` |
| project standards | `project_standards` |
| script | `script` |
| script version | `script_version` |
| script block | `script_block` |
| setting / concrete production entity | `setting` |
| setting state / entity state namespace | `setting_state` |
| asset slot / state asset description | `asset` |
| production / episode / film unit | `production` |
| segment / rhythm section | `segment` |
| scene beat / plot beat / 情节 | `scene_moment` |
| visual shot material / camera expression | `expression_unit` with `modality=visual`, `role=shot` |
| dialogue/action/caption/narration unit | `expression_unit` with `modality=verbal` or `modality=text` |
| music/sfx/ambience/dialogue/foley cue | `expression_unit` with `modality=audio` |
| legacy shot / camera unit | `shot` |
| legacy music/sfx/ambience/dialogue/foley cue | `audio_cue` |
| key visual anchor | `keyframe` |
| storyboard / shot board / panels | `storyboard` |
| output task / production task / thing to generate or import | `content_unit` |
| generated/uploaded/imported option / candidate result | `candidate` |
| adopted/chosen/confirmed result | `selection` |

## Ownership

- `setting -> setting_state -> asset`
- `script -> script_version -> script_block`
- `production -> segment -> scene_moment`
- `scene_moment -> expression_unit`
- legacy visual anchors: `scene_moment -> shot -> keyframe / storyboard`
- legacy audio anchors: `scene_moment -> audio_cue`
- `content_unit` is top-level and references upstream entities with flat refs.

## Meaning

- `scene_moment` is the scene beat users usually mean when asking for a short unit of story or video output.
- `expression_unit` is a scene-beat-owned material intent, such as visual action, dialogue, narration, subtitle text, music, ambience, sfx, or voice. Use orthogonal `modality` and `role` fields instead of making separate core entities for every medium.
- `shot` is a legacy/specialized visual anchor. In the final model, shot-like intent is `expression_unit(modality=visual, role=shot)`.
- `storyboard` and `keyframe` are optional visual evidence for visual expression material.
- `audio_cue` is a legacy/specialized sound anchor. In the final model, sound intent is `expression_unit(modality=audio, role=sfx/music/ambience/dialogue/foley)`.
- `setting` is a concrete film/music production entity to make or reuse, such as a character, prop, place, instrument, costume, or voice identity. It is not an abstract style/rule/mood/genre bucket.
- `setting_state` is a namespace under one setting for a named condition/version of the same entity.
- `asset` is a reusable resource slot under a setting state, not a generated result. It describes one state asset, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. Image assets should prefer plain white or very clean backgrounds.
- `content_unit` is not a production hierarchy node. It is an output task that creates generated/imported options and later chosen results.
