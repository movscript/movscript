---
name: project
description: Resolve MovScript project focus through Project Service/runtime status, create projects only on explicit request, and orient agents to source, script/story context, backend decisions, and debug artifacts.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__context_current_get
  - mcp__movscript__system_project_create
  - mcp__movscript__system_project_init
  - mcp__movscript__system_project_open
  - mcp__movscript__system_project_fetch
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_read_script_source
---

# Project And Script Context

Use this skill when a user asks the provider to inspect the current MovScript project, create a project, or work with project/script context. If runtime ownership or service availability is unclear, use the `runtime` skill first.

## Production Contract

- Production step: project initialization, project context resolution, and script/source orientation before planning, generation, editing, or review.
- Systems/config: Project Service/Data Service own durable projects, source, read models, and context; runtime/daemon owns endpoint readiness; UI context is only a hint.
- Blockers: missing explicit project locator, Project Service unavailable, ambiguous current UI context, or vague project creation intent.
- Human review: create a project only after explicit user request/confirmation; do not use UI focus as implicit permission for project-scoped writes.
- Output: report resolved project id/path/title, source/read-model entrypoints, surface URL when available, blockers, and next planning/review action.
- CLI-only contract: use `bin/movscript project create/init/open/fetch --json` for no-frontend project bootstrap; MCP `system_project_create/init/open/fetch` uses the same shared command runner.

## Concepts

- The selected project workspace is a project Git repository.
- Project Service is the authoritative project/source/read-model entrypoint. If project/domain tools report a missing Project Service or runtime endpoint, call `movscript_runtime_status` and explain whether local daemon, cloud/external data plane, or explicit service configuration is missing.
- When a project, status, resource, prompt, candidate, impact, or timeline MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it for the next action.
- Describe the page's purpose, such as checking project readiness, inspecting resources, editing prompts, reviewing candidates, or resolving stale impact. Do not treat a returned URL as a completed decision.
- If secondary surfaces are returned, lead with the primary `surface.url` and mention secondary URLs only when useful. Use URLs exactly as returned.
- MCP project-scoped tools do not infer project from the provider session. Every project-scoped domain or generation call must include `projectDir`/`project_dir` or `cwd`; include `projectUid`/`project_uid` when writing scoped backend candidate or decision metadata.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Editable source files live under `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`.
- `scripts/**` stores the durable screenplay and project story memory. Use it to orient story, character, continuity, scene order, dialogue, and narration before downstream planning or execution.
- Product state lives in source files and backend decision metadata surfaced by domain APIs. `.interpret/**` is interpreter debug output only and is not a source of truth.
- Project creation is a durable Project Service/Data Service action. Do not create a project from vague planning or naming ideas.
- `context_current_get` is only a UI/session hint for route, selected project, production, user, and selection. It can help orient the user, but project-scoped writes must still pass an explicit project locator.

## Workflow

1. Resolve the intended source workspace from explicit user input, a passed `projectDir`/`project_dir`/`cwd`, a Project Service locator, or `context_current_get` when the user explicitly asks about the current UI context. Do not use UI context as an implicit write target.
2. If the project locator is missing or tools report runtime/service errors, call `movscript_runtime_status` before guessing paths or asking the user to start Desktop.
3. Use `domain_overview` or `domain_query_entities` to understand project state before reading many files.
4. When the next task depends on story, continuity, character, beat, dialogue, or narration context, read script source with `domain_read_script_source` before guessing or asking for details the project may already store. Otherwise read the source path returned by `domain_get_model` when needed.
5. Use `domain_get_model` before editing a domain entity so paths and instructions come from MovScript.
6. Use `system_project_create/init/open/fetch` only for explicit project bootstrap/open actions. In CLI-only workflows, prefer the canonical `bin/movscript project create/init/open/fetch --json` surface for debugging the same contract.

## Rules

- Treat project creation as a durable Project Service/Data Service write.
- Do not use user or organization identity to choose the project workspace. Always pass the intended `projectDir`/`cwd` to project-scoped source tools.
- Do not create projects from vague brainstorming prompts.
- Prefer project workspace domain files and `domain_*` APIs over backend list/locate tools for project data, scripts, settings, assets, and productions.
- Preserve script file identity in follow-up work; do not mix passages from different files unless the user asks for comparison.
- If a follow-up task is unclear after project resolution, inspect the relevant script before relying on UI focus, recent chat fragments, or generated artifacts.
- Do not read or edit `.interpret/**` or `.movscript/**` when the user is asking about creative project content.
