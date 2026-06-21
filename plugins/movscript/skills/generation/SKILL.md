---
name: generation
description: Generate MovScript AI source resources and candidates from content units, including image, video, voiceover, music, sound effects, and subtitles; enforce upstream selection gates, inspect reference-shot imitation via frames, and interpret candidate writes.
toolGrants:
  - mcp__movscript__system_model_list
  - mcp__movscript__system_generate_content_unit_image
  - mcp__movscript__system_generate_content_unit_image_job_get
  - mcp__movscript__system_generate_image
  - mcp__movscript__system_generate_image_job_get
  - mcp__movscript__system_generate_image_job_get_batch
  - mcp__movscript__system_generate_content_unit_video
  - mcp__movscript__system_generate_content_unit_video_job_get
  - mcp__movscript__system_generate_video
  - mcp__movscript__system_generate_video_job_get
  - mcp__movscript__system_generate_video_job_get_batch
  - mcp__movscript__system_generate_voiceover
  - mcp__movscript__system_generate_music
  - mcp__movscript__system_generate_sfx
  - mcp__movscript__system_generate_subtitle
  - mcp__movscript__system_align_subtitle
  - mcp__movscript__system_translate_subtitle
  - mcp__movscript__generation_audio_job_get
  - mcp__movscript__generation_audio_job_get_batch
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_image_read
  - mcp__movscript__system_resource_image_transform_to_resource
  - mcp__movscript__system_resource_video_extract_frames
  - mcp__movscript__system_resource_video_probe
  - mcp__movscript__system_resource_video_extract_frame_to_resource
  - mcp__movscript__system_resource_video_extract_frames_to_resources
  - mcp__movscript__system_resource_video_trim_to_resource
  - mcp__movscript__system_resource_video_contact_sheet_to_resource
  - mcp__movscript__system_resource_video_extract_audio_to_resource
  - mcp__movscript__system_resource_image_annotate
  - mcp__movscript__system_resource_upload
  - mcp__movscript__system_shot_library_query
  - mcp__movscript__system_external_resource_source_list
  - mcp__movscript__system_external_resource_search
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_project_context_snapshot
  - mcp__movscript__domain_read_scene_moment_edit_plan
  - mcp__movscript__domain_derive_content_unit_artifact
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_generation_prompt
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_create_content_candidate_batch
  - mcp__movscript__domain_create_asset_slot_candidate
  - mcp__movscript__domain_create_keyframe_candidate
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate_batch
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Generation

Use this skill when a user asks the provider to generate or plan AI-created source resources through MovScript, including images, videos, voiceover, music, sound effects, and subtitles.

## Concepts

