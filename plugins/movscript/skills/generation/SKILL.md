---
name: generation
description: Generate MovScript image/video candidates from content units, enforce upstream selection gates, inspect reference-shot imitation via frames, and interpret candidate writes.
toolGrants:
  - mcp__movscript__system_model_list
  - mcp__movscript__system_generate_image
  - mcp__movscript__system_generate_image_job_get
  - mcp__movscript__system_generate_video
  - mcp__movscript__system_generate_video_job_get
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_image_read
  - mcp__movscript__system_resource_image_transform_to_resource
  - mcp__movscript__system_resource_video_extract_frames
  - mcp__movscript__system_resource_video_probe
  - mcp__movscript__system_resource_video_extract_frame_to_resource
  - mcp__movscript__system_resource_video_extract_frames_to_resources
  - mcp__movscript__system_resource_video_trim_to_resource
  - mcp__movscript__system_resource_video_compose_to_resource
  - mcp__movscript__system_resource_video_concat_to_resource
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

Use this skill when a user asks the provider to generate or plan generated images/videos through MovScript.

## Concepts

- Generation tools do not infer project from session, cwd, route, or focus. Pass the intended `projectId`/`project_id` for project-scoped generation.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Generation outputs are MovScript resources first. They become effective domain state only when written as backend candidates or selections.
- `input_resource_ids` and `reference_resource_ids` accept MovScript RawResource IDs, not MCP resource URIs, local paths, or external provider URLs.
- Resource/media transform tools are intentionally business-neutral. Use `*_to_resource` tools to create reusable RawResources for generation inputs, references, review artifacts, or later candidate writes; do not expect these tools to update content units, candidates, or selections by themselves.
- Resource/media transform uploads persist generic derivative metadata (`operation`, `input_resource_ids`, and params) on the created RawResource. Treat this as provenance, not domain acceptance.
- Content unit prompts may carry project-wide style reference images from `project_standards.custom_rules[key=style_reference_images]`. Treat `style_reference_resource_ids` and `runtime_request.inputs[role=style_reference]` as house-style references for visual consistency; pass them as `reference_resource_ids` whenever the selected image/video model supports reference images.
- Content unit artifact bundles contain runtime panel, input version, dependency report, and selection validity. Derive or read these before changing generated content when they are relevant.
- Generated content-unit candidates and selections are backend decision metadata, not workspace source-file edits. Inspect/review and interpret after writing them when the effective interpreted state must be refreshed.
- `domain_create_content_candidate` is the preferred backend decision path for production outputs anchored to content units. Inline asset/keyframe candidates are compatibility paths for source-entity candidate workflows.
- For completed generated content-unit outputs, omit `status` when calling `domain_create_content_candidate` or `domain_create_content_candidate_batch`; the backend defaults it to `succeeded`. If you must pass `status`, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; never use `completed`, `ready`, `done`, `selected`, or `accepted`.
- Do not select a candidate just because generation succeeded. Select only when the user or an explicit workflow asks to use, confirm, choose, lock, or set the output.
- Before generation, identify whether the output center is a `shot` or a `scene_moment`, then classify it as `缺规划`, `可补图`, `缺选择`, or `可生成`.
- Generate only when the requested output's content unit artifacts and needed upstream visual/audio anchors are ready enough for the user's goal. For a low-consistency draft, a direct `shot_ref` or `scence_moment_ref` content unit can be enough; state the tradeoff instead of forcing asset/keyframe/storyboard prerequisites.
- If a downstream content unit depends on an upstream content unit output, and the upstream output has no selection, stop before generation unless the user explicitly asks for an unstable draft path.
- If the user asks to mimic a specific shot or reference video, open `references/shot-imitation-workflow.md`; analyze extracted frames and create storyboard panels before downstream video generation.

## Workflow

