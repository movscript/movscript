---
name: workspace
description: Compatibility guidance for older workspace prompts; prefer domain concepts, domain_inspect diagnostics, and domain_interpret read-model refresh.
toolGrants:
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Workspace

Compatibility skill. Prefer the `domain` skill for new MovScript domain editing work.

In MovScript, the project Git repository is the project workspace. Editable business files live under source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Product state is source plus backend candidate/decision metadata exposed through domain APIs. `.interpret/**` is interpreter debug output only. Agent and UI edits must target source files or structured domain APIs.

## Workflow

1. Use `domain_overview` to orient on current source, backend decisions, and diagnostics.
2. Use `domain_get_model` with the target `entityKind` and optional `entityId` before editing.
3. Prefer structured domain APIs. Edit files only when no API covers the needed source structure.
4. Edit only source paths in the returned domain model unless the user explicitly asks to create related entities.
5. Use `domain_inspect` to diagnose current source changes and readiness.
6. Fix schema, domain, or reference issues reported by diagnostics.
7. Use `domain_interpret` after diagnostics are ready. Interpret validates source and refreshes derived diagnostic artifacts when enabled; it does not publish, approve, commit, or checkpoint user intent.
8. Use `domain_regeneration_plan` when source changes may stale generated media or candidates.

## Rules

- Do not use workspace namespaces.
- MCP does not infer project from session, cwd, route, or focus. Every project-scoped workspace/domain call must include the intended `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Do not create legacy sync, materialize, submit, or semantic apply payloads.
- Do not read or edit `.interpret/` for normal product work; it is debug output.
- Do not embed resource binaries or generation job runtime state in business files.
- Reference stable ids such as `setting` ids and `resource_id` values.
- Treat Git commit/push as separate persistence, not as interpret semantics.

## Tool Notes

- `domain_get_model` returns the domain workspace model for one editable entity.
- `domain_inspect` reports changed files, changed entities, issues, and interpret readiness. `domain_review` is a compatibility diagnostic alias.
- `domain_interpret` validates source and may refresh `.interpret/**` debug artifacts. `.interpret/` is not a workflow contract.
