---
name: production-editing
description: Create, list, open, delete, and hand off MovScript production-bound editing workspaces. Use this for production-level editing workspace lifecycle only; after opening a workspace, switch to system_edit or remotion.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__production_editing_resources_refresh
  - mcp__movscript__production_editing_workspace_list
  - mcp__movscript__production_editing_workspace_create
  - mcp__movscript__production_editing_workspace_get
  - mcp__movscript__production_editing_workspace_open
  - mcp__movscript__production_editing_workspace_delete
---

# Production Editing

Use this skill when the user wants to create, list, open, delete, or inspect production-bound editing workspaces.

This skill owns only the production-level lifecycle. It does not edit clips, tracks, Remotion source files, render commands, or candidate decisions.

## Concepts

- `timeline_namespace` owns story structure.
- `ProductionEditingWorkspace` owns concrete playback/editing structure for one production.
- Supported workspace kinds are only `system_editing` and `remotion`.
- Opening a workspace returns a handoff. After that, use the handed-off skill:
  - `system_editing` -> `system_edit`
  - `remotion` -> `remotion`
- Stale production resources do not overwrite existing workspaces. Create a new workspace version when the user wants a fresh seed.

## Workflow

1. Resolve project and production from explicit user input or focus.
2. Refresh production editing resources with `production_editing_resources_refresh` before create/open when the resource context matters.
3. List existing workspaces with `production_editing_workspace_list` before creating a duplicate.
4. Create a workspace with `production_editing_workspace_create` using only `kind: "system_editing"` or `kind: "remotion"`.
5. Open with `production_editing_workspace_open`.
6. Read the returned `handoff.toSkill` and switch to that skill for all concrete editing, preview, render, and diagnostics.

## Rules

- Do not create, read, validate, or mention removed legacy playback IR as part of the workflow.
- Do not call removed legacy playback tools.
- Do not mutate a `MediaEditingProject` from this skill.
- Do not edit Remotion files from this skill.
- Do not render, import results, create candidates, adopt, or select candidates from this skill.
- If the Remotion skill is missing, install it through the provider skill installer when available; otherwise return a clear blocker before concrete Remotion work.

## Production Contract

- Production step: Choose, create, open, refresh, or delete a production-bound editing workspace.
- Systems/config: Requires Project Service production editing endpoints and the active MovScript runtime/daemon gateway.
- Blockers: Missing project, missing production, unavailable Project Service, unsupported workspace kind, or backend handoff preflight blockers.
- Human review: Users choose the workspace kind and explicitly decide whether stale resources should seed a new workspace.
- Output: A refreshed resource index, workspace lifecycle result, and handoff to `system_edit` or `remotion`.
