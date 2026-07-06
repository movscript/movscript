---
name: workspace
description: Compatibility guidance for older workspace prompts; prefer domain concepts, domain_inspect diagnostics, and domain_interpret read-model refresh.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Workspace

Compatibility skill. Prefer the `domain` skill for new MovScript domain editing work. If project locator, initialization, open/fetch state, or service availability is unclear, use the `project` skill's Project Management Gate before workspace/domain calls. If runtime ownership or service availability is unclear, use the `runtime` skill first.

Open `../domain/references/user-facing-response.md` before ordinary workspace/source summaries or blockers, and translate legacy workspace terms into project status, saved material, missing choices, or next production actions. Do not describe ordinary MovScript projects as code repositories, file trees, or source folders unless the user asks for debugging.

Tool-facing only: the project workspace may be backed by a Git repository. Editable business files live under source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. `scripts/**` is the durable screenplay and project story memory for important story intent, scene order, dialogue, narration, and continuity. Product state is source plus backend candidate/decision metadata exposed through domain APIs. `.interpret/**` is interpreter debug output only. Agent and UI edits must target source files or structured domain APIs. In ordinary replies, translate this to: story, references, 制作内容, saved prompts, generated results, chosen versions, and editing readiness.

Project/source tools now depend on runtime-discovered Project Service and Data Service capabilities. If a legacy workspace task fails because a service endpoint is missing, call `movscript_runtime_status`, classify local daemon, cloud/external data plane, or basic/diagnostic mode, and report the missing runtime mode or service instead of assuming Desktop is required.

## Production Contract

- Production step: compatibility source inspection/review; prefer `domain` for new project content changes.
- Systems/config: Project Service/Data Service own source/read models and backend decisions; runtime/daemon supplies endpoints; `.interpret/**` is diagnostic output only.
- Blockers: missing project locator, unresolved project initialization/open state, unavailable Project/Data service, schema/reference issues, or user request that should use domain/planning/generation/timeline instead.
- Human review: do not treat `domain_interpret` as publish/approval/commit; require explicit user intent for source writes or candidate/selection decisions.
- Output: report source model/path, inspect issues, interpret readiness, affected outputs, blockers, and the preferred modern domain tool next step.

## Workflow

1. Resolve the intended project from explicit user input, a passed `projectDir`/`project_dir`/`cwd`, or a Project Service locator. Do not infer it from UI focus. If project initialization, open/fetch state, or Project Service context is unclear, run the `project` skill's Project Management Gate before workspace/domain calls.
2. Use `domain_overview` to orient on current source, backend decisions, and diagnostics.
3. When an older workspace prompt is unclear about story, continuity, scene beat, dialogue, or narration, read script source before guessing and prefer switching to the `domain` or `planning` skill for modern source changes.
4. Use `domain_get_model` with the target `entityKind` and optional `entityId` before editing.
5. Prefer structured domain APIs. Edit files only when no API covers the needed source structure.
6. Edit only source paths in the returned domain model unless the user explicitly asks to create related entities.
7. Use `domain_inspect` to diagnose current source changes and readiness.
8. Fix schema, domain, or reference issues reported by diagnostics.
9. Use `domain_interpret` after diagnostics are ready. Interpret validates source and refreshes derived diagnostic artifacts when enabled; it does not publish, approve, commit, or checkpoint user intent.
10. Use `domain_regeneration_plan` when source changes may stale generated media or candidates.

## Rules

- Do not use workspace namespaces.
- MCP does not infer project from session, cwd, route, or focus. Every project-scoped workspace/domain call must include the intended `projectDir`/`project_dir` or `cwd`; include `projectUid`/`project_uid` when backend decision metadata is involved.
- Use the `project` skill's Project Management Gate before workspace/domain calls when the locator, initialization, open/fetch state, or Project Service context is unclear. Use project init/create only when the user explicitly asks or confirms.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Do not create legacy sync, materialize, submit, or semantic apply payloads.
- Do not read or edit `.interpret/` for normal product work; it is debug output.
- Do not use `.interpret/`, UI focus, recent chat fragments, or generated artifacts as a substitute for reading script source when the missing context is story or continuity.
- Do not embed resource binaries or generation tool runtime state in business files.
- Reference stable ids such as `setting` ids and `resource_id` values.
- Treat Git commit/push as separate persistence, not as interpret semantics.

## Tool Notes

- `domain_get_model` returns the domain workspace model for one editable entity.
- `domain_inspect` reports changed files, changed entities, issues, and interpret readiness. `domain_review` is a compatibility diagnostic alias.
- `domain_interpret` validates source and may refresh `.interpret/**` debug artifacts. `.interpret/` is not a workflow contract.
