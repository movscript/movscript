# Proposal-First Orchestration

This document defines the intended Agent behavior for production orchestration
when required project-level references are missing.

## Goal

Production orchestration should stay focused on production state: segments,
scene moments, content organization, reference usage, and production-ready
gaps.

When the Agent discovers that a production orchestration depends on missing
project-level material, such as characters, locations, world settings, creative
references, or reusable asset slots, it should not force all material
preparation into the production step. Instead, it should create the narrow
reviewable upstream proposal first, wait for the user to approve or reject it,
then resume the production proposal using the accepted project state.

In short:

```text
production orchestration request
  -> detect missing project-level prerequisites
    -> create setting_proposal or asset_proposal draft
      -> user reviews/applies the upstream proposal
        -> resume production_proposal draft
```

## Non-Goals

- Do not revive `dual_orchestration` as a default workflow.
- Do not make production orchestration prepare finished media assets.
- Do not create project entities or production entities without explicit review.
- Do not let production proposals define new project-level characters,
  locations, creative references, or reusable asset slots.

## Layer Ownership

`project_proposal` owns project-wide production standards:

- Shot size system.
- Aspect ratio.
- Camera language.
- Visual style.
- Lighting and color rules.
- Pacing rules.
- Negative rules.

`setting_proposal` owns reusable setting knowledge:

- Characters and recurring roles.
- Locations, scenes, world settings, and style references.
- Creative references and reusable setting references.

`asset_proposal` owns reusable asset slots:

- Asset slot requirements, ownership, reuse, and merge candidates.

`asset_proposal` owns candidate image/video/resource plans for an existing
asset slot:

- Prompt directions.
- Reference resources.
- Model capability needs.
- Acceptance criteria and generation risks.

`production_proposal` owns one production's execution structure:

- Segments.
- Scene moments.
- Content-unit organization hints.
- Usage of approved project-level references.
- Production-local unresolved requirements and production-ready gaps.

The important boundary is that production proposals may point to existing or
approved project objects, but they should not define those objects.

## Proposal-First Decision Rule

When handling a production orchestration request, the Agent should classify each
missing item before choosing the next draft.

Use `production_proposal` directly when the missing item is production-local:

- Segment order is unclear.
- A scene moment needs a better beat description.
- A shot or content unit needs a placeholder.
- A reference is optional and can be recorded as a local unresolved requirement.

Switch to `setting_proposal` first when the missing item changes reusable
setting knowledge:

- A character, role, or relationship must be created or revised.
- A location, scene setting, or world rule must be created or revised.
- A recurring visual style or creative reference must be created or revised.

Switch to `asset_proposal` first when the missing item changes a
reusable asset slot:

- A reusable asset slot must be created, renamed, merged, or assigned ownership.
- Multiple productions may need to reuse the same missing reference.

Use `project_proposal` only when the missing prerequisite is a project-wide
production standard, such as shot sizes, aspect ratio, camera language, visual
style, lighting/color, pacing, or negative rules.

If the Agent is uncertain whether an item is project-level or production-local,
it should ask a narrow question instead of guessing.

## Runtime Flow

1. Read focus.
   The Agent identifies `projectId`, `productionId`, route, selected entity,
   active draft, and user intent.

2. Inspect required context narrowly.
   The Agent reads only the scripts, existing drafts, and project references
   needed to decide whether production orchestration can continue.

3. Build a prerequisite map.
   The Agent records which characters, locations, creative references, and asset
   slots are required by the requested production structure.

4. Compare against approved or reviewable project state.
   Existing project data and already approved/applied upstream proposals count
   as available. Drafts that are not approved may be referenced only as pending
   prerequisites.

5. Choose the next proposal.
   If setting prerequisites are missing, create or update a `setting_proposal`
   draft. If asset slots are missing, create or update an
   `asset_proposal` draft. If all project prerequisites are
   available, create or update a `production_proposal` draft.

6. Pause at review boundaries.
   After creating an upstream proposal, the Agent reports the draft ID, review
   route, missing prerequisite summary, and the production draft it intends to
   resume. It does not continue as if the proposal were accepted.

