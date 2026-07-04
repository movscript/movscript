---
name: review
description: Explain MovScript pending changes, readiness, affected content units, stale or missing selections, and regeneration decisions without automatically editing or generating.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_derive_content_unit_artifact
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_generation_prompt
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_regeneration_plan
---

# Review

Use this skill when a user asks what changed, whether the project is ready, what is stale, why a content unit changed, or which downstream outputs need attention. If runtime ownership or service availability is unclear, use the `runtime` skill first.

## Production Contract

- Production step: review gate across content planning, generation candidates, timeline readiness, and export impact.
- Systems/config: Project Service/Data Service expose source changes, diagnostics, candidate decisions, selection validity, and regeneration plans; runtime/daemon supplies service readiness.
- Blockers: missing project locator, diagnostic errors, stale/unselected upstream choices, missing content-unit artifacts, or unavailable Project/Data/Editing/Media services.
- Human review: do not select candidates, accept stale impact, regenerate, or edit source unless the user explicitly asks; browser URLs are review entrypoints, not completed approvals.
- Output: report changed source, blocking issues, readiness, stale/affected outputs, missing adoptions/selections, review URL, and concrete decision options.

## Rules

- Start with `domain_overview` for interpret status and next actions.
- When reviewing unclear story, continuity, scene-beat, dialogue, or script-derived impact, read the relevant script source before explaining readiness or downstream effects.
- If review tools fail because Project Service, Data Service, Editing Service, or Media Pipeline is missing, call `movscript_runtime_status`, classify the runtime owner/data plane, and explain the capability gap. Do not require Desktop or cloud when the local runtime daemon can satisfy the workflow.
- When a review, impact, candidate, preview timeline, prompt, or project-status result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it to complete the review action.
- Describe the page's job: inspect readiness, compare candidates, accept stale impact, edit/save the prompt, or inspect preview blockers. A returned URL does not mean the action is complete until the user uses the page or a matching domain decision is written.
- If secondary surfaces are returned, lead with the primary `surface.url` and include secondary URLs only when they clarify the next decision. Use URLs exactly as returned.
- Use `domain_inspect` for current source changes. Use `domain_review` only when the user explicitly asks for review or an older workflow expects that name.
- `domain_inspect` is the primary diagnostic entrypoint. `domain_review` is a compatibility diagnostic alias. They report pending files/entities/business changes, issues, and interpret readiness; they do not write interpreted artifacts.
- Full affected content unit review is post-interpret. Use `domain_regeneration_plan` after interpret to explain changed entities, affected content units, prompt bundles, preview timelines, and stale selections.
- Affected does not mean regenerate. Affected means review the downstream target and choose keep, relink, re-prompt, regenerate, re-shoot, deprecate, or accept stale.
- Missing upstream adoption/selection means downstream generation should stop until the user selects, confirms, or explicitly accepts an unstable draft path. `待定` and `放弃` candidates are still unresolved or rejected; they do not unblock stable downstream generation.
- Do not modify source, select candidates, or regenerate media during review unless the user explicitly asks for that follow-up.
- When reviewing generated candidates, distinguish the decision states: `采纳`/`adopt` is stable, `放弃`/`reject` is discarded, and `待定`/`defer` remains available but not stable.
- When reviewing generation readiness, classify the focused scene_moment, expression unit, or content unit as `缺规划`, `可补图`, `缺选择`, or `可生成`, and bind the recommendation to the user's goal.

## Workflow

1. Resolve the intended project and optional timeline namespace, production editing workspace, or content-unit target from explicit user input, a passed locator, or Project Service context. Do not infer it from UI focus.
2. Call `domain_overview`.
3. If the review depends on story, continuity, dialogue, or script-derived planning context, read the relevant script source before explaining the result.
4. If source has pending edits, call `domain_inspect` and explain changed files, changed entities, business changes, blocking issues, and `readyToInterpret`.
5. If the user asks to validate/refresh diagnostics and `domain_inspect` has no blocking errors, run `domain_interpret`; describe it as diagnostic/artifact refresh, not a publish, approval, commit, checkpoint, or product-state transition.
6. If explaining generated output readiness or staleness, read content unit artifacts in this order: dependency report, input version, selection validity, runtime panel.
7. After interpret, call `domain_regeneration_plan` when downstream content may need review.
8. Open `references/affected-vs-regenerate.md` when explaining stale or affected outputs.

## Output

Summaries should say:

- What source changed since the last successful interpret.
- Whether `domain_inspect` found blocking issues.
- Whether diagnostic/artifact context is missing, current, or stale.
- Which content units or selections are affected or stale, and what decision options exist.
- Which upstream adoptions/selections are missing before downstream generation can start, including candidates that are only deferred.
- The focused scene_moment/shot readiness when the user is deciding whether to keep planning, supplement keyframes/storyboards, generate, or review generated candidates.

Do not say "must regenerate" unless artifacts or an explicit user/workflow policy says regeneration is mandatory.
