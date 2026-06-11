---
name: generation
description: Generate or plan MovScript image/video outputs with project context, resource IDs, job polling, candidate writes, inspect, and interpret.
toolGrants:
  - mcp__movscript__system_model_list
  - mcp__movscript__system_generate_image
  - mcp__movscript__system_generate_image_job_get
  - mcp__movscript__system_generate_video
  - mcp__movscript__system_generate_video_job_get
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_image_read
  - mcp__movscript__system_resource_video_extract_frames
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
  - mcp__movscript__domain_read_content_unit_input_version
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
- Generation outputs are MovScript resources first. They become domain state only when written as candidates or selections.
- `input_resource_ids` and `reference_resource_ids` accept MovScript RawResource IDs, not MCP resource URIs, local paths, or external provider URLs.
- Content unit artifact bundles contain runtime panel, input version, dependency report, and selection validity. Derive or read these before changing generated content when they are relevant.
- Generated candidates and selections are source changes. Inspect/review and interpret after writing them.
- `domain_create_content_candidate` is the preferred path for production outputs anchored to content units. Inline asset/keyframe candidates are compatibility paths for source-entity candidate workflows.
- Do not select a candidate just because generation succeeded. Select only when the user or an explicit workflow asks to use, confirm, choose, lock, or set the output.
- Before generation, classify the focused scene_moment or shot as `缺规划`, `可补图`, or `可生成`. Generate only when the requested output's content unit artifacts and upstream visual/audio anchors are ready enough for the user's goal; otherwise state the smallest planning or anchor gap first.

## Workflow

1. Read workspace context first when the request references project entities, scenes, script passages, keyframes, asset slots, or house style.
2. Use `system_focus_get` for the selected project/production. Use `domain_overview`, `domain_query_production_context`, `domain_query_assets`, and content-unit artifact tools before reading many files.
3. Call `system_model_list` before generation unless the user or UI already provided a valid `model_id`.
4. Use `system_resource_library_query` when you need existing MovScript images/videos/text/audio. Only returned `RawResource.ID` values should be passed as `input_resource_ids` or `reference_resource_ids`.
5. When you need to visually inspect an existing image RawResource, call `system_resource_image_read` with its resource ID. When you need to inspect a video RawResource, call `system_resource_video_extract_frames`; use `mode`, `timestamps_sec`, `range`, or `burst` parameters for fine-grained frame selection, and do not request or read the original video blob for vision.
6. When a generation needs a simple visual instruction layer, call `system_resource_image_annotate` with structured marks. The tool stores the annotated SVG at `artifact_path` and returns metadata only; call `system_resource_upload` with `artifact_path` so the guidance image becomes a RawResource.
7. Use `system_shot_library_query` for camera, composition, motion, narrative, emotion, and production-pattern references. Treat shot-library records as prompt guidance unless they also include a usable MovScript RawResource ID.
8. Use `system_external_resource_source_list` and `system_external_resource_search` only for external provider discovery. External results must be imported into MovScript before they can be used as generation resource IDs.
9. For image requests, prefer supplementing keyframes when the shot is clear but visual anchors are missing; use `system_generate_image` for text-to-image and image-to-image only after the content unit and references are clear enough.
10. For storyboard or shot-image requests, prefer supplementing storyboard graph/panels when the shot is clear but storyboard assets are missing.
11. For video requests, use `system_generate_video` for text-to-video and image-to-video only after the shot, keyframes/storyboards, and content unit inputs are ready enough; if the user still wants video with gaps, explain the risk and use the minimum viable references.
12. Pass `input_resource_ids` or `reference_resource_ids` for image/video-conditioned generation, including uploaded agent guidance images when useful.
13. Poll with the matching `system_generate_*_job_get` tool until `terminal` is true.
14. When a generated `output_resource_id` should become a content unit candidate, use `domain_create_content_candidate` or `domain_create_content_candidate_batch` with the content unit artifact input version and prompt snapshot.
15. Use `domain_select_content_unit_candidate` or its batch variant only after the user/workflow confirms that the candidate should become the chosen output/reference.
16. Use `domain_create_asset_slot_candidate`, `domain_create_keyframe_candidate`, or inline `domain_append_candidate` only for compatibility source-entity candidate flows.
17. Run `domain_inspect` or `domain_review` after candidate/selection writes, then run `domain_interpret`. Use `domain_regeneration_plan` after interpret when the change may stale downstream generated media.

## Notes

- MovScript Desktop MCP must be running for tool calls to execute.
- Pass `projectId` for generation and candidate/domain writes. MCP must not infer project.
- Prefer `model_id` values returned by `system_model_list`; do not invent provider-specific model identifiers.
- Keep generation prompts grounded in project context, resource-library records, and shot-library references when available.
- In the final answer, briefly report the focused scene_moment/shot readiness and whether the next action is planning, keyframe/storyboard supplementation, candidate generation, or candidate selection.
- Do not pass MCP resource URIs or external provider URLs to `input_resource_ids` / `reference_resource_ids`; those fields accept MovScript RawResource IDs.
- Preserve UI review boundaries. Do not treat generated resources as final accepted domain state until inspect/review and interpret confirm the change.
- Open `references/candidate-selection-flow.md` when writing or selecting candidates, and `references/resource-id-rules.md` when a request mixes URLs, local files, MCP resources, uploads, or RawResource IDs.
