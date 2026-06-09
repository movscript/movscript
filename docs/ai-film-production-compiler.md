# AI Film Production Compiler

## Positioning

MovScript core should be treated as an AI film production compiler.

The main job of core is not to help the frontend save JSON files. Its job is to turn a user's editable creative source into a stable, inspectable, generatable, and publishable production state.

In AI film production, a source change can affect many downstream results. A character setting change can invalidate storyboards, prompts, keyframes, generated images, video shots, timeline previews, and final review state. This means the core domain layer must understand production dependencies, not just file paths.

The frontend should consume core results. It should not define the production semantics.

## Why This Is A Compiler

Traditional software compilation turns source code into executable artifacts.

MovScript compilation turns creative source into production artifacts and AI generation plans.

```text
Creative source
  -> Parse
  -> Schema validation
  -> Semantic validation
  -> Production graph
  -> Dependency graph
  -> Impact analysis
  -> Prompt and job planning
  -> AI generation execution, when requested
  -> Stable published view
```

The compiler comparison is useful, but MovScript is not a purely deterministic compiler. AI film production includes model output variance, async jobs, candidate selection, locked assets, retries, and human approval. The compiler should therefore produce traceable production state, not pretend every build deterministically creates final media.

## Core Principle

The core invariant is:

```text
Editing can be inconsistent.
Display must be stable.
Generation must be traceable.
Publishing must be explicit.
```

This gives the system three important states:

```text
source
  Current editable creative source. It may be incomplete or invalid.

.build/attempts
  Build or generation attempts. These store diagnostics, diffs, impact reports,
  partial plans, and failed execution details.

.build/current
  Last successful stable production state. Display views read from here by default.
```

A failed build must never overwrite `.build/current`.

## Two User Views

MovScript has two primary user-facing views.

### Editing View

The editing view shows current source plus compiler feedback.

It should answer:

- What changed compared with the last successful build?
- Which source files or entities were added, modified, or deleted?
- Which diagnostics block build or generation?
- Which downstream entities, prompts, jobs, or media outputs are stale?
- What can be incrementally rebuilt or regenerated?

This view can read current source and the latest build attempt.

### Display View

The display view shows the last stable production result.

It should answer:

- What is the latest successfully compiled production state?
- Which domain tree, timeline, prompts, media candidates, and locked results are stable?
- What can be shown without exposing half-edited source?

This view should read `.build/current` and successful indexes/artifacts by default.

## AI Film Production Flow

The domain should model film production as a graph, not as isolated documents.

A practical v1 flow is:

```text
Project
  -> Project standards
  -> Script
  -> Script versions and blocks
  -> Production
  -> Segment
  -> Scene moment
  -> Storyboard
  -> Writing expression
  -> Content unit
  -> Keyframe
  -> Asset
  -> Prompt bundle
  -> Generation job
  -> Generated candidate
  -> User selection or lock
  -> Published production view
```

The exact hierarchy may evolve, but core should preserve the distinction between creative intent, production plan, generated candidates, and published result.

## Build Can Trigger AI Production

Build does not have to stop at generating JSON artifacts.

In AI film production, build can also create or execute AI generation work:

```text
Build source
  -> Validate production graph
  -> Detect stale downstream targets
  -> Compile prompt bundles
  -> Create generation plan
  -> Optionally execute generation jobs
  -> Store candidates and job results
  -> Optionally promote stable outputs
```

This means build should support modes:

```text
review
  Compute diff, diagnostics, and impact. Do not emit or execute generation.

compile
  Emit artifacts and generation plans. Do not call AI providers.

generate
  Execute selected generation jobs and store candidates.

publish
  Promote selected or locked outputs into the stable display view.
```

The current `build` command can remain as the common user command, but internally core should treat it as a pipeline with explicit phases.

## Incremental Compilation

AI film production strongly benefits from incremental compilation.

If a user changes a scene moment, the system should not rebuild or regenerate the whole project. It should compute the affected subgraph.

Examples:

```text
Change project_standards
  -> Affects all prompts and possibly all generated media.

Change setting
  -> Affects storyboards and keyframes that use that setting.

Change setting_state
  -> Affects assets, storyboards, keyframes, content units, and prompts tied to that state.

Change storyboard
  -> Affects linked content units, prompt bundles, preview timeline, and generation jobs.

Change content_unit editable prompt
  -> Affects that content unit prompt bundle and its generated candidates.

Change locked asset candidate
  -> Affects downstream keyframes, content units, and generated media that use it.
```

Incremental compilation requires a dependency graph as a first-class domain artifact.

## Dependency Graph

The dependency graph should model semantic dependencies, not only parent-child ownership.

Useful edge types:

```text
owns
  Structural containment, such as production owns segment.

contains
  Timeline or composition containment.

references
  Explicit source reference, such as content_unit references storyboard.

uses
  Production usage, such as keyframe uses asset.

derives
  Generated output derives from prompt bundle.

stales
  A source change marks a downstream artifact or candidate stale.

publishes
  A selected candidate is promoted into the stable published view.
```

The graph should support reverse queries:

```text
Given this changed entity, what is affected?
Given this generated candidate, what source produced it?
Given this prompt bundle, which upstream entities must stay stable?
Given this display artifact, what build attempt created it?
```

## Build Attempts

A build attempt is a durable compiler run.

It should exist for both success and failure.

