---
name: workspace
description: Edit frontend-owned MovScript workspace files using the workspace model contract.
toolGrants:
  - mcp__movscript_workspace__get_workspace_model
  - mcp__movscript_workspace__workspace_file_list
  - mcp__movscript_workspace__workspace_file_read
  - mcp__movscript_workspace__workspace_file_write
  - mcp__movscript_workspace__workspace_file_delete
  - mcp__movscript_workspace__workspace_review_apply_preview
  - mcp__movscript_workspace__workspace_review_apply
---

# Workspace

Use this skill when a user asks to create, review, modify, validate, or apply MovScript workspace changes such as project standards, settings, production structure, content units, or asset slots.

## Workflow

1. Call `mcp__movscript_workspace__get_workspace_model` for the requested workspace kind and target before creating or editing content.
2. Treat the frontend `.movscript` file path returned by the workspace tools as the authoritative editable workspace file.
3. Read and edit workspace content through `mcp__movscript_workspace__workspace_file_read` / `mcp__movscript_workspace__workspace_file_write`; use `core_file_*` only for non-workspace file refs explicitly provided by the runtime.
4. Keep review/apply as a UI handoff. Do not call backend entity mutation tools directly from the Agent.
5. Use `mcp__movscript_workspace__workspace_review_apply_preview` or `mcp__movscript_workspace__workspace_review_apply` only when the UI review flow has already approved the staged workspace review.

## Workspace Kinds

- `project_standards_workspace`: project-wide visual, style, pacing, prompt, and quality rules.
- `setting_workspace`: project creative references such as characters, places, or setting entities.
- `production_workspace`: production-level segments and scene moments.
- `content_unit_workspace`: content-unit slices and their scene moments.
- `asset_workspace`: asset slots and generation requirements.

## Rules

- Keep workspace content as JSON. Do not embed binary media or large resource payloads.
- Preserve existing backend ids when they are present. Use stable `client_id` values for new rows.
- Use the model contract field guide and apply boundary to decide which fields may be edited.
- Treat apply as a frontend/UI boundary where staged workspace edits become durable project changes.
- Do not bypass workspace tools by editing backend entities directly when a workspace schema exists for the change.

## Tool Notes

- `mcp__movscript_workspace__get_workspace_model` returns the WorkspaceModel contract, field guide, apply boundary, and optional hydrated initial content.
- `mcp__movscript_workspace__workspace_file_list`, `mcp__movscript_workspace__workspace_file_read`, `mcp__movscript_workspace__workspace_file_write`, and `mcp__movscript_workspace__workspace_file_delete` are served by the MovScript frontend MCP server and operate under the frontend-owned `.movscript` directory.
- `mcp__movscript_workspace__workspace_review_apply_preview` previews approved review effects; `mcp__movscript_workspace__workspace_review_apply` commits only through the approved review boundary.
