---
name: project
description: Use MovScript MCP tools and workspace files for current project focus, project creation, and local project/script context.
toolGrants:
  - mcp__movscript_workspace__movscript_focus_get
  - mcp__movscript_workspace__movscript_project_create
  - mcp__movscript_workspace__workspace_fetch
---

# Project And Script Context

Use this skill when a user asks the provider to inspect the current MovScript project, create a project, or work with project/script context.

## Workflow

1. Call `mcp__movscript_workspace__movscript_focus_get` when the request depends on the currently selected project, route, production, user, or entity.
2. Use `mcp__movscript_workspace__workspace_fetch` for the current project namespace, such as `movscript.project:123`, to obtain the synchronization handoff; use standard git fetch/pull before relying on local project files when they may be stale or missing.
3. Read project and script context from local workspace files under `.movscript/data/users/{userId}/projects/{projectId}`. Use local file search for screenplay passages.
4. Call `mcp__movscript_workspace__movscript_project_create` only when the user explicitly asks to create a new project or confirms the project name.

## Rules

- Treat project creation as a durable backend write.
- Do not create projects from vague brainstorming prompts.
- Prefer local workspace files over backend list/locate tools for project data, scripts, references, assets, and future project-owned data groups.
- Preserve script file identity in follow-up work; do not mix passages from different files unless the user asks for comparison.
