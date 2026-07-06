# Content-Production Task Recipes

`content_unit` records are internal top-level 内容制作任务. Explain them to users as the concrete thing being prepared or generated, such as a character reference image, shot video, dialogue voice, narration voice, subtitle, sound effect, music cue, 分镜图, or 关键帧. Say 内容制作任务/制作项 only when a generic bucket is unavoidable. They are not generated resources, candidates, selections, or production hierarchy nodes.

Final-shape production centers on short story beats:

- `scene_moment` is the internal record for a short story beat and can be generated directly.
- `expression_unit` is the internal record for one concrete material inside a story beat: visual shot material, dialogue voice, narration voice, subtitle, sfx, music, ambience, interaction, or metadata.
- `content_unit` is the internal output task that produces generated/imported options for either a complete story beat or one concrete material.
- `edit_plan` composes selected output-task options back into the story-beat output.

Create the necessary upstream structure first, then create the internal output task. Do not invent all shots, 分镜图, 关键帧, assets, material records, or audio cues just to fill an output task. Use the smallest structure that supports the user's current goal.

## Specialized Types

- `asset_ref`: image output, requires `asset_ref`. Use to stabilize a reusable concrete production entity or state asset, such as a character/person, prop, place, scene space, set, instrument, costume, voice identity, front view, side view, layout view, material reference, or tone reference.
- `keyframe_ref`: image output, uses `scene_moment_ref`, `expression_unit_ref`, `storyboard_ref`, and `keyframe_ref` or `keyframe_refs`. Use to stabilize 关键帧 for a visual shot material or 分镜图.
- `storyboard_ref`: image output, requires `storyboard_ref`. Use to stabilize 分镜图 for composition, blocking, timing, and shot rhythm before 关键帧 or final video.
- `scene_moment_ref` / legacy `scence_moment_ref`: video output, targets one complete short story beat. Prefer `target_kind: scene_moment` and `target_ref` for new records. Use when directly generating one complete story-beat video without material breakdown first.
- `expression_unit_ref`: output kind may be video, audio, text, image, or metadata. Prefer `target_kind: expression_unit` and `target_ref` for new records. Use for visual shot material, dialogue/narration voice material, subtitle text, sfx/music/ambience, or interaction metadata that will later be composed by an edit plan.
Unknown `content_unit_type` values are valid generic slots, but interpreter adapters do not collect upstream dependencies, hash source refs, mark selections stale, or include them in regeneration planning.

Do not create namespace-scope `content_unit_type` values for new work, including project-specific refs such as `episode_ref`, `act_ref`, `beat_ref`, or `timeline_namespace_ref`. Namespace nodes organize story structure; when a namespace scope needs playable assembly or finishing, create/open a production editing workspace.

Legacy source may still contain `shot_ref` `content_unit` records. Do not create them for new plans; use `expression_unit_ref` for camera-unit visual material.

For storyboard-panel upload after reference-shot imitation, use a clearly named generic type such as `storyboard_panel_ref` or `storyboard_upload_ref` until a specialized adapter exists. State that it is for storyboard-panel upload/candidate/selection, not final video generation.

## Prompt Backup Requirement

Every project-scoped generation task needs an internal output task and saved `edit_prompt` before any executor runs, whether the executor is MovScript, LibTV, or another external tool. This saved prompt should be the source used to build provider prompts, canvas node prompts, and low-level generation payloads. Do not leave the only prompt in chat, a provider form, or an external node.

For project-level style, first decide whether the style is simple/unambiguous or special/ambiguous. If it is simple and unambiguous, use a reusable text style prompt. Ask the user to confirm the prompt, then save it in `project_standards.json` through `domain_upsert_project_standards` under `visual_style` or `project_style.custom_rules[key=style_prompt]` with prompt_role `style`, enabled true. Every downstream saved prompt should cite this confirmed style prompt.

For project-level style reference batches, use them when the style is special, composite, uncommon, subjective, or ambiguous and needs visual stabilization. Generate the batch from a style prompt, using a clearly named generic internal output task such as `style_reference_batch_ref` or `project_style_reference_batch_ref`. Its `edit_prompt` should describe the project-wide visual style, script/project context, candidate count, aspect ratio, desired variation across the batch, and negatives. Generated/imported batch images are candidates until the user chooses which style reference images become project standards. Every downstream visual saved prompt should cite the selected style reference images, and generation should pass them as global references when the model supports it.

After the user chooses style reference image(s), save their RawResource IDs in `project_standards.json` with `domain_upsert_project_standards` under `project_style.custom_rules[key=style_reference_images]`. Include parseable IDs such as `reference_resource_ids: [123,456]` or `resource#123` so `domain_read_project_context_snapshot` can expose `style_reference_resource_ids`.

## Asset References

`asset_ref` output should usually be reusable and weakly tied to plot:

- prefer plain white or very clean background images,
- prefer multi-view or reference-sheet style when useful,
- show identity, state, costume, makeup, prop shape, place/set layout, material, voice/tone identity, or instrument character,
- avoid complex scene lighting, one-off action, specific plot blocking, or final-shot composition.

