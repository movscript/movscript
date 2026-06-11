# Entity Mapping

Use current `movscript-lang` entity names in tool calls and source files.

| Product term | Entity |
| --- | --- |
| project | `project` |
| project standards | `project_standards` |
| script | `script` |
| script version | `script_version` |
| script block | `script_block` |
| setting | `setting` |
| setting state | `setting_state` |
| asset slot | `asset` |
| production / episode / film unit | `production` |
| segment / rhythm section | `segment` |
| scene beat / plot beat / 情节 | `scene_moment` |
| shot / camera unit | `shot` |
| key visual anchor | `keyframe` |
| storyboard / shot board / panels | `storyboard` |
| dialogue/action/caption/narration unit | `expression_unit` |
| music/sfx/ambience/dialogue/foley cue | `audio_cue` |
| production task / output slot | `content_unit` |
| generated/uploaded/imported option | `candidate` |
| chosen/confirmed option | `selection` |

Canonical ownership:

- `setting -> setting_state -> asset`
- `script -> script_version -> script_block`
- `production -> segment -> scene_moment`
- `scene_moment -> shot -> keyframe / storyboard`
- `scene_moment -> expression_unit / audio_cue`
- `content_unit` is top-level and references upstream entities with flat refs.
