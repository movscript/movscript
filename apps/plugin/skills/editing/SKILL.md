---
name: editing
description: Create MovScript MediaEditingProjects, edit timelines through Editing Service, run media-pipeline render/transcode/HLS tasks when available, and explicitly import/export editing artifacts without writing candidate decisions by default.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_video_probe
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_scene_moment_edit_plan
  - mcp__movscript__domain_read_scene_moment_timeline
  - mcp__movscript__domain_read_production_timeline
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
  - mcp__movscript__editing_project_create
  - mcp__movscript__editing_project_create_from_edit_plan
  - mcp__movscript__editing_project_create_from_edit_decisions
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
  - mcp__movscript__editing_video_compose
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

Use this skill when the user asks to cut, trim, compose, align, stitch, render, export, or revise a MovScript video timeline. If runtime ownership or media execution availability is unclear, use the `runtime` skill first.

The default editing path is the dedicated `editing_*` tool family. Timeline state and editing business logic run through MovScript `MediaEditingProject` and `movscript.editing.service`; media execution runs through Electron `mediaPipeline` / `movscript.media.pipeline` when available. Do not use backend composition tools as the editing path.

Use the `timeline` skill first when the task is choosing a backend, compiling TimelineAssembly intent, producing a CompileManifest, or comparing MediaEditingProject/Remotion/HyperFrames/External NLE. Return to this skill once the selected path is the track-based `MediaEditingProject` backend or the user asks to render/export/edit that project.

Open `references/ai-clip-editing-rhythm.md` when assembling AI-generated clips, choosing a cut rhythm, trimming unstable generated clip starts/ends, matching color/style across generated candidates, planning transitions, or building a social/ad/trailer/music-video timeline.

## Agent Surface URLs

- When a timeline, preview, candidate, generation job, resource, or project-status MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it for the next editing/review step.
- Describe the action the page supports: inspect preview timeline clips/blockers, review generated source candidates before editing, monitor render/generation status, inspect resources, or record a candidate decision after export.
- Do not treat the returned URL as final approval, candidate adoption, or editing completion. Those are complete only after the user acts in the page or the agent writes the matching editing/domain decision through a tool.
- If secondary surfaces are returned, lead with the primary `surface.url`; include secondary URLs only when they help the next decision. Use URLs exactly as returned.

## Concepts

- `MediaEditingProject` is the top-level editing object. It owns project identity, source/provenance, asset registry, timeline, revision, and workspace binding.
- A `MediaEditingProject` is a task-specific working copy. A production or scene moment can have many independent edits, drafts, variants, exports, and candidates over time; do not treat any production, scene moment, or edit plan as owning exactly one canonical editing project.
- `MediaTimelineRecipe` is the timeline inside the project. It contains tracks and clips, but it is not the user's whole editing project.
- `MediaAssetDescriptor` points to a RawResource, generated resource, local file, or bytes-backed source. Asset registration is separate from placing a clip on the timeline.
- `editing_project_*` creates, reads, saves, and expands editing projects.
- `editing_project_create_from_edit_decisions` imports an OpenMontage-style `edit_decisions` + `asset_manifest` handoff into a MovScript `MediaEditingProject`.
- `editing_project_update_settings` changes project-level editing settings; `editing_project_remove_asset` only removes unused asset references.
- `editing_timeline_*` mutates tracks and clips. These tools only change project data; they do not render, call AI providers, or write candidates.
- `editing_video_compose` is the MovScript video_compose entrypoint: it can create a MediaEditingProject from `edit_decisions`, validate the timeline, and submit a Media Pipeline MP4/HLS task. It supports `movscript_media_pipeline` / `ffmpeg` only today; Remotion, HyperFrames, and external NLE runtimes must return explicit blockers instead of silently falling back.
- `editing_task_*` schedules media-pipeline tasks. MP4 render, HLS packaging, transcode, and mechanical reframe execute through the available Media Pipeline runtime: cloud/external media worker, local daemon-owned Media Pipeline, Desktop enhancement adapter when explicitly advertised, or another runtime advertised by capability status.
- Subtitle burn-in is an editing concern: text/subtitle clips may use ASS/libass rendering, and subtitle assets such as `.ass`, `.ssa`, `.srt`, or `.vtt` are burned by the media pipeline during render.
- `editing_export_*` handles completed editing artifacts. Export import uploads a local artifact as RawResource; HLS publish uploads manifest/segments as a MediaStreamArtifact; candidate creation remains an explicit separate action.
- `edit_plan` and domain timeline handoffs are read-only source/context snapshots from selected candidates. Use them to seed a new editing project or to recover provenance, not as final editing state.
- The return path is explicit: render/export locally, then bring the artifact back as a RawResource or hosted HLS preview; only write or select a domain candidate when the user/workflow asks for that decision.

