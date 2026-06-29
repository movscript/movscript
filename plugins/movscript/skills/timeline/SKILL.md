---
name: timeline
description: Compile MovScript TimelineAssembly intent into CompileManifest, backend selection, conformance reports, and optional no-persist backend execution projects. Use when planning timeline assembly, choosing MediaEditingProject vs Remotion vs HyperFrames vs External NLE, validating backend fit, or preparing the handoff before render/export.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_production_timeline
  - mcp__movscript__domain_read_scene_moment_timeline
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_interpret
  - mcp__movscript__timeline_backend_capability_list
  - mcp__movscript__timeline_assembly_get
  - mcp__movscript__timeline_assembly_validate
  - mcp__movscript__timeline_compile_manifest_create
  - mcp__movscript__timeline_backend_select
  - mcp__movscript__timeline_backend_project_create
  - mcp__movscript__timeline_assembly_compile
  - mcp__movscript__timeline_backend_conformance_report
  - mcp__movscript__editing_project_create_from_edit_decisions
  - mcp__movscript__editing_runtime_capabilities_get
---

# Timeline

Use this skill for the second production step: planning timeline. Content planning decides what should exist; generation creates candidates; timeline compile decides how selected content becomes an executable cut or composition.

## Boundary

- `TimelineAssembly` is the edit intent IR: selected materials, order, rhythm, layers, subtitles, audio, transitions, and review points.
- `CompileManifest` is the executable plan and conformance contract.
- Backend projects are sibling execution paths:
  - `MediaEditingProject`: track-based / FFmpeg / local NLE-lite.
  - `RemotionCompositionProject`: React/frame-based composition.
  - `HyperFramesCompositionProject`: HTML/GSAP/timed composition.
  - `ExternalNleProject`: XML/EDL/OTIO/FCPXML handoff; currently report blockers until an adapter exists.
- Do not treat `MediaEditingProject` as the only canonical timeline model.
- Do not render, upload, create candidates, adopt selections, or mutate domain source from this skill unless the user explicitly asks for that next step.

## Workflow

1. Resolve the project and timeline target from explicit user input, `projectId`/`project_id`, `targetRef`, `timeline_assembly_ref`, `scopeKind`/`scopeRef`, or Project Service context. Do not infer it from UI focus.
2. Read source context only as needed: `domain_overview`, then preview/production/scene timeline readers or content-unit dependency/selection reports.
3. Check upstream selection gates. If required scene-moment, expression-unit, storyboard, keyframe, asset, audio, or subtitle candidates are missing or unselected, stop and report `缺选择` unless the user explicitly wants an unstable draft.
4. Call `timeline_backend_capability_list` before choosing a backend when the output could reasonably be track-based, React/frame-based, HTML/GSAP, or external NLE.
5. Build or receive `TimelineAssembly`, `edit_decisions`, and optional `asset_manifest`. Use `timeline_assembly_validate` or `timeline_compile_manifest_create` before creating a backend project.
6. Use `timeline_backend_select` to explain the selected backend, renderer/runtime implications, review surface needs, and conformance status.
7. Use `timeline_backend_project_create` or `timeline_assembly_compile` to create a no-persist backend project handoff. Treat returned files/projects as draft execution artifacts, not source of truth.
8. If conformance returns blockers, do not silently choose another backend. Report the backend, blocker code, and what user/system action is needed.
9. Hand off:
   - to `editing` for MediaEditingProject persistence, timeline mutation, render/HLS/transcode, export, and candidate creation;
   - to Remotion or HyperFrames workflows for their generated project files;
   - to future External NLE export when adapter support exists.

## Review Gates

- Backend selection requires human confirmation when multiple viable backends exist or when the choice affects editability, renderer availability, or handoff format.
- A browser URL from domain/project/status tools is only a review entrypoint, not approval.
- `ready` conformance means compile can proceed; it does not mean the final edit is approved.
- Render success, artifact upload, and candidate adoption are separate decisions.

## Output

Report:

- target timeline scope or assembly ref,
- selected backend and why,
- CompileManifest status,
- blockers/warnings from the conformance report,
- whether a backend project was only generated, persisted, rendered, or exported,
- next action: fix upstream selections, confirm backend, persist/edit project, render/export, or record a candidate decision.
