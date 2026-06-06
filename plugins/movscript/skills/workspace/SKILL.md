---
name: workspace
description: Refresh, preview, and apply MovScript workspace projection files or folders by path.
toolGrants:
  - mcp__movscript_workspace__workspace_update
  - mcp__movscript_workspace__workspace_apply_review
  - mcp__movscript_workspace__workspace_apply
---

# Workspace

Use this skill when a user asks to refresh, inspect, preview, or submit MovScript workspace projection files or folders.

In MovScript agent workflows, a workspace is a local projection path. The path can point to one projection file or to a folder containing projection files. Projection files include workspace JSON files, `project.json`, `scripts/{scriptId}/script.md`, and the read-only user project index. The agent does not need to decide database entity routes directly; MovScript resolves them from projection metadata.

## Workflow

1. Edit local projection files under `.movscript/data` when local file editing is available.
2. Use `mcp__movscript_workspace__workspace_apply_review` with `path` to preview what applying that file or folder would change in the backend database.
3. Use `mcp__movscript_workspace__workspace_apply` with the same `path` to submit local projection changes to the backend database.
4. Use `mcp__movscript_workspace__workspace_update` with `path` only when you intentionally want to refresh from the backend database and overwrite local changes under that file or folder.

## Paths

- Omit `path` only when the current task context already clearly maps to a workspace path.
- When `cwd` is available and points under `.movscript/data`, MovScript treats it as the projection folder for direct file editing.
- When both `path` and `cwd` are omitted, MovScript uses the current MCP focus project/production to choose the default projection folder.
- Prefer the narrowest path that contains the intended change.
- Single-file examples: `data/users/{userId}/projects.index.json`, `data/users/1/projects/12/project.json`, `data/users/1/projects/12/scripts/34/script.md`, `data/users/1/projects/12/settings/setting.workspace.json`.
- Folder examples: `data/users/{userId}`, `data/users/1/projects/12`, `data/users/1/projects/12/scripts`, `data/users/1/projects/12/productions/7`.
- Paths are projection paths under `.movscript/data`; do not target `.movscript/sync`, `.movscript/reviews`, `.movscript/providers`, `.movscript/.codex`, or `.movscript/.mova`.

## Rules

- Keep projection files as JSON or documented text projections. Do not embed binary media or large resource payloads.
- Preserve backend ids when present. Use stable `client_id` values for new rows.
- Always run `workspace_apply_review` before `workspace_apply` unless the user explicitly asks to submit immediately.
- Treat `workspace_update` as destructive for local edits in the selected path because it refreshes from backend state.
- Treat `data/users/{userId}/projects.index.json` as a read-only index. Refresh and preview it, but do not apply it back to the backend.
- Do not edit projection meta, sync records, review records, provider configs, or provider runtime homes as part of normal workspace changes.
- Do not bypass workspace tools by writing backend entities directly when a projection path exists for the change.

## Tool Notes

- `mcp__movscript_workspace__workspace_update` with `path` refreshes the local projection file or folder from the backend database and clears local dirty state. A project folder refreshes `project.json`, project-level workspace JSON files, and script markdown projections.
- `mcp__movscript_workspace__workspace_apply_review` with `path` reads local projection files and previews backend effects without writing backend state.
- `mcp__movscript_workspace__workspace_apply` with `path` reads local projection files and submits supported writable projections to the backend database.