1. Read workspace context first when the request references project entities, scenes, script passages, keyframes, asset slots, or house style.
2. Use `system_focus_get` for the selected project/production. Use `domain_overview`, `domain_query_production_context`, `domain_query_assets`, and content-unit artifact tools before reading many files.
3. Identify the output center: a `shot`, a `scene_moment`, or an upstream evidence item such as an asset, keyframe, or storyboard.
4. Decide whether the current goal needs strong consistency evidence or a fast draft path. Do not block a simple draft only because optional setting, asset, keyframe, or storyboard references are absent.
5. Call `system_model_list` before generation unless the user or UI already provided a valid `model_id`.
6. Use `system_resource_library_query` when you need existing MovScript images/videos/text/audio. Only returned `RawResource.ID` values should be passed as `input_resource_ids` or `reference_resource_ids`.
7. When you need to visually inspect an existing image RawResource, call `system_resource_image_read` with its resource ID. When you need to inspect a video RawResource, call `system_resource_video_extract_frames`; use `mode`, `timestamps_sec`, `range`, or `burst` parameters for fine-grained frame selection, and do not request or read the original video blob for vision.
8. When a frame, crop, resized image, contact sheet, trimmed clip, extracted audio, or composed clip must be reused by generation or written as a candidate, create a RawResource with a `*_to_resource` tool: `system_resource_video_extract_frame_to_resource`, `system_resource_video_extract_frames_to_resources`, `system_resource_image_transform_to_resource`, `system_resource_video_contact_sheet_to_resource`, `system_resource_video_trim_to_resource`, `system_resource_video_extract_audio_to_resource`, or `system_resource_video_compose_to_resource`.
9. When a generation needs a simple visual instruction layer, call `system_resource_image_annotate` with structured marks. The tool stores the annotated SVG at `artifact_path` and returns metadata only; call `system_resource_upload` with `artifact_path` so the guidance image becomes a RawResource.
10. Use `system_resource_video_compose_to_resource` or `system_resource_video_concat_to_resource` to stitch multiple generated RawResource videos into one MP4 RawResource. Treat the composed resource as a new output candidate only after explicitly writing the candidate metadata.
11. Use `system_shot_library_query` for camera, composition, motion, narrative, emotion, and production-pattern references. Treat shot-library records as prompt guidance unless they also include a usable MovScript RawResource ID.
12. Use `system_external_resource_source_list` and `system_external_resource_search` only for external provider discovery. External results must be imported into MovScript before they can be used as generation resource IDs.
13. For image requests, prefer supplementing keyframes when the shot is clear but visual anchors are missing; use `system_generate_image` for text-to-image and image-to-image only after the content unit and references are clear enough.
14. For asset references, prefer low-background, multi-view, weakly plot-bound images unless the user asks for scene-specific imagery.
15. For storyboard or shot-image requests, prefer supplementing storyboard graph/panels when the shot is clear but storyboard assets are missing.
16. For reference-shot imitation, extract frames across the full reference clip, materialize useful reference frames or contact sheets as RawResources when they will condition generation, analyze the shot, create/update shot/storyboard/keyframe structure, create a storyboard-panel content unit, and require selection before dependent video generation.
17. For video requests, use `system_generate_video` for text-to-video and image-to-video after the focused `shot_ref` or `scence_moment_ref` content unit is ready enough. Require selected upstream assets/keyframes/storyboards only when the user needs stable continuity; otherwise explain the risk and use the minimum viable references.
18. Pass semantic upstream images/videos as `input_resource_ids` when they are conditioning inputs, and pass project style reference images as `reference_resource_ids` so new images/videos keep the same visual style, texture, color, and lighting. Include uploaded agent guidance images when useful.
19. Poll with the matching `system_generate_*_job_get` tool until `terminal` is true.
20. When a generated or transformed `output_resource_id` should become a content unit candidate, use `domain_create_content_candidate` or `domain_create_content_candidate_batch` with the content unit artifact input version and prompt snapshot. Omit `status` for successful completed outputs unless you are intentionally recording a non-default status.
21. Use `domain_select_content_unit_candidate` or its batch variant only after the user/workflow confirms that the candidate should become the chosen output/reference.
22. Use `domain_create_asset_slot_candidate`, `domain_create_keyframe_candidate`, or inline `domain_append_candidate` only for compatibility source-entity candidate flows.
23. Run `domain_inspect` after content candidate/selection writes, then run `domain_interpret` when `.interpret/current` must include the backend decision metadata. Use `domain_regeneration_plan` after interpret when the change may stale downstream generated media.

## Notes

- MovScript Desktop MCP must be running for tool calls to execute.
- Pass `projectId` for generation and candidate/domain writes. MCP must not infer project.
- Prefer `model_id` values returned by `system_model_list`; do not invent provider-specific model identifiers.
- Keep generation prompts grounded in project context, resource-library records, and shot-library references when available.
- In the final answer, briefly report the focused scene_moment/shot readiness and whether the next action is planning, keyframe/storyboard supplementation, candidate generation, dependency selection, or candidate selection.
- Do not pass MCP resource URIs or external provider URLs to `input_resource_ids` / `reference_resource_ids`; those fields accept MovScript RawResource IDs.
- Preserve UI review boundaries. Do not treat generated resources as final accepted domain state until `domain_inspect` and `domain_interpret` refresh the relevant source or backend decision metadata.
- Open `references/candidate-selection-flow.md` when writing or selecting candidates, `references/resource-id-rules.md` when a request mixes URLs, local files, MCP resources, uploads, or RawResource IDs, and `references/shot-imitation-workflow.md` when the user asks to mimic a specific shot or reference video.
