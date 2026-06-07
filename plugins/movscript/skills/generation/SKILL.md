---
name: generation
description: Use MovScript MCP tools for image and video generation with model discovery, workspace context, and job polling.
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
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_review
  - mcp__movscript__domain_build
---

# Generation

Use this skill when a user asks the provider to generate or plan generated images/videos through MovScript.

## Workflow

1. Read workspace context first when the request references project entities, scenes, script passages, keyframes, asset slots, or house style.
2. Use `system_focus_get` for the selected project/production. When prompts should be grounded in screenplay or project context, read/search project workspace source files and `.build/`.
3. Call `system_model_list` before generation unless the user or UI already provided a valid `model_id`.
4. Use `system_resource_library_query` when you need existing MovScript images/videos/text/audio. Only returned `RawResource.ID` values should be passed as `input_resource_ids` or `reference_resource_ids`.
5. When you need to visually inspect an existing image RawResource, call `system_resource_image_read` with its resource ID. When you need to inspect a video RawResource, call `system_resource_video_extract_frames`; use `mode`, `timestamps_sec`, `range`, or `burst` parameters for fine-grained frame selection, and do not request or read the original video blob for vision.
6. When a generation needs a simple visual instruction layer, call `system_resource_image_annotate` with structured marks. Review its MCP image output, then call `system_resource_upload` with `artifact_path` so the guidance image becomes a RawResource.
7. Use `system_shot_library_query` for camera, composition, motion, narrative, emotion, and production-pattern references. Treat shot-library records as prompt guidance unless they also include a usable MovScript RawResource ID.
8. Use `system_external_resource_source_list` and `system_external_resource_search` only for external provider discovery. External results must be imported into MovScript before they can be used as generation resource IDs.
9. Use `system_generate_image` for text-to-image and image-to-image. Pass `input_resource_ids` or `reference_resource_ids` for image-conditioned generation, including uploaded agent guidance images when useful.
10. Use `system_generate_video` for text-to-video and image-to-video. Pass `input_resource_ids` or `reference_resource_ids` for image-conditioned video.
11. Poll with the matching `system_generate_*_job_get` tool until `terminal` is true.
12. When a generated `output_resource_id` should become an asset, keyframe, or content unit candidate, use `domain_append_candidate` or `domain_select_candidate` when applicable; otherwise use `domain_get_model` and edit source files. Then run `domain_review` and `domain_build`.

## Notes

- MovScript Desktop MCP must be running for tool calls to execute.
- Prefer `model_id` values returned by `system_model_list`; do not invent provider-specific model identifiers.
- Keep generation prompts grounded in project context, resource-library records, and shot-library references when available.
- Do not pass MCP resource URIs or external provider URLs to `input_resource_ids` / `reference_resource_ids`; those fields accept MovScript RawResource IDs.
- Preserve UI review boundaries. Do not treat generated resources as final accepted domain state until `domain_review` and `domain_build` confirm the change.