Do not use `timeline_document` or historical third-party fields as the main workflow contract. They are historical artifacts, not the MovScript editing model.
Do not use domain planning/production records as the editing workspace. Domain records describe intended structure and selected source material; editing projects contain concrete cuts, trims, overlays, subtitles, and export task state.

## Workflow

1. Resolve the intended project and optional timeline scope/assembly/scene-moment target from explicit user input, a passed locator, or Project Service context. Do not infer it from UI focus.
2. Use domain tools only to gather source context and selected materials:
   - use `domain_query_production_context` to inspect the legacy production projection, scene structure, and candidate selections,
   - use `domain_read_scene_moment_edit_plan` or `domain_read_scene_moment_timeline` when a scene-moment handoff is useful,
   - use `domain_read_production_timeline` only as a legacy production / timeline-assembly material handoff, not as a promise that the scope has one canonical edit.
3. If required expression-unit materials are missing or unselected, stop and ask for generation/selection first unless the user explicitly wants an unstable draft.
4. Create the editing project:
   - Use `editing_project_create_from_edit_plan` when a scene-moment `edit_plan` is a good seed.
   - Use `editing_project_create_from_edit_decisions` when the handoff already contains `cuts[]`, overlays, audio, subtitles, and asset refs.
   - Use `editing_project_create` for a manual project, imported local media, timeline assembly, alternate cut, revision, or any task that should not be coupled one-to-one to a domain handoff.
   - Give the project title/source/provenance enough detail to distinguish drafts and variants, such as target timeline scope/assembly, scene moment, requested cut, selected candidate ids, and user intent.
5. Add extra materials with `editing_project_add_asset` before putting them on the timeline.
   - Use `editing_project_remove_asset` only for assets that no clip still references.
   - Use `editing_project_update_settings` for canvas, fps, background, title, or workspace binding changes.
6. If the edit is made from multiple generated clips or needs a deliberate social/ad/trailer/music-video rhythm, open `references/ai-clip-editing-rhythm.md` and choose a rhythm formula before placing many clips.
7. Edit the timeline with the smallest applicable `editing_timeline_*` tool:
   - add/remove tracks with `editing_timeline_add_track` and `editing_timeline_remove_track`,
   - add clips with `editing_timeline_add_clip`,
   - adjust trim, duration, placement, fit, opacity, volume, text, or metadata with `editing_timeline_update_clip`,
   - split, move, or delete clips with `editing_timeline_split_clip`, `editing_timeline_move_clip`, and `editing_timeline_delete_clip`,
   - use `editing_timeline_apply_commands` only when batching multiple command objects is more concise.
8. Run `editing_timeline_validate` after meaningful timeline changes.
9. Persist the project with `editing_project_save`. Read it later with `editing_project_get`.
10. Before render/package work, call `editing_runtime_capabilities_get` to verify Media Pipeline and FFmpeg availability. If unavailable, keep the editing project/timeline work intact and report the render capability gap instead of treating editing itself as impossible.
11. Render or package through Media Pipeline:
   - use `editing_video_compose` when starting from `edit_decisions` or when you want one call to create/validate/submit a render task,
   - use `editing_task_render_create` for MP4 timeline render,
   - place subtitle assets on a `subtitle` track with `assetType: "subtitle"` and `subtitle.format` when subtitles should be burned into the render; use `subtitle.format: "ass"` or `subtitle.renderer: "ass"` for ASS/libass styling,
   - use `editing_task_hls_create` for HLS when available; pass `output.hlsVariants` for adaptive renditions such as `[{ "name": "360p", "width": 640, "height": 360, "videoBitrateKbps": 900 }]`,
   - use `editing_task_transcode_create` or `editing_task_reframe_create` for source-level deterministic tasks.
