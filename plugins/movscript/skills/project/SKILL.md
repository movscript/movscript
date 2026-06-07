---
name: project
description: Use MovScript MCP tools and project workspace files for current project focus, project creation, and local project/script context.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_project_create
  - mcp__movscript__domain_get_model
---

# Project And Script Context

Use this skill when a user asks the provider to inspect the current MovScript project, create a project, or work with project/script context.

## Workflow

1. Call `system_focus_get` when the request depends on the currently selected project, route, production, user, or entity.
2. Read project and script context from the project Git workspace. Business source files live under `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`; current built state and indexes live under `.build/`.
3. Use `domain_get_model` before editing a domain entity so paths and instructions come from the domain workspace model.
4. Call `system_project_create` only when the user explicitly asks to create a new project or confirms the project name.

## Rules

- Treat project creation as a durable backend write.
- Do not create projects from vague brainstorming prompts.
- Prefer project workspace domain files and `domain_*` APIs over backend list/locate tools for project data, scripts, settings, assets, and productions.
- Preserve script file identity in follow-up work; do not mix passages from different files unless the user asks for comparison.
