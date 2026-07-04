# MovScript Skill Workflow

MovScript skills guide agents through project-aware video production work. They are designed to keep creative state durable, inspectable, and reusable across Desktop, Agent Plugin, and CLI entrypoints.

## Workflow

1. Resolve the project and target scope from explicit user input or Project Service context.
2. Read the current project model before writing new structure.
3. Plan only the entities needed for the current goal.
4. Prefer structured domain tools over raw file edits.
5. Store generation intent and references in content units.
6. Register generated outputs as candidates, then select or review them through decision tools.
7. Use production editing workspaces for playable assembly and finishing.

## Skill Responsibilities

- `domain` skills manage project source entities and read models.
- `planning` skills decide the right project granularity and source structure.
- `generation` skills turn source context and references into model-ready prompts.
- `runtime` skills handle installation, distribution, and local runtime expectations.
- `review` and `editing` skills help evaluate candidates and move selected material into production workflows.

## Agent Rules

- Use explicit project locators instead of UI focus.
- Keep namespace nodes as structure, not generation targets.
- Keep candidates and selections outside source entity files.
- Preserve user vocabulary for timeline and setting namespaces.
- Prefer current MCP tools and CLI-backed source commands over ad hoc filesystem changes.
