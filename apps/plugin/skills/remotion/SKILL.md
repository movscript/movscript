---
name: remotion
description: Work inside an already opened MovScript Remotion production editing workspace. Use after production-editing hands off a remotion workspace.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__editing_export_import_resource
  - mcp__movscript__editing_export_create_candidate
---

# Remotion Workspace

Use this skill after `production-editing` opens a `remotion` workspace and returns `handoff.toSkill = "remotion"`.

This skill owns Remotion-specific project work: reading and editing the Remotion project files, running Studio, checking package/runtime readiness, rendering, and importing the result back as a RawResource.

Open `../domain/references/resource-discoverability.md` before importing rendered files or creating candidates so Remotion previews/exports have clear names, revision status, and source provenance.

Open `../domain/references/user-facing-response.md` before ordinary preview, render, import, or blocker replies so the user hears what changed, what was saved, and what choice remains.

## Workspace Files

Typical handoff context includes:

- `projectDirectory`: Remotion project directory.
- `manifestPath`: optional backend manifest path.
- `workspaceId` and `productionId`: provenance for imports and later candidate decisions.

Expected Remotion files include:

- `package.json`
- `src/Root.tsx`
- `src/rough-cut-props.json`
- asset map or backend manifest when present

## Workflow

1. Inspect `projectDirectory` and `package.json`.
2. If dependencies are missing, report the install command. Do not silently run package installs unless the user explicitly asks.
3. Open preview with the workspace preview command, usually `npx remotion studio`.
4. Edit Remotion source files only inside the workspace project directory.
5. Render only when the user asks, using the workspace render command.
6. Import the rendered file as RawResource by default when render succeeds, unless the user explicitly asks for local-only output or import is unavailable.
7. Create candidates only as a separate explicit decision.

## Rules

- Do not create or delete production workspaces from this skill.
- Do not use system editing timeline tools to mutate Remotion composition.
- Do not use removed legacy playback tools.
- Do not automatically adopt or select candidates after render.
- Agent skill installation is separate from npm dependency installation.

## Production Contract

- Production step: Edit, preview, diagnose, render, and import results for an already opened Remotion workspace.
- Systems/config: Requires Remotion project files, Node/npm or another package manager, Project Service workspace provenance, and Media Pipeline or Remotion CLI for rendering.
- Blockers: Missing Remotion project files, missing package dependencies, unavailable renderer runtime, missing handoff context, or failed render output.
- Human review: Users approve package installs, source edits, renders, imports, and any candidate creation/adoption/selection.
- Output: Updated Remotion workspace files, preview/render diagnostics, RawResource import when possible, and no automatic candidate decision.
