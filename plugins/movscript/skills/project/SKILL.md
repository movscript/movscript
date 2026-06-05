---
name: project
description: Use MovScript MCP tools for current project focus, project listing/creation, and locating screenplay passages across script-version files.
toolGrants:
  - mcp__movscript_workspace__get_focus_context
  - mcp__movscript_workspace__movscript_focus_get
  - mcp__movscript_workspace__movscript_project_list
  - mcp__movscript_workspace__movscript_project_create
  - mcp__movscript_workspace__movscript_script_list
  - mcp__movscript_workspace__movscript_script_locate
---

# Project And Script Context

Use this skill when a user asks Codex to inspect MovScript projects, create a project, find the current project focus, list scripts, or locate screenplay/script passages.

## Workflow

1. Call `mcp__movscript_workspace__movscript_focus_get` when the request depends on the currently selected project, route, production, user, or entity.
2. Call `mcp__movscript_workspace__movscript_project_list` before assuming a project exists or when the user asks what projects are visible.
3. Call `mcp__movscript_workspace__movscript_project_create` only when the user explicitly asks to create a new project or confirms the project name.
4. Call `mcp__movscript_workspace__movscript_script_list` when you need available script titles, script IDs, scriptVersion IDs, statuses, or readonly refs before choosing a script.
5. Call `mcp__movscript_workspace__movscript_script_locate` for fuzzy screenplay lookup. Prefer `projectId`, `scriptVersionId`, `scriptId`, or `scriptTitle` when the user provides them; otherwise rely on current focus.
6. Use returned readonly file refs and line ranges for follow-up reads or edits. Do not read whole scripts unless the user explicitly needs full text.

## Rules

- Treat project creation as a durable backend write.
- Do not create projects from vague brainstorming prompts.
- Treat `movscript_script_list` as a directory/listing tool; keep `include_content` false unless the user explicitly needs previews.
- For script searches, pass precise `must`, `should`, `exclude`, and `aliasGroups` terms when the user mentions characters, props, places, or alternate names.
- Preserve script version identity in follow-up work; do not mix passages from different versions unless the user asks for comparison.
