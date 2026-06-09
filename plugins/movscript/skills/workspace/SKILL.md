---
name: workspace
description: Compatibility guidance for older workspace prompts; prefer domain concepts, inspect/review diagnostics, and compile for effective state.
toolGrants:
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_compile
  - mcp__movscript__domain_regeneration_plan
---

# Workspace

Compatibility skill. Prefer the `domain` skill for new MovScript domain editing work.

In MovScript, the project Git repository is the project workspace. Editable business files live under source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Built current state, indexes, reviews, and manifests live under `.build/`. Agent and UI edits must target source files; only MovScript compile writes `.build/`.

## Workflow

1. Use `domain_overview` to orient on current source and compiled state.
2. Use `domain_get_model` with the target `entityKind` and optional `entityId` before editing.
3. Prefer structured domain APIs. Edit files only when no API covers the needed source structure.
4. Edit only source paths in the returned domain model unless the user explicitly asks to create related entities.
5. Use `domain_inspect` or `domain_review` to diagnose source versus `.build/current`.
6. Fix schema, domain, or reference issues reported by diagnostics.
7. Use `domain_compile` after diagnostics are ready. Compile success makes the edit state current and visible to the user.
8. Use `domain_regeneration_plan` when source changes may stale generated media or candidates.

## Rules

- Do not use workspace namespaces.
- MCP does not infer project from session, cwd, route, or focus. Every project-scoped workspace/domain call must include the intended `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Do not create legacy sync, materialize, submit, or semantic apply payloads.
- Do not edit `.build/` directly.
- Do not embed resource binaries or generation job runtime state in business files.
- Reference stable ids such as `setting` ids and `resource_id` values.
- Treat Git commit/push as persistence after a successful build, not as workspace semantics.

## Tool Notes

- `domain_get_model` returns the domain workspace model for one editable entity.
- `domain_inspect` and `domain_review` report changed files, changed entities, issues, and compile readiness.
- `domain_compile` validates source and writes `.build/current`, `.build/indexes`, and `.build/manifests`.
- `domain_build` may exist as an older compatibility alias, but prefer `domain_compile`.