12. Poll `editing_task_get` with `projectId` and `taskId`; use `editing_task_logs_get` with the same `projectId` for FFmpeg/task diagnostics so the runtime can recover persisted task manifests/logs after restart. Use `editing_task_cancel` with `projectId` and `taskId` when the user asks to stop a task; if the runtime restarted, it can recover the persisted manifest and write back a clear canceled diagnostic.
13. Bring the completed artifact back explicitly:
    - use `editing_export_save_local` with `savePath` to copy a completed single-file media-pipeline output to a user-selected local file path, or with `saveDirectory` to copy a complete HLS bundle locally,
    - for HLS, pass `hlsDirectory` when available so the runtime can merge directory-discovered manifest/playlist/init/segment files with any explicit `segmentPaths`,
    - without `savePath` / `saveDirectory`, use `editing_export_save_local` only to report/confirm an existing local output path,
    - if render output should enter the resource library, either set `output.importToResource` on the render request or call `editing_export_import_resource` for an existing local output path,
    - if HLS output should be served for preview/playback, call `editing_export_publish_hls` after `editing_task_hls_create` succeeds,
    - use `system_artifact_upload_export` or `system_artifact_upload_hls_stream` only for completed artifacts that are already outside the editing task workflow,
    - when any export or artifact tool resolves an Electron task by `taskId`, pass the matching `projectId` as well; this applies to `editing_export_save_local`, `editing_export_import_resource`, `editing_export_publish_hls`, `system_artifact_upload_export`, and `system_artifact_upload_hls_stream`.
14. Only create or select a domain candidate when the user/workflow explicitly asks to record the edited result:
    - use `domain_create_content_candidate` or `editing_export_create_candidate` for RawResource-backed candidate creation,
    - treat HLS `MediaStreamArtifact` outputs as hosted previews for now; writing HLS stream outputs as candidates requires a future domain candidate schema extension,
    - use `domain_decide_content_unit_candidate` with `adopt`, `reject`, or `defer` for user-facing decisions,
    - run `domain_inspect` and `domain_interpret` when downstream domain state must see the new candidate/selection.

## Rules

- Use `editing_*` for all product editing. `domain_compose_scene_moment_from_edit_plan` and `domain_compose_production_from_timeline` are not available editing paths; do not plan around them. Do not use resource-level video utilities as the editing path.
- Do not use timeline assembly / legacy production or scene-moment domain handoff tools as mutable editing state. They are context readers. The mutable editing state is the `MediaEditingProject` returned by or passed through `editing_project_*` and `editing_timeline_*`.
- Do not assume `domain_read_production_edit_plan` or any legacy production/timeline-scope handoff is the correct default. A timeline scope can require many separate cuts and versions; create a dedicated editing project for the current task, then bring the exported artifact back explicitly.
- Do not overwrite or rewrite legacy production orchestration records, namespace nodes, or scene-moment source merely because a cut was rendered. Returning an edit to the domain means importing the artifact and, when explicitly requested, creating/adopting/selecting a content candidate.
- Use backend resource/media transform tools only for neutral preparation such as frame extraction, image transforms, or diagnostic probes. They must not be treated as product timeline render.
- Do not call AI generation tools from this skill unless the user asks to create missing source material. Generation outputs must enter candidate/selection flow before becoming stable dependencies.
- Do not automatically create, adopt, or select candidates after a render succeeds. Render success, RawResource upload, and domain adoption are separate user/workflow decisions.
- For AI-generated source clips, review starts/ends, color/style continuity, artifact risk, first-two-second hook, and transition intent before rendering. Use `references/ai-clip-editing-rhythm.md` for the checklist.
- Do not edit `.interpret/**` or generated `edit_plan` artifacts directly. They are diagnostic context and can be regenerated.
- Do not put local paths, external URLs, or binary payloads in domain JSON. Local files belong in `MediaAssetDescriptor` / editing runtime workspace flow; stable domain state should reference RawResource IDs.
- When Media Pipeline is unavailable, report that render/transcode/HLS execution requires a media-pipeline runtime instead of falling back to backend composition. Older tool results may still use `ELECTRON_EDITING_RUNTIME_REQUIRED`; interpret that as "media-pipeline runtime required", not as a hard Desktop-only requirement.
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
