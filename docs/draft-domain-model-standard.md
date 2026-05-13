# Draft Domain Model Standard

This document defines the standard architecture for MovScript Agent drafts.
The goal is to make project orchestration reproducible, reviewable, and free of
field-meaning drift between UI, MCP, and Agent skills.

## Objective

Agent drafts are local review artifacts. They are not backend domain entities
until an explicit apply flow writes accepted content to backend APIs.

The standard architecture is:

```text
Frontend DraftDomainModel
  -> MCP exposes draft model and hydrated seed data
    -> Agent skills follow workflow only
      -> Agent creates or patches structured drafts
        -> UI renders and applies drafts using the same frontend model
```

## Design Principles

1. Frontend is the single source of field meaning.
2. MCP is the only runtime bridge that exposes field contracts to Agent.
3. Agent skills describe workflow, not domain field dictionaries.
4. Draft creation for edits should use explicit target and seed policy, not an
   empty document unless the user is creating something truly new.
5. Draft content should be small enough to review, but hydrated enough that the
   Agent does not re-analyze a large project from scratch.
6. Every draft must remain explainable as source data, proposed content, target,
   validation state, and apply route.

## Terms

`DraftDomainModel`
: Frontend-owned definition of a draft kind: target rules, seed policy, field
  guide, content schema, route, and apply semantics.

`Draft seed`
: A controlled snapshot pulled from current app/backend state when creating or
  editing a draft. It can be reference-only or editable.

`Hydration`
: The process of resolving a draft target plus seed policy into structured data.

`Draft shell`
: The persisted local Agent draft object. It includes kind, title, content,
  source, target, status, metadata, timestamps, and IDs.

`Review route`
: The frontend route that renders the draft with its business page UI.

## Canonical DraftDomainModel Shape

```ts
export interface DraftDomainModel {
  kind: AgentDraftKind
  title: string
  targetEntityType: string
  contentSchemaId?: string
  contentSchema?: unknown
  seed: DraftSeedContract
  fieldGuide: DraftFieldGuide
  applyBoundary: DraftApplyBoundary
  routes: DraftRouteContract
}

export interface DraftSeedContract {
  defaultMode: 'empty' | 'snapshot' | 'editable_snapshot'
  allowedModes: Array<'empty' | 'snapshot' | 'editable_snapshot'>
  include: string[]
  maxDepth?: number
  conflictKeys: string[]
}

export interface DraftFieldGuide {
  owns: string[]
  references: string[]
  forbids: string[]
}

export interface DraftApplyBoundary {
  backendApply: 'project_proposal' | 'production_proposal' | 'draft_only'
  writableEntityTypes: string[]
}

export interface DraftRouteContract {
  fallback: string
  reviewTemplate: string
}
```

The current frontend implementation lives in
`apps/frontend/src/lib/draftDomainModel.ts`. Field ownership, seed policy,
schema id, apply boundary, and review route resolution should move here first.

## MCP Contract

Agent skills should not embed field dictionaries. They should call MCP for the
current model.

Implemented MCP tool:

```text
movscript_get_draft_model
```

Input:

```json
{
  "kind": "production_proposal",
  "target": {
    "entityType": "production",
    "entityId": 301
  },
  "seedMode": "editable_snapshot",
  "include": ["production", "segments", "scene_moments"]
}
```

Output:

```json
{
  "contractVersion": 1,
  "kind": "production_proposal",
  "title": "Production proposal",
  "targetEntityType": "production",
  "target": {
    "entityType": "production",
    "entityId": 301,
    "projectId": 42
  },
  "seedPolicy": {
    "mode": "editable_snapshot",
    "include": ["production", "segments", "scene_moments"],
    "allowedInclude": ["production", "segments", "scene_moments"],
    "conflictKeys": ["production.updatedAt", "segments[].updatedAt"],
    "maxDepth": 3
  },
  "seed": {
    "mode": "editable_snapshot",
    "include": ["production", "segments", "scene_moments"],
    "hydrated": true,
    "hydratedAt": "2026-05-13T00:00:00.000Z",
    "modelRef": "frontend:DraftDomainModel:production_proposal:v1",
    "data": {},
    "sourceVersions": {}
  },
  "contentSchemaId": "movscript.production_proposal.v1",
  "contentSchema": {},
  "fieldGuide": {
    "owns": ["segments", "scene_moments"],
    "references": ["project", "creative_references", "asset_slots"],
    "forbids": ["new_project_level_creative_references"]
  },
  "applyBoundary": {
    "backendApply": "production_proposal",
    "writableEntityTypes": ["segment", "scene_moment"]
  },
  "reviewRouteTemplate": "/production-orchestrate?productionId=:targetEntityId&draftId=:draftId",
  "reviewRoute": "/production-orchestrate?productionId=301&draftId=:draftId",
  "modelRef": "frontend:DraftDomainModel:production_proposal:v1"
}
```

