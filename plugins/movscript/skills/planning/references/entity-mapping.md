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
| setting / concrete production entity / character / prop / place / scene space / set / 人物/场景空间/道具 | `setting` |
| setting state / entity state namespace | `setting_state` |
| asset slot / state asset description | `asset` |
| timeline namespace node / episode / act / sequence / beat | current source uses legacy `production` / `segment` records projected as `timeline_namespace` |
| legacy production source record | `production` |
| legacy segment source record | `segment` |
| scene beat / plot beat / 情节 / action moment / one short makeable scene | `scene_moment` |
| shot / camera unit / visual material | `expression_unit` with `modality=visual`, `role=shot` |
| key visual anchor | `keyframe` |
| storyboard / shot board / panels | `storyboard` |
| dialogue/action/caption/narration unit | `expression_unit` |
| music/sfx/ambience/dialogue/foley cue | `expression_unit` with `modality=audio` |
| legacy shot / camera unit | `shot` |
| legacy music/sfx/ambience/dialogue/foley cue | `audio_cue` |
| content-production task / output slot / 内容制作任务 | `content_unit` |
| namespace-scope assembly/playback | `ProductionEditingWorkspace` (`system_editing` or `remotion`) |
| generated/uploaded/imported option | `candidate` |
| chosen/confirmed option | `selection` |
| automatic edit / composition plan | interpreted `edit_plan` |

Canonical ownership:

- `setting -> setting_state -> asset`
- `script -> script_version -> script_block`
- timeline namespace tree -> `scene_moment` (current legacy source path often uses `production -> segment -> scene_moment`)
- `scene_moment -> expression_unit`
- optional legacy visual anchors: `scene_moment -> shot -> keyframe / storyboard`
- optional legacy audio anchors: `scene_moment -> audio_cue`
- `content_unit` is top-level and references upstream entities with flat refs.

Except for `content_unit`, these entities are production structure or generation prerequisites. Create only the parts needed for the user's current goal. For new designs, prefer user/project vocabulary for timeline planning, short story beats plus concrete shot/voice/subtitle/sound/music material records for production work, then generate materials through `expression_unit_ref` or `scene_moment_ref` internal output tasks. When a namespace scope itself needs playable assembly or finishing, hand off to a production editing workspace; do not invent `episode_ref`, `beat_ref`, or other namespace-specific `content_unit_type` values.

Chinese "场景" is overloaded. If it means a reusable location, environment, set, room, stage, or scene space, map it to `setting`; if it means what happens in a short dramatic/action beat, map that beat to `scene_moment`.

`setting` is only for concrete screenplay/production entities to make or reuse, such as a character/person, prop, place, scene space, set, instrument, costume, or voice identity. `setting_state` is a namespace under one setting for a named condition/version. `asset` belongs under a setting state and describes one asset slot for that state, such as front view, side view, layout view, turnaround sheet, material reference, voice timbre, or instrument tone. For image assets, prefer plain white or very clean backgrounds unless scene context is explicitly required.
