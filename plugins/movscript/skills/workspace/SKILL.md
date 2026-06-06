---
name: workspace
description: Inspect MovScript workspace namespaces and use Git canonical workflows for synchronization.
toolGrants:
  - mcp__movscript_workspace__workspace_fetch
  - mcp__movscript_workspace__workspace_status
  - mcp__movscript_workspace__workspace_review
  - mcp__movscript_workspace__workspace_submit
---

# Workspace

Use this skill when a user asks to inspect, review, or synchronize a MovScript workspace namespace.

In MovScript agent workflows, a workspace namespace is a project-level working repository, for example `movscript.project:123`. The namespace contains local business files under `.movscript/data`, including `project.json`, project workspace JSON files, scripts, production projections, and future business object groups. The agent should operate on the namespace boundary; direct backend projection fetch/submit is legacy compatibility only.

## Workflow

1. Use `mcp__movscript_workspace__workspace_fetch` with `namespace`, such as `movscript.project:123`, to obtain the MCP handoff, then use standard git fetch/pull for actual synchronization. Omit `namespace` only when the current focus clearly identifies the project.
2. Use `mcp__movscript_workspace__workspace_status` with the same `namespace` to obtain the MCP handoff, then use standard git status/diff to inspect local changes.
3. Edit local projection files under `.movscript/data` when local file editing is available.
4. Use `mcp__movscript_workspace__workspace_review` with the same `namespace` to obtain the review handoff, then inspect git diff/review artifacts. This does not write backend state.
5. Use `mcp__movscript_workspace__workspace_submit` only when the user explicitly asks to submit, apply, sync, or write local drafts back to the project; perform the actual write through standard git commit/push.

## Namespaces

- Project namespace example: `movscript.project:123`.
- The project namespace maps internally to `data/users/{userId}/projects/{projectId}`.
- A project namespace owns all project projection families, not just one data type.
- Do not invent sub-namespaces for references, assets, scripts, or future business object groups. Additions belong inside the project namespace unless MovScript defines another repository boundary.

## Rules

- Keep projection files as JSON or documented text projections. Do not embed binary media or large resource payloads.
- Preserve backend ids when present. Use stable `client_id` values for new rows.
- Always run `workspace_review` before `workspace_submit`.
- Treat `workspace_fetch` as a synchronization handoff. Do not discard local drafts unless the user explicitly requests the corresponding git operation.
- Treat `data/users/{userId}/projects.index.json` as a read-only index. Refresh and preview it, but do not apply it back to the backend.
- Do not edit projection meta, sync records, review records, provider configs, or provider runtime homes as part of normal workspace changes.
- Do not bypass workspace tools by writing backend entities directly when a workspace namespace exists for the change.

## Tool Notes

- `mcp__movscript_workspace__workspace_fetch` returns the synchronization handoff for the namespace.
- `mcp__movscript_workspace__workspace_status` returns the status handoff for the namespace without writing backend state.
- `mcp__movscript_workspace__workspace_review` returns the review handoff without writing backend state.
- `mcp__movscript_workspace__workspace_submit` returns the submit handoff; actual submission is standard git commit/push after explicit user intent.
