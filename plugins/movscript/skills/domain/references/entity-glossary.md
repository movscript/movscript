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
| shot / camera unit | `shot` |
| dialogue/action/caption/narration unit | `expression_unit` |
| music/sfx/ambience/dialogue/foley cue | `audio_cue` |
| key visual anchor | `keyframe` |
| storyboard / shot board / panels | `storyboard` |
| production task / output slot | `content_unit` |
| generated/uploaded/imported option | `candidate` |
| chosen/confirmed option | `selection` |

## Ownership

- `setting -> setting_state -> asset`
- `script -> script_version -> script_block`
- `production -> segment -> scene_moment`
- `scene_moment -> shot -> keyframe / storyboard`
- `scene_moment -> expression_unit / audio_cue`
- `content_unit` is top-level and references upstream entities with flat refs.

## Meaning

- `scene_moment` is narrative context, not a camera unit.
- `shot` is the camera unit.
- `storyboard` is shot-owned visual organization.
- `keyframe` is a shot-owned visual anchor.
- `expression_unit` and `audio_cue` are scene-moment-owned expression and sound objects.
- `asset` is a reusable resource slot under a setting state, not a generated result.
- `content_unit` is not a production hierarchy node. It is a production task that creates candidates and selections.