The Agent should treat this output as the current contract for this run and pass
the returned `seed` or a compact derivative into `movscript_create_draft.seed`.

## Draft Creation Contract

Draft creation should accept explicit target and seed input.

```ts
export interface CreateAgentDraftInput {
  projectId?: number
  kind: AgentDraftKind
  title: string
  content?: string
  source?: AgentDraftSource
  target?: AgentDraftTarget
  seed?: {
    mode: 'empty' | 'snapshot' | 'editable_snapshot'
    include?: string[]
    modelRef?: string
  }
  metadata?: Record<string, unknown>
}
```

Rules:

- `empty` is only for genuinely new drafts or placeholder shells.
- `snapshot` is reference data that guides the Agent but is not edited directly.
- `editable_snapshot` is current app state transformed into draft content.
- `metadata.seed` should record seed mode, included collections, source version
  keys, hydration timestamp, and model version.

## Standard Project Orchestration Template

Project orchestration is a two-layer review flow:

```text
project_proposal
  owns project-level creative references, setting references, asset slot
  requirements, ownership, reuse, and merge candidates.

production_proposal
  owns one production's segment structure, scene moments, production-local
  unresolved requirements, and references to project-level objects.
```

### Project Proposal Model

Target:

```json
{ "entityType": "project", "entityId": 123 }
```

Default seed:

```json
{
  "mode": "editable_snapshot",
  "include": [
    "project",
    "creative_references",
    "asset_slots",
    "asset_slot_ownership"
  ],
  "maxDepth": 2
}
```

Field ownership:

- Project proposal may create or revise creative references.
- Project proposal may create or revise asset slot requirements.
- Project proposal may define asset slot ownership and reuse/merge candidates.
- Project proposal must not write production segments, content units, media
  plans, or generated resource bindings.

Review route:

```text
/project-workspace?draftId=:draftId
```

### Production Proposal Model

Target:

```json
{ "entityType": "production", "entityId": 301 }
```

Default seed:

```json
{
  "mode": "editable_snapshot",
  "include": [
    "production",
    "segments",
    "scene_moments",
    "creative_reference_usages",
    "asset_slot_usages",
    "unresolved_requirements"
  ],
  "maxDepth": 3
}
```

Field ownership:

- Production proposal may create or revise segments.
- Production proposal may create or revise scene moments.
- Production proposal may reference project-level creative references and asset
  slots.
- Production proposal may record production-local unresolved requirements.
- Production proposal must not define new project-level creative references or
  asset slots. It should request or link a project proposal for that.

Review route:

```text
/production-orchestrate?productionId=:productionId&draftId=:draftId
```

## Skill Authoring Standard

Proposal skills should follow this pattern:

1. Get current focus.
2. Determine draft kind and target.
3. Call `movscript_get_draft_model` for the current target.
4. List or read existing drafts within the returned page/entity scope.
5. Create a hydrated draft only if no usable draft exists or the user asks for a
   new one.
6. Patch the draft using model field paths and schema only.
7. Validate and preview apply where available.
8. Report draft ID, status, route, validation state, and unresolved decisions.

Proposal skills should not:

- Hard-code backend field labels.
- Invent fields missing from the model.
- Recreate a large draft from scratch after reading an existing one.
- Claim backend data changed until apply is complete.

## UI Rendering Standard

UI should render draft artifacts from assistant messages as navigation cards.
The card should:

- Show draft title, kind, status, and update time.
- Resolve the review route from the same frontend model.
- Fall back to `/agent/drafts` if no specific route exists.
- Never imply that the draft has been applied.

Business pages should render draft content by kind using the same model. They
may hydrate additional page data for display, but field meaning and route rules
should come from the frontend model.

## Migration Checklist

For each draft kind:

1. Define `DraftDomainModel`.
2. Define target contract and allowed seed modes.
3. Define field guide and ownership boundaries.
4. Define review route.
5. Expose the model through MCP.
6. Update skill instruction to call MCP instead of embedding field explanations.
7. Update draft creation to store seed metadata.
8. Update UI page to render and apply using the model.
9. Add tests for model route resolution, seed contract, and skill/tool contract.

## Completion Criteria

The architecture is considered implemented for a draft kind only when:

- One frontend model is the source for field labels and route resolution.
- MCP can return the model for that kind and target.
- The relevant skill no longer duplicates field explanations.
- Draft creation supports target and seed metadata.
- UI message cards can navigate to the review route.
- The business page can render the draft without guessing field semantics.
- Validation or tests cover route resolution and seed ownership boundaries.
