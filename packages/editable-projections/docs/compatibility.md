# Compatibility Policy

`@movscript/editable-projections` is meant to be embedded in products, CLIs,
MCP bridges, workers, and CI jobs. This document defines the compatibility
surface those hosts may rely on.

The framework follows one boundary:

```text
Files are drafts.
Reviews are plans.
Commands are intent.
Services own mutation.
```

Compatibility protects that boundary. A host should be able to upgrade the
package, rerun its adapter and workflow contracts, and know whether a change is
safe, additive, or breaking.

## Public Surface

The public surface is limited to documented package exports:

- `@movscript/editable-projections`
- `@movscript/editable-projections/node`
- `@movscript/editable-projections/testing`
- `@movscript/editable-projections/examples/*`
- `@movscript/editable-projections/examples/note`
- `@movscript/editable-projections/examples/movscript-asset-slot`
- `@movscript/editable-projections/examples/movscript-project`
- `@movscript/editable-projections/package.json`

Do not import `dist/*`, `src/*`, generated declaration chunks, or unpublished
module paths. Internal module layout can change in patch releases.

The stable public surface includes:

- Exported function, class, constant, and type names documented in the README.
- Package export paths listed in `package.json`.
- Stable framework error `code` values.
- Serialized JSON artifact shapes documented by schema identifiers.
- Markdown formatter headings and summary wording intended for CLI, CI, MCP, or
  UI diagnostics.
- Contract-test helper behavior and report shapes.

The following are not stable API:

- Build output file grouping below `dist/`.
- Private helper modules not exported by `package.json`.
- Object identity of runtime values that are not documented as frozen.
- Exact TypeScript declaration formatting.
- Example adapter internals beyond their documented command and projection
  patterns.

## Artifact Formats

Artifacts are the values a host may persist or exchange across a process,
network, worker, CLI, MCP, or UI boundary. Use the serializer/parser pair for
each artifact instead of manually constructing JSON.

Current artifact schema identifiers:

- `editable-projections.workspace-manifest.v1`
- `editable-projections.workspace-status.v1`
- `editable-projections.workspace-update-result.v1`
- `editable-projections.apply-result.v1`
- `editable-projections.apply-review.v1`
- `editable-projections.workspace-update-targets.v1`
- `editable-projections.workflow-operation.v1`
- `editable-projections.bridge-result.v1`
- `editable-projections.integration-contract-report.v1`

Hosts can import `editableProjectionArtifactCompatibility`,
`editableProjectionArtifactSchemas`, and `editableProjectionArtifactVersions`
to check the package-supported formats. Use
`verifyEditableProjectionArtifactCompatibility(value)` for non-throwing checks
and `validateEditableProjectionArtifactCompatibility(value)` when invalid input
should throw `InvalidEditableProjectionArtifactCompatibilityError` with code
`invalid_artifact_compatibility`.

## Error Codes

Framework errors carry stable `code` values. Hosts may branch on those codes and
render their own localized messages.

Do not parse human error messages. Message text, issue ordering beyond tested
contract reports, and stack traces are diagnostics, not API.

Adding a new error code is additive when existing behavior keeps returning the
same codes for the same invalid inputs. Replacing or removing an existing code is
breaking.

## Semver Rules

Use these rules when changing the framework.

Patch release:

- Fixes an implementation bug without changing valid artifact shapes.
- Improves diagnostics while keeping stable error codes.
- Adds tests, docs, or examples.
- Refines TypeScript types without rejecting valid runtime usage.

Minor release:

- Adds a new public export, helper, operation, artifact field, or error code.
- Adds a new optional artifact field that old consumers can ignore.
- Adds a new example adapter or testing helper.
- Adds a new workflow operation whose absence can be detected by host feature
  checks.

Major release:

- Removes or renames a public export or package export path.
- Changes an artifact schema identifier or increments an artifact version.
- Makes previously valid persisted artifacts invalid.
- Removes, renames, or repurposes a stable error code.
- Changes command execution semantics in a way that can mutate backend data
  differently for the same review.
- Changes the ownership boundary so adapters or files can bypass services.

When in doubt, treat persisted artifacts, package export paths, and error codes
as the highest-risk compatibility surface.

## Artifact Version Bumps

Increment an artifact schema version when a host must change its parser,
validator, storage, approval UI, or bridge behavior to read the new artifact
correctly.

Do not bump an artifact version for:

- Internal refactors.
- Formatter-only wording changes outside the stable headings.
- Additional optional metadata that old consumers can ignore safely.
- New helper functions that serialize the same shape.

When bumping an artifact version:

- Add the new schema identifier to `editableProjectionArtifactSchemas`.
- Update `editableProjectionArtifactVersions`.
- Keep old parser support when practical, or document the migration.
- Update README, this policy, pack checks, export tests, consumer type checks,
  and artifact compatibility tests in the same change.
- Add at least one fixture or contract test that proves the migration behavior.

## Host Upgrade Checklist

Before upgrading this package in a consuming app:

- Run the package's published compatibility check if the host exchanges
  artifacts across processes.
- Run `assertProjectionAdapterContract` for every writable projection adapter.
- Run `assertEditableProjectionWorkflowContract` for each workspace kit.
- Run `assertEditableProjectionWorkflowToolAdapterContract` when exposing tool
  calls.
- Run `assertEditableProjectionIntegrationContract` for at least one end-to-end
  sample per major projection family.
- Verify service executors still return canonical update targets after commits.
- Verify generated indexes and materialized views remain read-only.

## Framework Release Checklist

Before publishing the framework:

- Run package typecheck, consumer typecheck, tests, pack check, and install
  smoke tests.
- Confirm `prepack` still builds distributable files.
- Confirm README, `docs/design.md`, `docs/first-adapter.md`, and this document
  describe any public behavior changes.
- Confirm packed files include docs and public declarations, but not source or
  tests.
- Confirm artifact schema identifiers, artifact versions, and stable error codes
  were intentionally changed or intentionally left unchanged.
- Run at least one host integration smoke test, such as the MovScript MCP
  workspace tests, when touching Node workflow factories or bridge behavior.