- Generation tools do not infer project from session, cwd, route, or focus. Pass the intended `projectId`/`project_id` for project-scoped generation.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Generation outputs are MovScript resources first. They become effective domain state only when written as backend candidates or selections.
- Voiceover, music, sound effects, subtitle transcription, subtitle alignment, and subtitle translation are generation jobs, but placing, trimming, mixing, burning-in, rendering, packaging, and exporting them are editing jobs.
- `input_resource_ids` and `reference_resource_ids` accept MovScript RawResource IDs, not MCP resource URIs, local paths, or external provider URLs.
- Resource/media transform tools are intentionally business-neutral. Use `*_to_resource` tools to create reusable RawResources for generation inputs, references, review artifacts, or later candidate writes; do not expect these tools to update content units, candidates, or selections by themselves.
- Resource/media transform uploads persist generic derivative metadata (`operation`, `input_resource_ids`, and params) on the created RawResource. Treat this as provenance, not domain acceptance.
- Video/audio editing, stitching, timeline render, HLS packaging, transcode, reframe, subtitle burn-in, audio mixdown, and export import are editing concerns. Use the `editing` skill and `editing_*` tools for product editing; generation tools only create or prepare source resources.
- Content unit prompts may carry project-wide style reference images from `project_standards.custom_rules[key=style_reference_images]`. Treat `style_reference_resource_ids` and `runtime_request.inputs[role=style_reference]` as house-style references for visual consistency; pass them as `reference_resource_ids` whenever the selected image/video model supports reference images.
- Before project-scoped generation, call `domain_read_project_context_snapshot`. Use its prompt preview, enabled rules, negative rules, aspect ratio, and `style_reference_resource_ids` as the project context harness for generation decisions.
- Do not change project standards during generation just because they are missing or weak. Only call standards write tools when the user explicitly asks to add, remove, or adjust project-wide rules.
- Content unit artifact bundles contain runtime panel, input version, dependency report, and selection validity. Derive or read these before changing generated content when they are relevant.
- For content-unit image/video generation, edit the content unit `edit_prompt` first, then use `system_generate_content_unit_image` or `system_generate_content_unit_video`. These tools compile the backend prompt, submit generation, and automatically create or refresh content candidates when the monitored job succeeds.
- `system_generate_image` and `system_generate_video` remain low-level prompt channels for free generation, debugging, or non-content-unit workflows. Do not use them as the primary path for content-unit outputs.
- Generated content-unit candidates and selections are backend decision metadata, not workspace source-file edits. Content-unit generation tools create candidates automatically on successful job polling; inspect/review and interpret after candidate writes when downstream artifact tools need refreshed decision context.
- `domain_create_content_candidate` is the preferred backend decision path for production outputs anchored to content units. Inline asset/keyframe candidates are compatibility paths for source-entity candidate workflows.
- Candidate decision is separate from candidate creation. Use `domain_decide_content_unit_candidate` when the workflow or UI records `adopt`, `reject`, or `defer`; `adopt` makes the candidate the stable selection, while `reject` and `defer` preserve the candidate without making it a dependency.
- For completed generated content-unit outputs, omit `status` when calling `domain_create_content_candidate` or `domain_create_content_candidate_batch`; the backend defaults it to `succeeded`. If you must pass `status`, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; never use `completed`, `ready`, `done`, `selected`, or `accepted`.
- Do not select a candidate just because generation succeeded. Select only when the user or an explicit workflow asks to use, confirm, choose, lock, or set the output.
- When generation is happening inside the AI conversation UI, make the newly written content-unit candidate available for the decision card by preserving `projectId`, `contentUnitId`, `candidateId`, and `resourceId` on the generated attachment/candidate metadata. The user-facing choices are `采纳`/`放弃`/`待定`, corresponding to `adopt`/`reject`/`defer`.
- Before generation, identify whether the output center is a direct `scene_moment` or an expression-unit material inside a `scene_moment`, then classify it as `缺规划`, `可补图`, `缺选择`, or `可生成`.
- If a concrete reusable film/music entity or state, such as a character, prop, place, instrument, costume, or voice identity, is involved in multiple generation tasks, or the user is dissatisfied with its look or sound, treat it as a continuity asset gate: generate/refine an `asset_ref` content unit first and wait for adoption/selection before downstream generation. Do not create settings for abstract styles/rules/moods.
- Asset generation should progress from simple to complex. Generate the base identity/shape/state first, then use the selected base candidate as a reference for white-background/clean-background multi-view sheets, state variants, and more specific assets.
- If composition, blocking, camera motion, subject placement, or rhythm matters but is underspecified, treat it as a visual anchor gate: generate storyboard panels/images first, wait for adoption/selection, then generate selected start/end or other keyframes before video.
- Generate only when the requested output's content unit artifacts and needed upstream visual/audio anchors are ready enough for the user's goal. For a low-consistency draft, a direct scene-moment content unit can be enough; for composed output, generate/select expression-unit material content units before editing.
- If a downstream content unit depends on an upstream content unit output, and the upstream output has no selection, stop before generation unless the user explicitly asks for an unstable draft path.
- If the user asks to mimic a specific shot or reference video, open `references/shot-imitation-workflow.md`; analyze extracted frames and create storyboard panels before downstream video generation.

