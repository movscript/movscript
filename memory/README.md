# Maintainer Memory

This directory stores long-lived project context, design decisions, and implementation plans. It is not the public user manual.

Use `docs/` for published documentation that users, operators, plugin authors, and contributors should rely on. Use `memory/` for notes that explain why the project currently looks the way it does or how a future change should be approached.

## Files

| File | Purpose |
| --- | --- |
| [project_movscript.md](project_movscript.md) | Broad project context, implemented feature history, entity relationships, and architecture notes. |
| [storage_concepts.md](storage_concepts.md) | Internal resource storage, provider file spaces, public transfer storage, and worker rules. |
| [volcen_generation_params_plan.md](volcen_generation_params_plan.md) | Volcengine generation parameter design plan and phased implementation notes. |

## Maintenance Rules

- Add dates to time-sensitive notes.
- Mark proposals and plans clearly so they are not confused with shipped behavior.
- Move stable user-facing material into `docs/`.
- Keep implementation details linked to concrete files when possible.
- Remove or update stale notes before release if they contradict current code.