Put story lighting, camera composition, action, and scene-specific mood in 关键帧 or 分镜图, not in `asset`.

If the user says "场景" and means a reusable location, environment, room, stage, or set, stabilize it through `setting` / `setting_state` / `asset`. Use `scene_moment` only for the dramatic/action beat that happens in that place.

When a reusable visual entity appears in multiple generation tasks, or when the user is dissatisfied with its appearance, treat asset stabilization as a gate:

```text
setting / setting_state / asset
-> asset_ref 内容制作任务
-> generated/imported asset candidates
-> user/workflow adopts or selects a stable candidate
-> downstream keyframe/storyboard/video references
```

Build asset candidates from simple to complex. Start with base identity, neutral shape, material, tone, or layout; then use the selected base asset to generate white-background/clean-background multi-view/reference-sheet versions and state variants such as costume, makeup, weather, damage, wet hair, prop wear, or voice mood. Do not use unselected asset candidates as stable downstream references.

### Setting Reference Sets

When the user asks for a group, batch, set, or all reference images for one `setting`, treat it as a source-of-truth reference set, not a batch of independent prompt-only generations.

```text
setting
-> base setting_state
-> base asset
-> base asset_ref 内容制作任务
-> user/workflow adopts or selects the base candidate
-> derivative asset_ref 内容制作任务 with {{asset::base_*}} refs
-> user/workflow adopts useful derivatives
-> downstream storyboard/keyframe/video refs
```

Base choices:

- Character/person: base identity or neutral full-body reference.
- Place, scene space, room, set, or environment: base layout or clean wide view.
- Prop, product, vehicle, instrument, or material: base shape/material reference.
- Costume/makeup tied to a person: selected character base identity, then costume/makeup state variant.

Derivative assets include multi-view sheets, expression rows, side/back views, key angles, day/night/weather states, detail callouts, damage/wear variants, costume variants, and other references that need to remain consistent. Every derivative `asset_ref.edit_prompt` must cite the adopted base asset with a semantic ref such as `{{asset::base_character}}`, `{{asset::base_room_layout}}`, or `{{asset::base_prop_shape}}`. If the base is not adopted/selected, classify the derivative work as `缺选择` or `可补图` and stop before generation.

### Scene Reference Packs

When the setting is a place, scene space, room, set, exterior location, stage, or environment, plan a scene reference pack instead of a flat reference batch. Keep it inside the existing setting/state/asset/内容制作任务 model; do not invent floor-plan or control-map entity types.

Recommended asset slots under the same setting state:

```text
base_scene_view asset_ref
-> user/workflow adopts or selects base_scene_view
-> topdown_layout_ref asset_ref
-> optional clean_plate_ref / corner_view_ref / cardinal_view_ref
-> optional depth_line_layout_ref / material_detail_ref / state_ref
-> downstream storyboard_ref / keyframe_ref / scene_moment_ref / expression_unit_ref
```

Rules:

- `base_scene_view` is the visual mother reference. It should be a clean wide or three-quarter view showing the whole reusable space: entrances, windows, fixed furniture/landmarks, materials, scale, and lighting.
- `topdown_layout_ref` is the structural mother reference. Generate it only after `base_scene_view` is adopted/selected, and derive it from `{{asset::base_scene_view}}`. It should be an abstract floor plan, zone map, or object-placement map, not a redesigned illustration.
- `clean_plate_ref`, `corner_view_ref`, and `cardinal_view_ref` are optional derivatives. They must cite `{{asset::base_scene_view}}`; if `topdown_layout_ref` exists, cite it too.
- `depth_line_layout_ref` covers depth, lineart, canny-like, sketch, mask, or annotated control images when the selected model/tool can use structural conditioning. Store the control image as a normal RawResource/candidate if it will be reused.
- `material_detail_ref` and `state_ref` come after the base and layout are stable. They preserve the same geometry unless the state explicitly changes dressing, damage, weather, or time of day.
- Scene-specific shot/storyboard/keyframe prompts come last and reference the selected scene pack assets. Do not use them to redesign the reusable location.

Before marking a scene pack derivative as stable, check door/window count, major object placement, orientation, scale, material palette, and light-source logic against the adopted `base_scene_view` and selected `topdown_layout_ref`. If they conflict, classify as `可补图` or `缺选择` and stop before downstream video generation.

## Scene Moments and Expression Units

Fast direct scene generation:

```text
scene_moment
-> scene_moment_ref 内容制作任务 with target_kind=scene_moment
-> saved edit_prompt prompt backup
-> prompt compile / readiness report
-> full-context user confirmation for generation
-> generated/imported video candidates
-> user/workflow selects final scene-moment video candidate
```

Composed scene generation:

