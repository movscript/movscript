---
name: system_edit
description: Edit an already opened MovScript system_editing workspace backed by a MediaEditingProject. Use after production-editing hands off a system_editing workspace.
toolGrants:
  - mcp__movscript__movscript_runtime_status
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
  - mcp__movscript__editing_task_get
  - mcp__movscript__editing_task_logs_get
  - mcp__movscript__editing_task_cancel
  - mcp__movscript__editing_export_import_resource
  - mcp__movscript__editing_export_create_candidate
---

# System Edit

Use this skill after `production-editing` opens a `system_editing` workspace and returns `handoff.toSkill = "system_edit"`.

This skill owns concrete `MediaEditingProject` work: assets, tracks, clips, validation, rendering, logs, and export/import.

Open `../domain/references/resource-discoverability.md` before importing rendered files or creating candidates so previews/exports have clear names, revision status, and source provenance.

Open `../domain/references/user-facing-response.md` before ordinary edit, render, import, or blocker replies so the user hears what changed, what was saved, and what choice remains.

## Workflow

1. Read the handoff context, especially `mediaProjectId`, `mediaEditingProjectId`, `productionId`, and `workspaceId`.
2. Load the project with `editing_project_get`.
3. Add assets, tracks, and clips with `editing_project_*` and `editing_timeline_*`.
4. Validate with `editing_timeline_validate`.
5. Render only when the user asks, using `editing_runtime_capabilities_get` and `editing_task_render_create`.
6. Import rendered output as RawResource by default when render succeeds, unless the user explicitly asks for local-only output or import is unavailable.
7. Create candidates only as a separate explicit decision.

## Rules

- Do not list, create, delete, or open production workspaces from this skill.
- Do not use Remotion project files or commands.
- Do not use removed legacy playback tools.
- Do not automatically adopt or select candidates after render.

## Production Contract

- Production step: Edit, validate, render, and import results for an already opened system editing workspace.
- Systems/config: Requires Editing Service `MediaEditingProject` access, Project Service workspace provenance, and Media Pipeline for render execution.
- Blockers: Missing editing project, invalid timeline, unavailable Editing Service or Media Pipeline, missing media assets, or render failure.
- Human review: Users approve timeline edits, renders, imports, and any candidate creation/adoption/selection.
- Output: Saved `MediaEditingProject` changes, validation/render status, RawResource import when possible, and no automatic candidate decision.
