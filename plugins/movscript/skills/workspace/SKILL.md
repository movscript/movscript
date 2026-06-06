---
name: workspace
description: Inspect, review, and build MovScript project workspaces using the Git canonical edit/build ontology.
toolGrants:
  - mcp__movscript_workspace__movscript_workspace_get_model
  - mcp__movscript_workspace__movscript_workspace_review
  - mcp__movscript_workspace__movscript_workspace_build
---

# Workspace

Use this skill when a user asks to inspect, edit, review, or build MovScript workspace files.

In MovScript, the project Git repository is the project workspace. Editable business files live under `edit/`. Built current state, indexes, reviews, and manifests live under `.build/`. Agent and UI edits must target `edit/`; only MovScript build writes `.build/`.

## Workflow

1. Use `mcp__movscript_workspace__movscript_workspace_get_model` with the target `entityType` and optional `entityId` to get editable paths, context paths, schema ids, and editing instructions.
2. Edit only the returned `edit/` paths unless the user explicitly asks to create related entities.
3. Use `mcp__movscript_workspace__movscript_workspace_review` to compare `.build/current` with `edit/`.
4. Fix schema, domain, or reference issues reported by review.
5. Use `mcp__movscript_workspace__movscript_workspace_build` after review is ready. Build success makes the edit state current.

## Rules

- Do not use workspace namespaces.
- Do not create projection, sync, materialize, submit, or semantic apply payloads.
- Do not edit `.build/` directly.
- Do not embed resource binaries or generation job runtime state in business files.
- Reference stable ids such as `setting` ids and `resource_id` values.
- Treat Git commit/push as persistence after a successful build, not as workspace semantics.

## Tool Notes

- `movscript_workspace_get_model` returns the domain workspace model for one editable entity.
- `movscript_workspace_review` reports changed files, changed entities, issues, and build readiness.
- `movscript_workspace_build` validates `edit/` and writes `.build/current`, `.build/indexes`, and `.build/manifests`.
