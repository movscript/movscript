---
name: workspace
description: Inspect, review, and build MovScript project workspaces using the Git canonical edit/build ontology.
toolGrants:
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_review
  - mcp__movscript__domain_build
---

# Workspace

Compatibility skill. Prefer the `domain` skill for new MovScript domain editing work.

In MovScript, the project Git repository is the project workspace. Editable business files live under source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Built current state, indexes, reviews, and manifests live under `.build/`. Agent and UI edits must target source files; only MovScript build writes `.build/`.

## Workflow

1. Use `domain_get_model` with the target `entityKind` and optional `entityId` to get editable paths, context paths, schema ids, and editing instructions.
2. Edit only source paths in the returned domain model unless the user explicitly asks to create related entities.
3. Use `domain_review` to compare `.build/current` with source.
4. Fix schema, domain, or reference issues reported by review.
5. Use `domain_build` after review is ready. Build success makes the edit state current and visible to the user.

## Rules

- Do not use workspace namespaces.
- Do not create legacy sync, materialize, submit, or semantic apply payloads.
- Do not edit `.build/` directly.
- Do not embed resource binaries or generation job runtime state in business files.
- Reference stable ids such as `setting` ids and `resource_id` values.
- Treat Git commit/push as persistence after a successful build, not as workspace semantics.

## Tool Notes

- `domain_get_model` returns the domain workspace model for one editable entity.
- `domain_review` reports changed files, changed entities, issues, and build readiness.
- `domain_build` validates source and writes `.build/current`, `.build/indexes`, and `.build/manifests`.