## Workflow

1. Read workspace context first when the request references project entities, scenes, script passages, keyframes, asset slots, or house style.
2. Use `system_focus_get` for the selected project/production. Call `domain_read_project_context_snapshot`, then use `domain_overview`, `domain_query_production_context`, `domain_query_assets`, and content-unit artifact tools before reading many files.
3. Identify the output center: a direct `scene_moment`, an `expression_unit` material, or an upstream evidence item such as an asset, keyframe, or storyboard.
4. Decide whether the current goal needs strong consistency evidence or a fast draft path. Do not block a simple draft only because optional setting, asset, keyframe, or storyboard references are absent.
5. If continuity assets are required, generate or refine `asset_ref` candidates first. Use selected simpler asset resources as references for more complex asset variants, and stop before downstream generation until required asset candidates are adopted/selected.
6. If visual anchoring is required and composition is underspecified, generate storyboard panel/image candidates first and stop before keyframe or video generation until the storyboard candidate is adopted/selected.
7. Call `system_model_list` before generation unless the user or UI already provided a valid `model_id`.
8. Use `system_resource_library_query` when you need existing MovScript images/videos/text/audio. Only returned `RawResource.ID` values should be passed as `input_resource_ids` or `reference_resource_ids`.
9. When you need to visually inspect an existing image RawResource, call `system_resource_image_read` with its resource ID. When you need to inspect a video RawResource, call `system_resource_video_extract_frames`; use `mode`, `timestamps_sec`, `range`, or `burst` parameters for fine-grained frame selection, and do not request or read the original video blob for vision.
10. When a frame, crop, resized image, contact sheet, trimmed clip, or extracted audio must be reused by generation or written as a candidate, create a RawResource with a neutral transform tool: `system_resource_video_extract_frame_to_resource`, `system_resource_video_extract_frames_to_resources`, `system_resource_image_transform_to_resource`, `system_resource_video_contact_sheet_to_resource`, `system_resource_video_trim_to_resource`, or `system_resource_video_extract_audio_to_resource`.
11. When a generation needs a simple visual instruction layer, call `system_resource_image_annotate` with structured marks. The tool stores the annotated SVG at `artifact_path` and returns metadata only; call `system_resource_upload` with `artifact_path` so the guidance image becomes a RawResource.
12. When selected expression-unit materials must be stitched into a scene-moment or production video, switch to the `editing` skill. Create a `MediaEditingProject` with `editing_project_create_from_edit_plan`, render through `editing_task_render_create`, and only then explicitly import or write a candidate if the user/workflow asks for it.
13. Use `system_shot_library_query` for camera, composition, motion, narrative, emotion, and production-pattern references. Treat shot-library records as prompt guidance unless they also include a usable MovScript RawResource ID.
14. Use `system_external_resource_source_list` and `system_external_resource_search` only for external provider discovery. External results must be imported into MovScript before they can be used as generation resource IDs.
15. For content-unit image requests, prefer supplementing keyframes when the shot is clear but visual anchors are missing; use `system_generate_content_unit_image` after the content unit prompt and references are clear enough. Use `system_generate_image` only for free generation, debugging, or non-content-unit workflows.
16. For asset references, prefer plain white or very clean backgrounds, multi-view/reference-sheet views when useful, and weakly plot-bound images unless the user asks for scene-specific imagery. Use selected base assets as references for more specific asset states or variants.
17. For storyboard or shot-image requests, prefer supplementing storyboard graph/panels when the shot is clear but storyboard assets are missing.
18. For reference-shot imitation, extract frames across the full reference clip, materialize useful reference frames or contact sheets as RawResources when they will condition generation, analyze the shot, create/update shot/storyboard/keyframe structure, create a storyboard-panel or `storyboard_ref` content unit, and require selection before dependent video generation.
19. For content-unit video requests, use `system_generate_content_unit_video` after the focused scene-moment or visual-expression content unit is ready enough. Require selected upstream assets/keyframes/storyboards when continuity or visual anchoring gates were triggered; otherwise explain the risk and use the minimum viable references. Use `system_generate_video` only for free generation, debugging, or non-content-unit workflows.
20. For voiceover requests, use `system_generate_voiceover`. Pass script text in `prompt`, voice/language controls as explicit params, and selected reference audio only as MovScript `reference_resource_ids` when the model supports it.
21. For music and sound-effect requests, use `system_generate_music` or `system_generate_sfx`. Treat the result as source audio; do not place it on a timeline, mix it, or write it as final domain state until the user/workflow asks.
22. For subtitle requests, use `system_generate_subtitle` for audio/video transcription, `system_align_subtitle` for forced alignment, and `system_translate_subtitle` for translation. Pass source media or subtitle/script RawResource IDs as `input_resource_ids`; do not burn subtitles into video in generation.
23. Pass semantic upstream images/videos/audio/subtitles as `input_resource_ids` when they are conditioning or source inputs, and pass project style/reference resources from `domain_read_project_context_snapshot.style_reference_resource_ids` as `reference_resource_ids` when the selected model supports them. Include uploaded agent guidance images when useful.
24. Poll content-unit image/video jobs with `system_generate_content_unit_image_job_get` or `system_generate_content_unit_video_job_get` until `terminal` is true; successful terminal polls automatically create or refresh content candidates. Poll low-level image/video jobs with the matching `system_generate_*_job_get` tool and audio/subtitle jobs with `generation_audio_job_get`. When tracking multiple low-level jobs, use `system_generate_image_job_get_batch`, `system_generate_video_job_get_batch`, or `generation_audio_job_get_batch` instead of issuing one call per job.
25. Do not manually call `domain_create_content_candidate` after `system_generate_content_unit_image` or `system_generate_content_unit_video`; the content-unit generation monitor owns candidate creation. Use `domain_create_content_candidate` or batch only for transformed/imported/manual outputs or low-level generation jobs that intentionally bypassed the content-unit path.
26. If the user is choosing among generated candidates, use `domain_decide_content_unit_candidate` with `decision: "adopt" | "reject" | "defer"`. Treat `adopt` as selection, `reject` as discarded candidate, and `defer` as unresolved candidate.
27. Use `domain_select_content_unit_candidate` or its batch variant only for legacy/explicit workflows that confirm the candidate should become the chosen output/reference without the richer decision status.
28. Use `domain_create_asset_slot_candidate`, `domain_create_keyframe_candidate`, or inline `domain_append_candidate` only for compatibility source-entity candidate flows.
29. Run `domain_inspect` after content candidate/decision/selection writes, then run `domain_interpret` when downstream artifact tools need refreshed backend decision metadata. Use `domain_regeneration_plan` after interpret when the change may stale downstream generated media.

## Notes

- MovScript Desktop MCP must be running for tool calls to execute.
- Pass `projectId` for generation and candidate/domain writes. MCP must not infer project.
- Prefer `model_id` values returned by `system_model_list`; do not invent provider-specific model identifiers.
- Keep generation prompts grounded in project context, resource-library records, and shot-library references when available.
- In the final answer, briefly report the focused scene_moment/expression-unit readiness and whether the next action is planning, keyframe/storyboard supplementation, candidate generation, edit-plan composition, dependency selection, or candidate selection.
- Do not pass MCP resource URIs or external provider URLs to `input_resource_ids` / `reference_resource_ids`; those fields accept MovScript RawResource IDs.
- Preserve UI review boundaries. Do not treat generated resources as final accepted domain state until the user/workflow records `adopt` or a legacy selection, and `domain_inspect` plus `domain_interpret` refresh the relevant source or backend decision metadata.
- Open `references/candidate-selection-flow.md` when writing or selecting candidates, `references/resource-id-rules.md` when a request mixes URLs, local files, MCP resources, uploads, or RawResource IDs, and `references/shot-imitation-workflow.md` when the user asks to mimic a specific shot or reference video.
