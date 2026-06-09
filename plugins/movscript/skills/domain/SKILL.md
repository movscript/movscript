---
name: domain
description: Understand MovScript domain concepts, choose the right MCP tool, edit source through APIs first and source files only as a controlled fallback, then inspect and compile.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_build_content_unit_artifact
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_input_version
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_snapshot_script_version
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_update_content_unit_prompt
  - mcp__movscript__domain_update_entity_transition
  - mcp__movscript__domain_update_storyboard_timeline
  - mcp__movscript__domain_update_storyboard_shot_plans
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_create_asset_slot_candidate
  - mcp__movscript__domain_create_keyframe_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_delete_entity
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_compile
  - mcp__movscript__domain_regeneration_plan
---

# Domain Workspace

Use this skill when a user asks to inspect, change, compile, or reason about MovScript project domain entities.

MovScript domain includes object meaning, storage layout, compiler state, and write APIs. `movscript-lang` owns the language semantics through `@movscript/language`, `@movscript/workspace`, `@movscript/compiler`, and `@movscript/engine`. MovScript core exposes those semantics through MCP tools.

## Core Concepts

- MCP does not infer project from session, cwd, route, or focus. Every project-scoped domain call must include the intended `projectId`/`project_id`.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- `source`: Editable creative source. It may be incomplete while the user or agent is editing.
- `.build/current`: Last successful compiled state. UI display should prefer this stable state.
- `.build/indexes` and `.build/manifests`: Compiler outputs. Do not edit them directly.
- `domain_inspect` and `domain_review`: Diagnostics only. They do not make edits effective.
- `domain_compile`: Validates source and writes the stable compiled state. `domain_build` is only a compatibility alias.
- `domain_regeneration_plan`: Reports downstream targets that should be regenerated after source changes.

## Domain Graph

```text
project
  -> project_standards
  -> setting -> setting_state -> asset
  -> script -> script_version -> script_block
  -> production -> segment -> scene_moment
  -> storyboard -> expression_unit
  -> content_unit -> candidate / selection
```

Content units are project-level production slots. They can reference production context, storyboards, settings, resources, and generated candidates, but path containment does not imply semantic ownership.

## Tool Map

- Focus and overview: `system_focus_get`, `domain_overview`.
- Model discovery: `domain_get_model`.
- Query/read: `domain_query_entities`, `domain_query_settings`, `domain_query_assets`, `domain_query_production_context`, `domain_read_*`.
- Structured writes: `domain_upsert_*`, `domain_update_*`, `domain_delete_entity`.
- Candidate writes: `domain_append_candidate`, `domain_create_*_candidate`, `domain_select_*candidate`, `domain_update_candidate`, `domain_unlock_candidate`.
- Compiler steps: `domain_inspect`, `domain_review`, `domain_compile`, `domain_regeneration_plan`.

## Edit Workflow

1. Call `system_focus_get` when the request depends on the selected project, production, or entity.
2. Query existing context with `domain_query_*` or read built outputs with `domain_read_*`.
3. Call `domain_get_model` before changing a domain entity so editable paths, schema ids, and instructions come from MovScript.
4. Prefer structured `domain_*` write APIs when they cover the requested operation.
5. Directly edit source files only when no structured API covers the field or structure.
6. Run `domain_inspect` or `domain_review` after any API write or file edit.
7. Fix diagnostics and re-run inspect/review until the source is ready.
8. Run `domain_compile` after the source is ready. Build success makes the edit visible through `.build/current` and indexes.
9. Run `domain_regeneration_plan` when the change can stale generated content, prompts, media, or selections.

## Editable Source

Direct file edits are allowed only under source paths returned by `domain_get_model` or under known source roots:

- `project.json`
- `project_standards.json`
- `settings/**`
- `scripts/**`
- `content_units/**`
- `productions/**`

Do not directly edit:

- `.build/**`
- `.movscript/**` runtime, provider, session, cache, or local config files unless the user explicitly asks for configuration work.
- Resource binaries, backend database state, or generation job runtime records.

## Rules

- APIs first, source files second. Direct file editing is a controlled fallback, not the default write path.
- Always pass `projectId` to project-scoped tools, and never use user or organization identity as a project routing shortcut.
- For `domain_upsert_setting` and `domain_upsert_asset`, put the data to write under `payload`; `record` and `entity` are existing-context objects, not the write body.
- If a direct edit is needed, call `domain_get_model` first and edit only the returned source scope.
- After completing any user request that changes domain source, run `domain_compile`.
- Do not store resource binaries, external provider URLs, or generation job runtime state in domain JSON.
- Use stable ids and MovScript `resource_id` references for generated or uploaded media.
- Preserve user-facing review boundaries. Generated or edited data is not stable product state until compile succeeds.
