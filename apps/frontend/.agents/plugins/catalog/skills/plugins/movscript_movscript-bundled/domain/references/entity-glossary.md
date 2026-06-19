# Entity Glossary

Use current MovScript entity names in tool calls and source files. Chinese and product words are aliases only.

| Product term | Entity |
| --- | --- |
| project | `project` |
| project standards | `project_standards` |
| script | `script` |
| script version | `script_version` |
| script block | `script_block` |
| setting / reusable fact | `setting` |
| setting state / contextual state | `setting_state` |
| asset slot / reusable reference slot | `asset` |
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
| production task / output slot | `content_unit` |
| generated/uploaded/imported option | `candidate` |
| chosen/confirmed option | `selection` |

## Ownership

- `setting -> setting_state -> asset`
- `script -> script_version -> script_block`
- `production -> segment -> scene_moment`
- `scene_moment -> expression_unit`
- legacy visual anchors: `scene_moment -> shot -> keyframe / storyboard`
- legacy audio anchors: `scene_moment -> audio_cue`
- `content_unit` is top-level and references upstream entities with flat refs.

## Meaning

- `scene_moment` is the final expression aggregation unit and the preferred output unit.
- `expression_unit` is a scene-moment-owned multimodal material intent. Use orthogonal `modality` and `role` fields instead of making separate core entities for every medium.
- `shot` is a legacy/specialized visual anchor. In the final model, shot-like intent is `expression_unit(modality=visual, role=shot)`.
- `storyboard` and `keyframe` are optional visual evidence for visual expression material.
- `audio_cue` is a legacy/specialized sound anchor. In the final model, sound intent is `expression_unit(modality=audio, role=sfx/music/ambience/dialogue/foley)`.
- `asset` is a reusable resource slot under a setting state, not a generated result.
- `content_unit` is not a production hierarchy node. It is a production task that creates candidates and selections.
