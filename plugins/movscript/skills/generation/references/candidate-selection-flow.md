# Candidate Selection Flow

Use this when writing or selecting generated, uploaded, imported, or manually recorded outputs.

1. Generate or import a MovScript RawResource.
2. Find the target content unit.
3. Read or derive the content unit artifact bundle.
4. Write a content candidate with `domain_create_content_candidate` or `domain_create_content_candidate_batch`.
5. Do not select automatically. Select only when the user or explicit workflow confirms the candidate should be used.
6. When selecting, record the accepted input hash through `domain_select_content_unit_candidate` or its batch variant.
7. Run `domain_inspect` or `domain_review`.
8. Run `domain_interpret` after the candidate/selection source write is ready.
9. Run `domain_regeneration_plan` when selected outputs may affect downstream content.

Inline candidate APIs are compatibility paths for asset/keyframe/source-entity candidate workflows. Prefer content unit candidates for production outputs.

## Dependency Gate

A candidate is not a stable dependency until selected.

Before generating a downstream content unit:

- read the dependency report and selection validity for relevant upstream content units,
- confirm required upstream candidates have selections,
- stop if a required upstream content unit has no selected candidate/resource,
- continue without selection only if the user explicitly asks for an unstable draft path.

When using an unstable draft path, state that downstream outputs may not be continuity-safe and may not be tracked as stable dependencies.
