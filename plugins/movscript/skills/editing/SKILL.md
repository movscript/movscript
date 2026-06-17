---
name: editing
description: Create MovScript MediaEditingProjects, edit timelines, run Electron mediaPipeline tasks, and explicitly import/export editing artifacts without writing candidate decisions by default.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_video_probe
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_scene_moment_edit_plan
  - mcp__movscript__domain_read_production_timeline
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
  - mcp__movscript__editing_project_create
  - mcp__movscript__editing_project_create_from_edit_plan
  - mcp__movscript__editing_project_get
  - mcp__movscript__editing_project_update_settings
  - mcp__movscript__editing_project_add_asset
  - mcp__movscript__editing_project_remove_asset
  - mcp__movscript__editing_project_save
  - mcp__movscript__editing_timeline_add_track
  - mcp__movscript__editing_timeline_remove_track
  - mcp__movscript__editing_timeline_add_clip
  - mcp__movscript__editing_timeline_update_clip
  - mcp__movscript__editing_timeline_split_clip
  - mcp__movscript__editing_timeline_move_clip
  - mcp__movscript__editing_timeline_delete_clip
  - mcp__movscript__editing_timeline_apply_commands
  - mcp__movscript__editing_timeline_validate
  - mcp__movscript__editing_runtime_capabilities_get
  - mcp__movscript__editing_task_render_create
  - mcp__movscript__editing_task_hls_create
  - mcp__movscript__editing_task_transcode_create
  - mcp__movscript__editing_task_reframe_create
  - mcp__movscript__editing_task_get
  - mcp__movscript__editing_task_cancel
  - mcp__movscript__editing_task_logs_get
  - mcp__movscript__editing_export_save_local
  - mcp__movscript__editing_export_import_resource
  - mcp__movscript__editing_export_publish_hls
  - mcp__movscript__editing_export_create_candidate
  - mcp__movscript__system_artifact_upload_export
  - mcp__movscript__system_artifact_upload_hls_stream
  - mcp__movscript__system_artifact_get_stream
---

# Editing

Use this skill when the user asks to cut, trim, compose, align, stitch, render, export, or revise a MovScript video timeline.

The default editing path is the dedicated `editing_*` tool family. Editing runs through MovScript `MediaEditingProject` and Electron `mediaPipeline`, not through backend composition tools.

## Concepts

- `MediaEditingProject` is the top-level editing object. It owns project identity, source/provenance, asset registry, timeline, revision, and workspace binding.
- `MediaTimelineRecipe` is the timeline inside the project. It contains tracks and clips, but it is not the user's whole editing project.
- `MediaAssetDescriptor` points to a RawResource, generated resource, local file, or bytes-backed source. Asset registration is separate from placing a clip on the timeline.
- `editing_project_*` creates, reads, saves, and expands editing projects.
- `editing_project_update_settings` changes project-level editing settings; `editing_project_remove_asset` only removes unused asset references.
- `editing_timeline_*` mutates tracks and clips. These tools only change project data; they do not render, call AI providers, or write candidates.
- `editing_task_*` schedules Electron mediaPipeline tasks. MP4 render, HLS packaging, transcode, and mechanical reframe execute locally in Electron when runtime IPC is connected.
- Subtitle burn-in is an editing concern: text/subtitle clips may use ASS/libass rendering, and subtitle assets such as `.ass`, `.ssa`, `.srt`, or `.vtt` are burned locally by Electron during render.
- `editing_export_*` handles completed editing artifacts. Export import uploads a local artifact as RawResource; HLS publish uploads manifest/segments as a MediaStreamArtifact; candidate creation remains an explicit separate action.
- `edit_plan` is domain-derived context from selected content-unit candidates. Use it as input to `editing_project_create_from_edit_plan`, not as the final editing protocol.

Do not use `timeline_document` or historical third-party fields as the main workflow contract. They are historical artifacts, not the MovScript editing model.

## Workflow

1. Resolve focus with `system_focus_get` when project, production, or scene moment is ambiguous.
2. Use `domain_query_production_context` and `domain_read_scene_moment_edit_plan` to find selected material candidates and diagnose missing selections.
3. If required expression-unit materials are missing or unselected, stop and ask for generation/selection first unless the user explicitly wants an unstable draft.
4. Create the editing project:
   - Use `editing_project_create_from_edit_plan` when a MovScript `edit_plan` exists.
   - Use `editing_project_create` for a manual project or imported local media.
5. Add extra materials with `editing_project_add_asset` before putting them on the timeline.
   - Use `editing_project_remove_asset` only for assets that no clip still references.
   - Use `editing_project_update_settings` for canvas, fps, background, title, or workspace binding changes.
6. Edit the timeline with the smallest applicable `editing_timeline_*` tool:
   - add/remove tracks with `editing_timeline_add_track` and `editing_timeline_remove_track`,
   - add clips with `editing_timeline_add_clip`,
   - adjust trim, duration, placement, fit, opacity, volume, text, or metadata with `editing_timeline_update_clip`,
   - split, move, or delete clips with `editing_timeline_split_clip`, `editing_timeline_move_clip`, and `editing_timeline_delete_clip`,
   - use `editing_timeline_apply_commands` only when batching multiple command objects is more concise.
