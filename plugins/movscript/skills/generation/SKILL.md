---
name: generation
description: Use MovScript MCP tools for image and video generation with model discovery, context queries, job polling, and candidate handoff.
toolGrants:
  - mcp__movscript_workspace__generation_model_list
  - mcp__movscript_workspace__generation_image_generate
  - mcp__movscript_workspace__generation_image_job_get
  - mcp__movscript_workspace__generation_video_generate
  - mcp__movscript_workspace__generation_video_job_get
  - mcp__movscript_workspace__movscript_focus_get
  - mcp__movscript_workspace__movscript_project_list
  - mcp__movscript_workspace__movscript_script_list
  - mcp__movscript_workspace__movscript_script_locate
  - mcp__movscript_workspace__movscript_resource_library_query
  - mcp__movscript_workspace__movscript_resource_image_read
  - mcp__movscript_workspace__movscript_resource_video_extract_frames
  - mcp__movscript_workspace__movscript_resource_image_annotate
  - mcp__movscript_workspace__movscript_resource_upload
  - mcp__movscript_workspace__movscript_shot_library_query
  - mcp__movscript_workspace__movscript_external_resource_source_list
  - mcp__movscript_workspace__movscript_external_resource_search
  - mcp__movscript_workspace__movscript_creative_reference_query
  - mcp__movscript_workspace__movscript_asset_slot_query
  - mcp__movscript_workspace__movscript_production_context_query
  - mcp__movscript_workspace__candidate_asset_slot_attach
  - mcp__movscript_workspace__candidate_keyframe_attach
---

# Generation

Use this skill when a user asks Codex to generate or plan generated images/videos through MovScript.

## Workflow

1. Query context first when the request references project entities, scenes, script passages, keyframes, asset slots, or house style.
2. Use `mcp__movscript_workspace__movscript_focus_get` for the selected project/production, `mcp__movscript_workspace__movscript_script_list` when you need available script/version IDs, and `mcp__movscript_workspace__movscript_script_locate` when prompts should be grounded in screenplay text.
3. Call `mcp__movscript_workspace__generation_model_list` before generation unless the user or UI already provided a valid `model_id`.
4. Use `movscript_resource_library_query` when you need existing MovScript images/videos/text/audio. Only returned `RawResource.ID` values should be passed as `input_resource_ids` or `reference_resource_ids`.
5. When you need to visually inspect an existing image RawResource, call `movscript_resource_image_read` with its resource ID. When you need to inspect a video RawResource, call `movscript_resource_video_extract_frames`; use `mode`, `timestamps_sec`, `range`, or `burst` parameters for fine-grained frame selection, and do not request or read the original video blob for vision.
6. When a generation needs a simple visual instruction layer, call `movscript_resource_image_annotate` with structured `rect`, `circle`, `line`, `arrow`, `text`, or `highlight` shapes. Review its MCP image output, then call `movscript_resource_upload` with `artifact_path` so the guidance image becomes a RawResource.
7. Use `movscript_shot_library_query` for camera, composition, motion, narrative, emotion, and production-pattern references. Treat shot-library records as prompt guidance unless they also include a usable MovScript RawResource ID.
8. Use `movscript_external_resource_source_list` and `movscript_external_resource_search` only for external provider discovery. External results must be imported into MovScript before they can be used as generation resource IDs.
9. Use `generation_image_generate` for text-to-image and image-to-image. Pass `input_resource_ids` or `reference_resource_ids` for image-conditioned generation, including uploaded agent guidance images when useful.
10. Use `generation_video_generate` for text-to-video and image-to-video. Pass `input_resource_ids` or `reference_resource_ids` for image-conditioned video.
11. Poll with the matching `generation_*_job_get` tool until `terminal` is true.
12. When a generated `output_resource_id` should be attached to an asset slot or original keyframe, use the candidate attach tools. These create reviewable candidates only; they do not accept, select, bind, or lock the generated result.

## Notes

- MovScript Desktop MCP must be running for tool calls to execute.
- Prefer `model_id` values returned by `generation_model_list`; do not invent provider-specific model identifiers.
- Keep generation prompts grounded in project context, resource-library records, and shot-library references when available.
- Do not pass MCP resource URIs or external provider URLs to `input_resource_ids` / `reference_resource_ids`; those fields accept MovScript RawResource IDs.
- Preserve UI review boundaries. Do not treat candidate attachment as final acceptance.