```text
scene_moment
-> expression_unit(modality=visual, role=shot)
-> expression_unit(modality=verbal, role=dialogue/narration)
-> expression_unit(modality=audio, role=sfx/music/ambience)
-> expression_unit_ref 内容制作任务 for each needed material
-> generated/imported material candidates
-> user/workflow selects material candidates
-> interpreted edit_plan groups selected resources into tracks
-> production_editing_workspace_create/open creates the concrete production editing workspace
-> opened workspace hands off to system_edit or remotion by workspace kind
-> editing_timeline_* adjusts direct system editing projects when needed
-> editing_task_render_create renders direct system editing projects through Media Pipeline when render capability is available
-> editing_export_import_resource uploads the finished local export
-> editing_export_create_candidate explicitly writes the RawResource-backed scene-moment video candidate
-> editing_export_create_candidate can explicitly write HLS MediaStreamArtifact outputs as hls_stream candidates with streamId
```

Use the editing path when cross-shot voice, subtitles, sound design, visual consistency, or local regeneration matters. `domain_compose_scene_moment_from_edit_plan` is not an available product editing path.

## Storyboards and Keyframes

Use 分镜图 before 关键帧 when the user has composition, blocking, camera, placement, or rhythm expectations but has not specified enough detail.

分镜图 and 关键帧 saved prompts should be image prompts, not pasted script text and not video prompts. Analyze the source scene first, then specify image purpose, subject, single-frame action state, composition, camera angle, setting, lighting, style, continuity refs, and restrictions. For 分镜图, prefer schematic or stylized visual-planning images; avoid photoreal real-person likenesses unless the user explicitly needs a final character image.

```text
shot intent
-> storyboard_ref internal output task for 分镜图
-> user/workflow adopts or selects storyboard candidate
-> keyframe_ref internal output tasks for start/end or other required 关键帧
-> user/workflow adopts or selects required keyframe candidates
-> expression_unit_ref visual-material 内容制作任务, or direct scene_moment_ref 内容制作任务
```

`storyboard_ref` is for 分镜图, not the final video output. Final video should normally be a story-beat video output task or a shot/visual-material output task that references selected 分镜图/关键帧/asset outputs when those are required for stable continuity.

## Flat Refs

Current source supports these flat refs on `content_unit` records:

- `scene_moment_ref`
- `expression_unit_ref`
- `storyboard_ref`
- `keyframe_ref`
- `keyframe_refs`
- `audio_cue_ref`
- `audio_cue_refs`
- `expression_unit_refs`
- `asset_ref`

For generic untracked 内容制作任务, these refs are source context only. They do not imply the interpreter will collect dependencies, update input hashes, mark selections stale, or include the slot in regeneration planning.

## Strong Consistency Path

```text
asset_ref 内容制作任务
-> generated/imported asset candidates
-> user/workflow selects stable asset candidate
-> storyboard_ref 内容制作任务 when composition or rhythm must be confirmed
-> generated/imported storyboard panel candidates
-> user/workflow selects stable storyboard candidate
-> keyframe_ref 内容制作任务
-> generated/imported keyframe candidates
-> user/workflow selects stable keyframe candidate
-> expression_unit_ref visual-material 内容制作任务 or scene_moment_ref 内容制作任务
-> prompt compile / readiness report
-> full-context user confirmation for generation
-> generated/imported video candidates
-> user/workflow selects final video candidate
```

Use this path when cross-shot or cross-scene continuity matters.

Do not start a downstream stage until the required upstream candidate has been selected. A generated candidate is not a stable dependency until it has a selection. If usable asset, 分镜图, 关键帧, or audio cue candidates already exist but none is selected, stop and ask the user to adopt/select one before planning or generating downstream content.

For script-related image/video work, do not start 分镜图, 关键帧, asset-image, story-beat video, or shot-visual generation until a confirmed style baseline is saved in project standards. A style prompt is enough for simple/unambiguous styles. Confirmed style reference images visible as `style_reference_resource_ids` are required for special/ambiguous styles, and should be used globally for every supported downstream visual generation. A fast exploration path may skip optional 分镜图/关键帧/assets, but not this project style gate.

## Fast Exploration Path

For rapid exploration, create only the needed generic or specialized 内容制作任务 and generate candidates quickly. A direct `scene_moment_ref` 内容制作任务 is appropriate when the user wants a draft, a low-stakes one-off output, or a simple generation without reusable continuity.

Do not create setting, asset, keyframe, or storyboard prerequisites just to satisfy a formal chain. Add them only when they protect identity, style, scene continuity, camera intent, or downstream reuse.

Tell the user that generic slots and skipped asset/keyframe/storyboard stages trade consistency, reusable references, and stale tracking for speed.

If the user explicitly asks for an unstable draft path with missing upstream selection, state that the result is not a stable continuity dependency. Do not infer this exception from urgency or silence; recommend adoption/selection first.

## Checkpoint

After writing 内容制作任务:

1. Run `domain_inspect` or `domain_review`.
2. Fix blocking issues.
3. Run `domain_interpret`.
4. Read dependency report, input version, selection validity, and runtime panel before generation.
