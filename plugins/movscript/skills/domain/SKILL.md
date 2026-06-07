---
name: domain
description: Edit MovScript domain objects through structured APIs or source files, understand object meaning, storage layout, dependencies, review changes, and build so users can see the current effective project state.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_compile_content_generation_prompt
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_content_generation_prompt
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_snapshot_script_version
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_update_content_unit_prompt
  - mcp__movscript__domain_update_scene_moment_timing
  - mcp__movscript__domain_update_storyboard_shot_plans
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_delete_entity
  - mcp__movscript__domain_review
  - mcp__movscript__domain_build
---

# Domain Workspace

Use this skill when a user asks to inspect or edit MovScript project domain entities.

MovScript domain includes object meaning, storage layout, and APIs. The project workspace is the project Git repository. Source files include `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Do not edit `.build/**` directly.

## Workflow

1. Call `system_focus_get` when the request depends on the selected project, production, or entity.
2. Prefer structured `domain_*` APIs for supported operations.
3. If no API covers the edit, call `domain_get_model` for the target entity kind before editing files.
4. Read returned editable paths, context paths, schema ids, and instructions.
5. Edit only source files that belong to the returned domain model.
6. Run `domain_review` after API writes or file edits.
7. Fix review issues and re-run review until ready.
8. Run `domain_build` after review is ready. Build success makes the edit state visible to the user through `.build/current` and indexes.

## Entity Dependencies

```text
project -> project_standards
project -> setting -> setting_state -> asset
project -> script -> script_version -> script_block
project -> production -> segment -> scene_moment -> storyboard -> writing_expression
project -> production -> segment -> scene_moment -> keyframe
project -> content_unit -> keyframe
```

Content units are project-level production units and may reference scene moments or storyboards through `source_context`. Storyboards do not own content units. Assets are setting-owned resource slots and may reference system RawResource IDs.

## Storage

- Store source under `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`.
- Store order in JSON fields such as `order`, `storyboard_timing.items[].order`, and `shot_plans[].order`; directory ids are stable locators, not titles or order.
- Treat `.build/current/**`, `.build/indexes/**`, and `.build/manifests/**` as build output only.

## API Or Files

Use APIs for common operations: query entities, upsert settings/assets/scripts/content units, update timing or shot plans, compile content generation prompts, and manage candidates/locks. Use direct file edits only when an API does not cover the requested field or structure. Both paths must end with review and build when they change source.

## Rules

- Review is a check only; it does not make changes effective.
- Build validates source files and writes `.build/current`, `.build/indexes`, and `.build/manifests`.
- After completing any user request that changes domain source files, run `domain_build`.
- Do not store resource binaries, external provider URLs, or generation job runtime state in domain JSON.
- Use stable ids and `resource_id` references for generated or uploaded media.