7. Resume after approval.
   Once the user applies the upstream proposal, the Agent re-reads focus and
   project state, then continues the production proposal with concrete
   references.

## Draft Linking

Project and production proposals should be linked through metadata rather than
combined into one artifact.

Recommended metadata for an upstream project-layer proposal:

```json
{
  "requestedBy": {
    "kind": "production_proposal",
    "productionId": 301
  },
  "blocks": [
    {
      "kind": "production_prerequisite",
      "productionId": 301,
      "reason": "missing_character_or_location_reference"
    }
  ]
}
```

Recommended metadata for the production proposal:

```json
{
  "prerequisites": [
    {
      "kind": "setting_proposal",
      "draftId": "draft_abc",
      "status": "pending_review"
    }
  ],
  "resumeAfter": {
    "event": "upstream_proposal_applied",
    "draftId": "draft_abc"
  }
}
```

The exact shape can evolve with the DraftDomainModel, but the contract should
preserve these facts:

- Which production request caused the upstream proposal.
- Which project-layer draft blocks the production draft.
- Whether the production draft is paused, resumable, or ready.

## Skill Routing

The default route for `/production-orchestrate` should be
`production_proposal`, not `dual_orchestration`.

`proposal_first` should be treated as a planning behavior that helps choose the
next local proposal. It should not apply drafts and should not become a
cross-layer artifact by itself.

Expected routing behavior:

```text
User asks for production orchestration
  -> production_proposal skill starts
  -> skill detects missing reusable project references
  -> proposal_first decision redirects to setting_proposal or asset_proposal
  -> upstream project-layer draft is created or updated
  -> Agent pauses and asks user to review/apply
  -> after apply, production_proposal continues
```

`dual_orchestration` should remain disabled or reserved for an explicit future
workflow where the product intentionally exposes a coordinated two-draft review
experience. It should not be the hidden default.

## User Experience

When prerequisites are missing, the Agent should say:

- What production work was requested.
- Which project-level prerequisites are missing.
- Which upstream proposal draft was created or updated.
- What the user needs to review before production orchestration can continue.
- Which production draft or production task will resume after approval.

It should not say:

- That project state has changed before apply.
- That production orchestration is complete while project prerequisites are
  still pending.
- That generated media or asset results exist without tool results.

## Implementation Plan

1. Update runtime intent routing.
   `/production-orchestrate` should infer `production_proposal`. Mentions of
   explicit project standards should infer `project_proposal`; explicit setting
   setup should infer `setting_proposal`; explicit asset slots should
   infer `asset_proposal`. Avoid defaulting to `dual_orchestration`.

2. Strengthen production proposal instructions.
   The production workflow should allow unresolved production-ready gaps and
   should redirect missing settings to `setting_proposal` and missing reusable
   asset slots to `asset_proposal`.

3. Strengthen proposal-first instructions.
   The proposal-first workflow should include a prerequisite classification
   step and select `setting_proposal` or `asset_proposal` before
   `production_proposal` when reusable upstream setup is missing.

4. Add draft dependency metadata.
   Project-layer drafts should record the production request that caused them.
   Production drafts should record blocking project drafts when paused.

5. Add review/resume behavior.
   After an upstream proposal is applied, the Agent should be able to discover
   paused production work and continue from the production page or draft card.

6. Add tests.
   Cover route intent selection, missing-prerequisite classification, project
   draft creation before production draft completion, and resume after upstream
   proposal apply.

## Acceptance Criteria

- A normal production orchestration request activates `production_proposal`.
- Missing characters, locations, or reusable references produce a
  `setting_proposal` or `asset_proposal` draft first.
- The Agent pauses after creating the upstream proposal and does not claim the
  production proposal is complete.
- After the upstream proposal is applied, the Agent can continue the production
  proposal with approved references.
- Production proposals can still record production-local unresolved requirements
  without requiring project setup.
- No default flow depends on `dual_orchestration`.
