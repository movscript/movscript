# Entity Mapping

For fuller definitions, open `../../domain/references/entity-glossary.md`.

Use current `movscript-lang` entity names in tool calls and source files.

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
| shot / camera unit / visual material | `expression_unit` with `modality=visual`, `role=shot` |
| key visual anchor | `keyframe` |
| storyboard / shot board / panels | `storyboard` |
| dialogue/action/caption/narration unit | `expression_unit` |
| music/sfx/ambience/dialogue/foley cue | `expression_unit` with `modality=audio` |
| legacy shot / camera unit | `shot` |
| legacy music/sfx/ambience/dialogue/foley cue | `audio_cue` |
| production task / output slot | `content_unit` |
| generated/uploaded/imported option | `candidate` |
| chosen/confirmed option | `selection` |
| automatic edit / composition plan | interpreted `edit_plan` |

Canonical ownership:

- `setting -> setting_state -> asset`
- `script -> script_version -> script_block`
- `production -> segment -> scene_moment`
- `scene_moment -> expression_unit`
- optional legacy visual anchors: `scene_moment -> shot -> keyframe / storyboard`
- optional legacy audio anchors: `scene_moment -> audio_cue`
- `content_unit` is top-level and references upstream entities with flat refs.

Except for `content_unit`, these entities are production structure or generation prerequisites. Create only the parts needed for the user's current goal. For new designs, prefer `scene_moment` plus multimodal `expression_unit` records, then generate materials through `expression_unit_ref` content units and compose them through the interpreted edit plan.

`setting` is only for concrete film/music entities to make or reuse, such as a character, prop, place, instrument, costume, or voice identity. `setting_state` is a namespace under one setting for a named condition/version. `asset` belongs under a setting state and describes one asset slot for that state, such as front view, side view, turnaround sheet, material reference, voice timbre, or instrument tone. For image assets, prefer plain white or very clean backgrounds unless scene context is explicitly required.
