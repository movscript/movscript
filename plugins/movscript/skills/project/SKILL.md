---
name: project
description: Resolve MovScript project focus, create projects only on explicit request, and orient agents to source versus compiled project state.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_project_create
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_read_script_source
---

# Project And Script Context

Use this skill when a user asks the provider to inspect the current MovScript project, create a project, or work with project/script context.

## Concepts

- The selected project workspace is a project Git repository.
- MCP project-scoped tools do not infer project from the provider session. Every project-scoped domain or generation call must include `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Editable source files live under `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`.
- `.build/current` and `.build/indexes` are the last successful compiled state.
- Project creation is a durable backend action. Do not create a project from vague planning or naming ideas.

## Workflow

1. Call `system_focus_get` when the request depends on the currently selected project, route, production, user, or entity.
2. Use `domain_overview` or `domain_query_entities` to understand project state before reading many files.
3. Read script source with `domain_read_script_source` when available; otherwise read the source path returned by `domain_get_model`.
4. Use `domain_get_model` before editing a domain entity so paths and instructions come from MovScript.
5. Call `system_project_create` only when the user explicitly asks to create a new project or confirms the project name.

## Rules

- Treat project creation as a durable backend write.
- Do not use user or organization identity to choose the project workspace. Always pass the intended `projectId` to project-scoped tools.
- Do not create projects from vague brainstorming prompts.
- Prefer project workspace domain files and `domain_*` APIs over backend list/locate tools for project data, scripts, settings, assets, and productions.
- Preserve script file identity in follow-up work; do not mix passages from different files unless the user asks for comparison.
- Do not edit `.build/**` or `.movscript/**` when the user is asking about creative project content.
