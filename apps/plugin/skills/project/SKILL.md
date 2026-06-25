---
name: project
description: Resolve MovScript project focus through Project Service/runtime status, create projects only on explicit request, and orient agents to source, backend decisions, and debug artifacts.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_project_create
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_read_script_source
---

# Project And Script Context

Use this skill when a user asks the provider to inspect the current MovScript project, create a project, or work with project/script context. If runtime ownership or service availability is unclear, use the `runtime` skill first.

## Concepts

- The selected project workspace is a project Git repository.
- Project Service is the authoritative project/source/read-model entrypoint. If project/domain tools report a missing Project Service or runtime endpoint, call `movscript_runtime_status` and explain whether local daemon, cloud/external data plane, or explicit service configuration is missing.
- When a project, status, resource, prompt, candidate, impact, or timeline MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it for the next action.
- Describe the page's purpose, such as checking project readiness, inspecting resources, editing prompts, reviewing candidates, or resolving stale impact. Do not treat a returned URL as a completed decision.
- If secondary surfaces are returned, lead with the primary `surface.url` and mention secondary URLs only when useful. Use URLs exactly as returned.
- MCP project-scoped tools do not infer project from the provider session. Every project-scoped domain or generation call must include `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Editable source files live under `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`.
- Product state lives in source files and backend decision metadata surfaced by domain APIs. `.interpret/**` is interpreter debug output only and is not a source of truth.
- Project creation is a durable Project Service/Data Service action. Do not create a project from vague planning or naming ideas.

## Workflow

1. Call `system_focus_get` when the request depends on the currently selected project, route, production, user, or entity.
2. If focus is missing or tools report runtime/service errors, call `movscript_runtime_status` before guessing paths or asking the user to start Desktop.
3. Use `domain_overview` or `domain_query_entities` to understand project state before reading many files.
4. Read script source with `domain_read_script_source` when available; otherwise read the source path returned by `domain_get_model`.
5. Use `domain_get_model` before editing a domain entity so paths and instructions come from MovScript.
6. Call `system_project_create` only when the user explicitly asks to create a new project or confirms the project name.

## Rules

- Treat project creation as a durable Project Service/Data Service write.
- Do not use user or organization identity to choose the project workspace. Always pass the intended `projectId` to project-scoped tools.
- Do not create projects from vague brainstorming prompts.
- Prefer project workspace domain files and `domain_*` APIs over backend list/locate tools for project data, scripts, settings, assets, and productions.
- Preserve script file identity in follow-up work; do not mix passages from different files unless the user asks for comparison.
- Do not read or edit `.interpret/**` or `.movscript/**` when the user is asking about creative project content.