```ts
interface WorkspaceBuildAttempt {
  id: string
  mode: 'review' | 'compile' | 'generate' | 'publish'
  status: 'created' | 'failed' | 'compiled' | 'generated' | 'published'
  createdAt: string
  baselineBuildId?: string
  sourceSnapshot: WorkspaceSourceSnapshot
  changes: WorkspaceChangeSet
  diagnostics: WorkspaceDiagnostic[]
  dependencyGraph?: WorkspaceDependencyGraph
  impactReport?: WorkspaceImpactReport
  generationPlan?: WorkspaceGenerationPlan
  artifacts?: WorkspaceBuildArtifacts
}
```

Attempts make failures useful. A failed build is not just an error return. It is a production record that explains what changed, what failed, and what downstream work is blocked.

## Diagnostics

Diagnostics should be structured and stable.

```ts
interface WorkspaceDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  path: string
  jsonPointer?: string
  entity?: {
    kind: string
    id?: string | number
  }
  related?: Array<{
    path: string
    jsonPointer?: string
    message: string
  }>
  fixHint?: string
}
```

This matters because diagnostics are consumed by CLI, MCP tools, tests, frontend editing views, and future AI repair tools.

## Generation Plan

Build can produce a generation plan before calling AI providers.

```ts
interface WorkspaceGenerationPlan {
  schema: 'movscript.generation-plan.v1'
  buildAttemptId: string
  jobs: WorkspaceGenerationJob[]
}

interface WorkspaceGenerationJob {
  id: string
  target: {
    kind: 'asset' | 'keyframe' | 'content_unit' | 'shot' | 'preview'
    id: string | number
    path: string
  }
  provider?: string
  model?: string
  promptBundleRef: string
  inputs: Array<{
    kind: 'text' | 'image' | 'video' | 'audio' | 'mask' | 'metadata'
    ref: string
  }>
  staleBecause: string[]
  cacheKey: string
  executionPolicy: 'manual' | 'auto' | 'on_publish'
}
```

This keeps AI execution separate from planning. Core can decide what should be generated even when providers are unavailable.

## Candidates And Locks

Generated outputs should be candidates until selected.

```text
generation job
  -> candidate
  -> user selection
  -> lock
  -> published artifact
```

Locks are important because AI output is not deterministic. If the user accepts a generated image or shot, future builds should preserve that choice until an upstream dependency makes it stale or the user explicitly unlocks it.

Candidate records should include:

- Source build attempt id
- Generation job id
- Provider and model
- Prompt bundle hash
- Input references
- Output resource id
- Status
- Stale markers
- Selection or lock state

## Promotion

Promotion is the act of updating stable display state.

Promotion should happen only after a successful compile or publish phase.

```text
attempt artifacts
  -> staging write
  -> validation
  -> promote to .build/current
  -> write manifest
```

This avoids corrupting display state if a build partially fails.

## Suggested Build Directory Shape

```text
.build/
  current/
    domain-tree.json
    editor-state.json
    productions/
    content_units/

  indexes/
    domain-index.json
    dependency-graph.json
    relation-graph.json
    asset-index.json

  attempts/
    build_20260608_001/
      attempt.json
      source-snapshot.json
      changes.json
      diagnostics.json
      impact-report.json
      generation-plan.json
      artifacts/

  manifests/
    build_20260608_000.json

  latest-attempt.json
  latest-failed.json
```

The exact paths can change, but the responsibilities should stay separate.

## Core Responsibilities

Core should own:

- Source classification
- Parsing
- Schema validation
- Semantic validation
- Domain indexing
- Dependency graph construction
- Diff and impact analysis
- Prompt bundle compilation
- Generation plan creation
- Candidate and lock semantics
- Build attempt persistence
- Promotion rules
- Stable artifact contracts

Core should not depend on frontend assumptions.

## Frontend Responsibilities

Frontend should consume core state:

- Editing view reads source and latest attempt.
- Display view reads current stable artifacts.
- Generation UI reads generation plans and job results.
- Review UI reads diagnostics, changes, impacts, and stale markers.

Frontend can shape workflows, but it should not invent domain semantics.

## Implementation Direction

A practical implementation path is:

1. Introduce structured diagnostics.
2. Persist build attempts for review and failed builds.
3. Extract dependency graph as a first-class domain artifact.
4. Make impact analysis graph-driven.
5. Add generation plan output without executing AI providers.
6. Add incremental compile selection based on affected graph nodes.
7. Add generation execution as an explicit pipeline phase.
8. Add promotion/staging so `.build/current` only changes after success.

This keeps the work grounded while moving core toward the correct long-term architecture.

## Non-Goals For V1

V1 does not need to solve every AI production problem.

It does not need:

- Fully automatic final video creation.
- Perfect cross-model reproducibility.
- A complete render farm scheduler.
- A frontend-first workflow engine.
- A universal media asset manager.

V1 does need:

- Clear source/current separation.
- Durable attempts.
- Useful diagnostics.
- Dependency-driven impact analysis.
- Prompt and generation planning.
- Stable display artifacts.

## Summary

MovScript core should define the AI film production process.

The build system is the center of that process. It should compile creative source into production state, identify downstream impact, optionally plan or execute AI generation, and only promote stable outputs after success.

Once this is correct, frontend work becomes a presentation problem instead of a domain-modeling problem.
