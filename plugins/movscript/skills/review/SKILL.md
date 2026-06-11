---
name: review
description: Explain MovScript pending source changes, interpret status, content unit dependency artifacts, stale selections, and regeneration plans without automatically editing source or regenerating media.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_derive_content_unit_artifact
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_input_version
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Review

Use this skill when a user asks what changed, whether the project is ready, what is stale, why a content unit changed, or which downstream outputs need attention.

## Rules

- Start with `domain_overview` for interpret status and next actions.
- Use `domain_inspect` for current source changes. Use `domain_review` when the user explicitly asks for review or an older workflow expects that name.
- `domain_inspect` and `domain_review` are diagnostic only. They report pending files/entities/business changes, issues, and interpret readiness; they do not make source current.
- Full affected content unit review is post-interpret. Use `domain_regeneration_plan` after interpret to explain changed entities, affected content units, prompt bundles, preview timelines, and stale selections.
- Affected does not mean regenerate. Affected means review the downstream target and choose keep, relink, re-prompt, regenerate, re-shoot, deprecate, or accept stale.
- Do not modify source, select candidates, or regenerate media during review unless the user explicitly asks for that follow-up.
- When reviewing production readiness, classify the focused scene_moment or shot as `缺规划`, `可补图`, or `可生成`, and bind the recommendation to the user's goal.

## Workflow

1. Resolve focus with `system_focus_get` when the selected project, production, content unit, or entity matters.
2. Call `domain_overview`.
3. If source has pending edits, call `domain_inspect` or `domain_review` and explain changed files, changed entities, business changes, blocking issues, and `readyToInterpret`.
4. If the user asks to make current state stable and inspect/review has no blocking errors, interpret only after confirming the review step is now an editing/checkpoint step.
5. If explaining generated output readiness or staleness, read content unit artifacts in this order: dependency report, input version, selection validity, runtime panel.
6. After interpret, call `domain_regeneration_plan` when downstream content may need review.
7. Open `references/affected-vs-regenerate.md` when explaining stale or affected outputs.

## Output

Summaries should say:

- What source changed since the last successful interpret.
- Whether inspect/review found blocking issues.
- Whether interpreted current state is missing, current, or stale.
- Which content units or selections are affected or stale, and what decision options exist.
- The focused scene_moment/shot readiness when the user is deciding whether to keep planning, supplement keyframes/storyboards, generate, or review generated candidates.

Do not say "must regenerate" unless artifacts or an explicit user/workflow policy says regeneration is mandatory.