7. Run `editing_timeline_validate` after meaningful timeline changes.
8. Persist the project with `editing_project_save`. Read it later with `editing_project_get`.
9. Before local render/package work, call `editing_runtime_capabilities_get` to verify Electron `mediaPipeline` and FFmpeg availability.
10. Render or package through Electron:
   - use `editing_task_render_create` for MP4 timeline render,
   - place subtitle assets on a `subtitle` track with `assetType: "subtitle"` and `subtitle.format` when subtitles should be burned into the render; use `subtitle.format: "ass"` or `subtitle.renderer: "ass"` for ASS/libass styling,
   - use `editing_task_hls_create` for HLS when available; pass `output.hlsVariants` for adaptive renditions such as `[{ "name": "360p", "width": 640, "height": 360, "videoBitrateKbps": 900 }]`,
   - use `editing_task_transcode_create` or `editing_task_reframe_create` for source-level deterministic tasks.
11. Poll `editing_task_get` with `projectId` and `taskId`; use `editing_task_logs_get` with the same `projectId` for FFmpeg/task diagnostics so Electron can recover persisted task manifests/logs after an app restart. Use `editing_task_cancel` with `projectId` and `taskId` when the user asks to stop a task; if the app restarted, Electron can recover the persisted manifest and write back a clear canceled diagnostic.
12. Use `editing_export_save_local` with `savePath` to copy a completed single-file Electron task output to a user-selected local file path, or with `saveDirectory` to copy a complete HLS bundle locally. For HLS, pass `hlsDirectory` when available so the runtime can merge directory-discovered manifest/playlist/init/segment files with any explicit `segmentPaths`. Without `savePath` / `saveDirectory`, use it only to report/confirm an existing local output path. This never uploads resources or writes candidates. If render output should enter the resource library, either set `output.importToResource` on the render request or call `editing_export_import_resource` for an existing local output path. Use `system_artifact_upload_export` only for a completed export artifact that is already outside the editing task workflow. If HLS output should be served for preview/playback, call `editing_export_publish_hls` after `editing_task_hls_create` succeeds; use `system_artifact_upload_hls_stream` only for a completed HLS artifact that is already outside the editing task workflow. When any export or artifact tool resolves an Electron task by `taskId`, pass the matching `projectId` as well; this applies to `editing_export_save_local`, `editing_export_import_resource`, `editing_export_publish_hls`, `system_artifact_upload_export`, and `system_artifact_upload_hls_stream`.
13. Only create or select a domain candidate when the user/workflow explicitly asks to record the edited result:
    - use `domain_create_content_candidate` or `editing_export_create_candidate` for RawResource-backed candidate creation,
    - treat HLS `MediaStreamArtifact` outputs as hosted previews for now; writing HLS stream outputs as candidates requires a future domain candidate schema extension,
    - use `domain_decide_content_unit_candidate` with `adopt`, `reject`, or `defer` for user-facing decisions,
    - run `domain_inspect` and `domain_interpret` when downstream domain state must see the new candidate/selection.

## Rules

- Use `editing_*` for all product editing. `domain_compose_scene_moment_from_edit_plan` and `domain_compose_production_from_timeline` are not available editing paths; do not plan around them. Do not use resource-level video utilities as the editing path.
- Use backend resource/media transform tools only for neutral preparation such as frame extraction, image transforms, or diagnostic probes. They must not be treated as product timeline render.
- Do not call AI generation tools from this skill unless the user asks to create missing source material. Generation outputs must enter candidate/selection flow before becoming stable dependencies.
- Do not automatically create, adopt, or select candidates after a render succeeds. Render success, RawResource upload, and domain adoption are separate user/workflow decisions.
- Do not edit `.interpret/**` or generated `edit_plan` artifacts directly. They are diagnostic context and can be regenerated.
- Do not put local paths, external URLs, or binary payloads in domain JSON. Local files belong in `MediaAssetDescriptor` / Electron workspace flow; stable domain state should reference RawResource IDs.
- When the MCP process is not running inside Electron, runtime tools return `ELECTRON_EDITING_RUNTIME_REQUIRED`. Report that Electron mediaPipeline is required instead of falling back to backend render.
- Keep provenance: preserve scene moment, production, content unit, selected candidate, and resource IDs on the editing project or exported candidate metadata.

## Non-Editing Utilities

The old backend composition tools are intentionally unavailable:

- `domain_compose_scene_moment_from_edit_plan`
- `domain_compose_production_from_timeline`

Resource-level media utilities are outside this skill's default editing grants. If the user asks for normal editing, create/edit/render a `MediaEditingProject` with `editing_*`. If they explicitly ask for neutral material preparation, switch to the appropriate resource/generation workflow instead of treating that operation as editing.

## Output

When reporting an editing result, include:

- project id and editing project id,
- timeline validation status and remaining blockers,
- task id, task status, progress, and output path/resource id when rendering,
- whether the artifact was only exported/imported or also written as a domain candidate,
- whether any candidate was adopted/selected,
- next actionable step, such as continue timeline edits, render, inspect logs, import export, or record a candidate decision.
