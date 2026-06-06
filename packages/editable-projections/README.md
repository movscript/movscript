# Editable Projections

`@movscript/editable-projections` is a framework for database-backed file workspaces. It lets an application expose backend data as editable draft files, review the local changes, and convert those changes into domain commands.

License: Apache-2.0.

The package does not write databases directly.

```text
Backend owns truth.
Files own drafts.
Apply owns conversion.
Services own mutation.
```

## Concepts

- `Writable Projection`: an editable file with a single authoritative owner for its fields.
- `Generated Index`: a read-only navigation file that may duplicate labels, paths, summaries, or status.
- `Materialized View`: a read-only context file generated for an agent or workflow.
- `Manifest`: the sync ledger that maps files to backend entities and stores base hashes.
- `SnapshotStore`: the last synced file content used for three-way merge.
- `ProjectionAdapter`: the domain adapter that parses, validates, merges, and converts a projection into commands.
- `ApplyReview`: the plan that describes creates, updates, deletes, conflicts, and blocked files.

## Entrypoints

- `@movscript/editable-projections`: framework types, registry, workspace, diff/merge, review formatting, review gate, command executor, memory stores, and example adapters.
- `@movscript/editable-projections/node`: Node filesystem-backed workspace factory and stores.
- `@movscript/editable-projections/testing`: contract-test helpers, contract errors, and memory stores for consuming application tests.
- `@movscript/editable-projections/examples/note`: generic note projection example for product integration tests and quickstarts.
- `@movscript/editable-projections/examples/movscript-asset-slot`: MovScript creative-reference and asset-slot adapter examples.
- `@movscript/editable-projections/examples/movscript-project`: MovScript project-level kit and Node workflow factories for local projection directories.
- `@movscript/editable-projections/package.json`: package metadata for CLIs, MCP bridges, diagnostics, and compatibility checks.

Both ESM and CommonJS consumers are supported through package exports.

For the design rationale, integration shape, and product boundary decisions, see `docs/design.md`. For the compatibility and release contract, see `docs/compatibility.md`. For a step-by-step first integration, see `docs/first-adapter.md`; the same guide has a runnable TypeScript companion at `docs/first-adapter.example.ts`.

## Public API Policy

Use only documented package exports as public API:

- Runtime integrations should import from `@movscript/editable-projections`.
- Node filesystem integrations should import from `@movscript/editable-projections/node`.
- Consuming application tests should import contract helpers and memory harnesses from `@movscript/editable-projections/testing`.
- Product-specific examples may import from `@movscript/editable-projections/examples/*`.
- Tooling may read `@movscript/editable-projections/package.json` for version and compatibility checks.

Do not import from `dist/*` or unpublished source paths. Generated chunk names, declaration helper files, and internal module layout are build artifacts and may change between patch releases.
Stable error `code` values, serialized review/update artifacts, package export paths, and documented helper names are part of the compatibility surface. Behavior changes that alter these contracts should update README, export snapshots, consumer type checks, pack checks, and integration tests in the same change.
The versioning rules for these contracts are documented in `docs/compatibility.md`.

## Artifact Compatibility

Tools that exchange framework artifacts across a CLI, MCP bridge, worker, CI job, or UI boundary can use the public compatibility exports instead of hard-coding schema names or versions:

```ts
import {
  editableProjectionArtifactCompatibility,
  editableProjectionArtifactSchemas,
  editableProjectionArtifactVersions,
  formatEditableProjectionArtifactCompatibilityMarkdown,
  formatEditableProjectionArtifactCompatibilityReportMarkdown,
  parseEditableProjectionArtifactCompatibilityJson,
  serializeEditableProjectionArtifactCompatibilityJson,
  verifyEditableProjectionArtifactCompatibility,
} from '@movscript/editable-projections'

console.log(editableProjectionArtifactCompatibility.packageName)
console.log(editableProjectionArtifactSchemas.applyReview)
console.log(editableProjectionArtifactVersions.workspaceManifest)
console.log(formatEditableProjectionArtifactCompatibilityMarkdown())

const payload = serializeEditableProjectionArtifactCompatibilityJson()
const parsed = parseEditableProjectionArtifactCompatibilityJson(payload)
const report = verifyEditableProjectionArtifactCompatibility(parsed)
console.log(formatEditableProjectionArtifactCompatibilityReportMarkdown(report))
```

Current artifact schema identifiers:

- `workspaceManifest`: `editable-projections.workspace-manifest.v1`
- `workspaceStatus`: `editable-projections.workspace-status.v1`
- `workspaceUpdateResult`: `editable-projections.workspace-update-result.v1`
- `applyResult`: `editable-projections.apply-result.v1`
- `applyReview`: `editable-projections.apply-review.v1`
- `workspaceUpdateTargets`: `editable-projections.workspace-update-targets.v1`
- `workflowOperation`: `editable-projections.workflow-operation.v1`
- `bridgeResult`: `editable-projections.bridge-result.v1`
- `integrationContractReport`: `editable-projections.integration-contract-report.v1`

Current artifact versions:

- `workspaceManifest`: `1`
- `workspaceStatus`: `1`
- `workspaceUpdateResult`: `1`
- `applyResult`: `1`
- `applyReview`: `1`
- `workspaceUpdateTargets`: `1`
- `workflowOperation`: `1`
- `bridgeResult`: `1`
- `integrationContractReport`: `1`

The exports identify the framework artifact formats supported by this package version. They do not wrap or mutate persisted JSON by themselves: workspace manifests still carry `version: 1`, workspace status diagnostics are still serialized with `serializeWorkspaceStatusJson`, workspace update results are still serialized with `serializeWorkspaceUpdateResultJson`, apply execution results are still serialized with `serializeApplyResultJson`, apply reviews are still serialized with `serializeApplyReviewJson`, update-target batches are still serialized with `serializeWorkspaceUpdateTargetsJson`, workflow operation requests are still serialized with `serializeEditableProjectionWorkflowOperationJson`, bridge result envelopes are still serialized with `serializeEditableProjectionBridgeResultJson`, and integration reports are still serialized with `serializeEditableProjectionIntegrationContractReportJson`.
Use `formatEditableProjectionArtifactCompatibilityMarkdown()` when a CLI, MCP tool, CI log, or UI diagnostics panel needs a stable human-readable compatibility summary.
Use `serializeEditableProjectionArtifactCompatibilityJson()` and `parseEditableProjectionArtifactCompatibilityJson()` when a boundary needs a machine-readable compatibility payload. Use `verifyEditableProjectionArtifactCompatibility(value)` for non-throwing diagnostics, or `validateEditableProjectionArtifactCompatibility(value)` when invalid compatibility should throw `InvalidEditableProjectionArtifactCompatibilityError` with the stable code `invalid_artifact_compatibility`.
Use `formatEditableProjectionArtifactCompatibilityReportMarkdown(report)` to display the result of a compatibility check without every integration inventing its own wording.

## Workspace Status Artifact

Workspace status is a diagnostic artifact, not an apply artifact. It can cross CLI, MCP, worker, UI, or CI boundaries safely because it contains paths, sync states, projection metadata, and hashes, but no executable commands or backend mutation payloads. Use `serializeWorkspaceStatusJson`, `parseWorkspaceStatusJson`, and `validateWorkspaceStatus` when a status result needs to be persisted or exchanged as machine-readable JSON.

```ts
import {
  parseWorkspaceStatusJson,
  serializeWorkspaceStatusJson,
  validateWorkspaceStatus,
} from '@movscript/editable-projections'

const status = await workspace.status('data/projects/1')
const artifact = serializeWorkspaceStatusJson(status)
const parsed = parseWorkspaceStatusJson(artifact)
validateWorkspaceStatus(parsed)
```

Invalid status artifacts throw `InvalidWorkspaceStatusArtifactError` with the stable code `invalid_status_artifact`. Validation rejects absolute paths, parent-directory segments, duplicate file paths, unknown states, and malformed optional metadata fields.

## Execution Result Artifacts

`update` and `apply` execution results are also stable JSON artifacts. Use `serializeWorkspaceUpdateResultJson`, `parseWorkspaceUpdateResultJson`, and `validateWorkspaceUpdateResult` when refresh results cross a CLI, MCP, worker, UI, or CI boundary. Use `serializeApplyResultJson`, `parseApplyResultJson`, and `validateApplyResult` when an apply result is persisted or returned across that boundary.

Invalid execution result artifacts throw `InvalidEditableProjectionResultArtifactError` with the stable code `invalid_result_artifact`. Validation checks normalized paths, projection kinds, update modes, summary counts, issue shapes, JSON-compatible conflict values, and apply refresh payloads.

## Minimal Setup

Use `createEditableProjectionKit` when integrating a product or service. The kit captures the domain adapters, backend store, default executor, formatting defaults, and ignore rules once; each workspace can then be created with only its local storage pieces.
Pass either `adapters` or a prebuilt `registry`. Passing both is rejected with `InvalidEditableProjectionKitOptionsError` so adapter registration cannot be silently ignored.
Kit dependencies are validated at creation time. `backendStore` must expose `getEntity`, an optional `executor` must expose `execute`, a custom `registry` must expose `get` and `getByEntityType`, and `adapters` must be an array of projection adapters when present. Invalid values throw `InvalidEditableProjectionKitOptionsError` before any workspace is created.

```ts
import {
  createEditableProjectionKit,
} from '@movscript/editable-projections'

const kit = createEditableProjectionKit({
  adapters: [assetProjectionAdapter],
  backendStore,
  executor,
})

const { workflow } = kit.createMemoryWorkflow()
```

For a runnable generic example that is not tied to MovScript concepts, use the note projection example. It demonstrates backend refresh, local JSON edits, review generation, command execution, canonical refresh, and final clean status.

```ts
import {
  noteProjectionUpdateTarget,
  runNoteProjectionExample,
  runNoteProjectionIntegrationContractExample,
  runNoteProjectionToolAdapterExample,
} from '@movscript/editable-projections'

const result = await runNoteProjectionExample()
console.log(result.review.markdown)
console.log(result.apply.markdown)

const contractResult = await runNoteProjectionIntegrationContractExample()
console.log(contractResult.gate.markdown)

const toolResult = await runNoteProjectionToolAdapterExample()
console.log(toolResult.toolNames)
console.log(toolResult.apply.ok)

const target = noteProjectionUpdateTarget({ id: 1, title: 'Draft note' }, { backendHash: 'note-v1' })
```

`MemoryBackendStore` is useful for tests and service simulations. Use `setEntity`, `deleteEntity`, `listEntities`, and `clear` instead of mutating its backing map directly.

```ts
const backendStore = new MemoryBackendStore()
backendStore.setEntity({
  entityType: 'asset',
  entityId: 1,
  hash: 'asset-v1',
  value: assetEntity,
})
```

For a Node filesystem workspace:

```ts
import {
  createNodeEditableProjectionKit,
} from '@movscript/editable-projections/node'

const { workflow } = createNodeEditableProjectionKit('/path/to/workdir', {
  adapters: [assetProjectionAdapter],
  backendStore,
  executor,
})
```

When a product needs to ignore its own generated files in addition to framework control directories, merge with the default ignore set instead of replacing it accidentally:

```ts
import {
  defaultEditableProjectionIgnorePaths,
  mergeWorkspaceIgnorePaths,
} from '@movscript/editable-projections'

const ignorePaths = mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, [
  'legacy/legacy.workspace.json',
  'legacy/legacy.meta.json',
])
```

The lower-level setup remains available when an application needs to own every dependency explicitly:

```ts
import {
  createProjectionRegistry,
} from '@movscript/editable-projections'
import {
  createNodeEditableProjectionWorkflow,
} from '@movscript/editable-projections/node'

const registry = createProjectionRegistry([assetProjectionAdapter])

const { workflow, reviewStore } = createNodeEditableProjectionWorkflow('/path/to/workdir', {
  registry,
  backendStore,
})
```

Use the lower-level `createEditableProjectionWorkspace` API when embedding a custom filesystem, manifest store, or snapshot store.
Low-level workspace options are validated at creation time. `fs`, `manifestStore`, `snapshotStore`, `backendStore`, and `registry` must expose the required framework methods, and invalid values throw `InvalidEditableProjectionWorkspaceOptionsError`. Use `validateEditableProjectionWorkspaceOptions` when a bridge or test helper wants to check those dependencies before creating the workspace.

By default, workspace scans ignore control and tool directories: `meta`, `reviews`, `update-targets`, `.git`, `node_modules`, and `dist`. Override this with `ignorePaths` when embedding the framework in a different directory layout.
All workspace paths are normalized paths relative to the workspace root. Absolute paths and parent-directory segments are rejected at manifests, reviews, update targets, workspace APIs, and built-in stores.
Custom `ignorePaths` values are validated before workspace scans. They must be normalized relative paths without `.`, `..`, absolute roots, or empty entries; invalid values throw `InvalidEditableProjectionWorkspaceOptionsError`.
Node control paths such as `manifestPath`, `snapshotRoot`, `reviewRoot`, and `updateTargetRoot` must also be normalized relative paths without `.`, `..`, absolute roots, or empty values; invalid values throw `WorkspacePathEscapeError`.

```ts
const workspace = createEditableProjectionWorkspace({
  fs,
  registry,
  manifestStore,
  snapshotStore,
  backendStore,
  ignorePaths: ['.projection-meta', '.git'],
})
```

## Workflow Facade

Use `EditableProjectionWorkflow` as the default integration layer for CLIs, MCP tools, and application services. It keeps the structured result, stable Markdown rendering, and JSON artifact string together for artifact-backed operations.

```ts
const status = await workflow.status('data/projects/1')
console.log(status.markdown)
await writeFile('status.json', status.json)

const review = await workflow.review('data/projects/1')
await writeFile('review.json', review.json)
if (review.gate.ready) {
  const applied = await workflow.applyReview(review.review)
  console.log(applied.markdown)
}
```

For automation that intentionally performs review and apply in one call:

```ts
const applied = await workflow.reviewAndApply('data/projects/1')
```

For tools that first refresh backend truth and then hand a review to another actor, use the update/review combinators:

```ts
const report = await workflow.updateAndReview(updateTargets, 'data/projects/1')
console.log(report.markdown)

const saved = await workflow.updateAndSaveReview(updateTargets, 'data/projects/1', 'latest')
console.log(saved.reviewPath)
```

`workflow.applyReview` and `workflow.reviewAndApply` reject blocked or conflicting reviews by default. Pass `allowConflicts: true` only when the caller intentionally wants to apply ready operations while keeping blocked/conflicting operations in `report.gate` for follow-up review.

`createEditableProjectionWorkflowFromOptions` combines workspace creation and workflow creation when the caller already has the filesystem stores, registry, backend store, and executor in one place.
Workflow facade options are validated at creation time. `workspace` must expose the public workspace methods, optional `executor`, `reviewStore`, and `updateTargetStore` must expose their framework methods, and invalid default formatting options throw `InvalidEditableProjectionWorkflowOptionsError`. Use `validateEditableProjectionWorkflowOptions` when a bridge or test helper wants to check those dependencies before creating the workflow.
Workflow method options are validated before the facade delegates to a workspace or store. Use `validateWorkflowStatusOptions`, `validateWorkflowReviewOptions`, `validateWorkflowUpdateOptions`, `validateWorkflowUpdateAndReviewOptions`, `validateWorkflowApplyOptions`, or `validateWorkflowReviewAndApplyOptions` when a CLI, MCP tool, or plugin bridge wants to check user-supplied options before invoking the workflow.
Workflow reports use `markdown` for human diagnostics and `json` for machine handoff when the result has a stable artifact schema. `workflow.status`, `workflow.update`, `workflow.loadAndUpdate`, `workflow.applyReview`, `workflow.loadAndApply`, `workflow.reviewAndApply`, `workflow.review`, `workflow.checkReview`, `workflow.saveReview`, `workflow.loadReview`, `workflow.reviewAndSave`, and `workflow.updateAndSaveReview().review` return `json`. Update-target artifact helpers `workflow.saveUpdateTargets` and `workflow.loadUpdateTargets` also return `json`.

## Bridge Result Envelope

Use `createEditableProjectionWorkflowBridge` at CLI, MCP, HTTP, plugin, or worker boundaries when the caller expects returned payloads instead of thrown exceptions. The workflow bridge exposes the same common workflow operations, but every method returns a bridge envelope. It preserves the operation result on success, copies `markdown` and `json` from workflow reports when present, and serializes failures with the same stable error JSON and Markdown diagnostics used elsewhere in the framework.

```ts
import {
  createEditableProjectionWorkflowBridge,
} from '@movscript/editable-projections'

const bridge = createEditableProjectionWorkflowBridge(workflow)
const response = await bridge.review('data/projects/1')

if (response.ok) {
  return {
    content: [{ type: 'text', text: response.markdown ?? '' }],
    artifactJson: response.json,
  }
}

return {
  isError: true,
  content: [{ type: 'text', text: response.markdown }],
  errorJson: response.json,
}
```

Use `runEditableProjectionBridgeOperation` for custom product operations that are not workflow methods.
Use `createEditableProjectionBridgeSuccess` and `createEditableProjectionBridgeFailure` when a bridge already has the result or caught error and only needs the standard envelope shape. Success envelopes can use custom `markdown(result)` and `json(result)` extractors for product-specific reports that are not workflow reports.
Use `serializeEditableProjectionBridgeResultJson`, `parseEditableProjectionBridgeResultJson`, and `validateEditableProjectionBridgeResultJson` when the envelope itself must cross a process, network, MCP, queue, or worker boundary. Bridge result JSON intentionally contains only `ok`, `markdown`, `json`, and `error`; it does not include the in-memory `result` object.

## Workflow Operation Router

Use `createEditableProjectionWorkflowOperationRouter` when a CLI, MCP tool, HTTP route, plugin, or worker wants one standard operation request shape instead of hand-written method dispatch. The router accepts an object with an `operation` field, validates the operation-specific fields, calls the workflow method, and returns the same bridge envelope used by `createEditableProjectionWorkflowBridge`.

```ts
import {
  createEditableProjectionWorkflowOperationRouter,
  createEditableProjectionWorkflowOperationToolDefinitions,
  createEditableProjectionWorkflowToolAdapter,
  editableProjectionWorkflowOperationJsonSchema,
  editableProjectionWorkflowOperationNames,
  editableProjectionWorkflowOperationSpecs,
  editableProjectionWorkflowOperationToolDefinitions,
  getEditableProjectionWorkflowOperationJsonSchema,
  getEditableProjectionWorkflowOperationNameForToolName,
  getEditableProjectionWorkflowOperationSpec,
  getEditableProjectionWorkflowOperationToolDefinition,
  parseEditableProjectionWorkflowOperationJson,
  runEditableProjectionWorkflowOperation,
  runEditableProjectionWorkflowOperationJson,
  runEditableProjectionWorkflowToolCall,
  runEditableProjectionWorkflowToolCallJson,
  serializeEditableProjectionWorkflowOperationJson,
  validateEditableProjectionWorkflowOperation,
} from '@movscript/editable-projections'

const router = createEditableProjectionWorkflowOperationRouter(workflow)
const toolAdapter = createEditableProjectionWorkflowToolAdapter(workflow)
const response = await router.run({
  operation: 'review',
  path: 'data/projects/1',
  options: { includeNoop: true },
})
const toolResponse = await toolAdapter.run('editable_projection_review', {
  path: 'data/projects/1',
  options: { includeNoop: true },
})

console.log(response.ok, toolResponse.ok)
console.log(editableProjectionWorkflowOperationNames)
console.log(editableProjectionWorkflowOperationSpecs)
console.log(editableProjectionWorkflowOperationJsonSchema)
console.log(editableProjectionWorkflowOperationToolDefinitions)
console.log(getEditableProjectionWorkflowOperationSpec('review'))
console.log(getEditableProjectionWorkflowOperationJsonSchema('review'))
console.log(getEditableProjectionWorkflowOperationToolDefinition('review'))
console.log(getEditableProjectionWorkflowOperationNameForToolName('editable_projection_review'))
console.log(createEditableProjectionWorkflowOperationToolDefinitions({ namePrefix: 'workspace_' }))
validateEditableProjectionWorkflowOperation({ operation: 'status', path: '.' })
const operationJson = serializeEditableProjectionWorkflowOperationJson({ operation: 'status' })
parseEditableProjectionWorkflowOperationJson(operationJson)
await runEditableProjectionWorkflowOperation(workflow, { operation: 'status' })
await runEditableProjectionWorkflowOperationJson(workflow, operationJson)
await runEditableProjectionWorkflowToolCall(workflow, 'editable_projection_status', { path: '.' })
await runEditableProjectionWorkflowToolCallJson(workflow, 'editable_projection_status', '{"path":"."}')
await toolAdapter.runJson('editable_projection_status', '{"path":"."}')
await router.runJson(operationJson)
```

Supported operation names are `status`, `review`, `checkReview`, `saveReview`, `loadReview`, `loadAndCheckReview`, `reviewAndSave`, `update`, `saveUpdateTargets`, `loadUpdateTargets`, `loadAndUpdate`, `updateAndReview`, `updateAndSaveReview`, `applyReview`, `loadAndApply`, and `reviewAndApply`.
Use `editableProjectionWorkflowOperationSpecs` or `getEditableProjectionWorkflowOperationSpec(name)` when an MCP bridge, CLI, HTTP route, plugin manifest, or UI needs machine-readable operation metadata. Specs include the operation summary, expected fields, result report type, whether the operation writes local workspace files, and whether it executes backend service commands.
Use `editableProjectionWorkflowOperationJsonSchema` or `getEditableProjectionWorkflowOperationJsonSchema(name)` when registering MCP tools, CLI arguments, HTTP input schemas, plugin manifests, or UI form schemas. The JSON Schema describes the operation request shape and explicitly excludes transport-supplied `options.executor`; runtime validation remains authoritative.
Use `editableProjectionWorkflowOperationToolDefinitions`, `getEditableProjectionWorkflowOperationToolDefinition(name)`, or `createEditableProjectionWorkflowOperationToolDefinitions({ namePrefix })` when a host wants transport-neutral tool metadata in one object. Each definition includes a stable tool name such as `editable_projection_status`, the operation name, description, tool-call `inputSchema`, full `operationSchema`, result report type, and the `writesWorkspace` / `executesCommands` risk flags. The tool-call `inputSchema` describes MCP-style arguments and does not require `operation`; `operationSchema` describes the lower-level router request where `operation` is required.
Use `getEditableProjectionWorkflowOperationNameForToolName(toolName)`, `runEditableProjectionWorkflowToolCall(workflow, toolName, arguments)`, or `runEditableProjectionWorkflowToolCallJson(workflow, toolName, argumentsJson)` when a host receives MCP-style `toolName + arguments`. Tool-call arguments may omit `operation`; the helper resolves it from the tool name, validates mismatches, and returns the same bridge envelope as the operation router.
Use `createEditableProjectionWorkflowToolAdapter(workflow, { namePrefix })` when a host wants the ready-to-register tool definitions and dispatch helpers together. The adapter exposes `toolDefinitions`, `getOperationName(toolName)`, `run(toolName, arguments)`, and `runJson(toolName, argumentsJson)`.
Invalid operation requests return `InvalidEditableProjectionBridgeOperationError` through the bridge envelope with the stable code `invalid_bridge_operation`. Use `serializeEditableProjectionWorkflowOperationJson` and `parseEditableProjectionWorkflowOperationJson` when the request itself must be persisted or exchanged as a machine-readable artifact. The serializer rejects non-JSON-compatible values so transport payloads cannot silently lose fields. Apply operation request options intentionally omit `executor`; configure the executor on the workflow so transport payloads cannot smuggle executable functions across a boundary.

## Manifest Validation

The framework validates workspace manifests before using them. Use `validateWorkspaceManifest` for object values and `parseWorkspaceManifestJson` for persisted JSON content.

```ts
import { parseWorkspaceManifestJson } from '@movscript/editable-projections'

const manifest = parseWorkspaceManifestJson(rawManifestText, 'meta/manifest.json')
```

Invalid manifests throw `InvalidWorkspaceManifestError` with stable issue paths. The Node `JsonManifestStore` validates on both `load` and `save`.

## Apply Review Artifact

Apply reviews can be persisted as JSON for approval handoffs between agents, CLIs, MCP tools, or UI review panes. Use the framework helpers so saved review files are checked before apply.

```ts
const review = await workflow.reviewAndSave('data/projects/1', 'latest')
console.log(review.markdown)

const applied = await workflow.loadAndApply('latest')
console.log(applied.markdown)
```

Use `workflow.checkReview(review)` or `workflow.loadAndCheckReview('latest')` when a UI, CLI, or service needs to validate a review and inspect its readiness gate without applying commands.

Use `workflow.saveReview` and `workflow.loadReview` when the review is created, approved, or edited by separate components. Workflow save helpers validate review artifact paths and review content before calling the configured store, and their reports expose `json`, so custom stores and bridges can focus on persistence. Node `FileApplyReviewStore` stores reviews under `reviews/*.json` by default and rejects empty names, `.`, `./` path segments, and paths containing `..`; `MemoryApplyReviewStore` is available for tests and non-Node adapters. Use `parseApplyReviewJson` and `serializeApplyReviewJson` when implementing a custom store.

Missing review artifacts throw `MissingApplyReviewArtifactError`; invalid review artifacts throw `InvalidApplyReviewError`. Validation checks the review shape, verifies summary counts match the operation list, and requires executable commands to appear only on planned operations with an explicit action. Command payloads and JSON Patch values must be JSON-compatible, so persisted review artifacts cannot silently drop `undefined`, functions, `BigInt`, non-finite numbers, or cyclic objects. Both `workflow.applyReview` and lower-level `workspace.apply` validate supplied reviews before executing commands; readiness can also be checked explicitly with `evaluateApplyReview` or `assertApplyReviewReady`.
Patch and conflict paths use JSON Pointer semantics: paths are either an empty string or start with `/`. An empty string means the whole projection document or an entity-level conflict.
Operation state semantics are validated: only planned operations may include actions, commands, and patches; blocked operations must include at least one issue; conflict operations must include at least one conflict.

## Update Local Projections

`update` materializes backend truth into local files and records the synced base snapshot. The default mode is `safe`, so dirty local drafts are not overwritten.
Update targets are validated before any file or manifest writes. Invalid targets throw `InvalidWorkspaceUpdateTargetError`.
Update options are validated before any file or manifest writes. Invalid modes or non-string `backendRevision` values throw `InvalidWorkspaceUpdateOptionsError`.
A single update batch may contain each file path only once; duplicate paths are rejected before adapter materialization or workspace writes.
Delete update targets must not include `content`, because deletion uses only the file path and manifest identity. Generated indexes and materialized views must not be marked `writable: true`, and non-delete generated indexes/materialized views must include caller-provided `content`.
Pass `backendRevision` when the backend service can provide a batch-level revision, snapshot hash, or cursor for the refresh. The framework records it in the manifest and returns it on `WorkspaceUpdateResult` only when the whole update batch completes without blocked files or conflicts. File-level `backendHash` still belongs on each update target and is used for stale-review checks.
For writable projections with a registered adapter, `update` validates the materialized projection before writing; invalid content is returned as a blocked update operation and is not written to the workspace.
If adapter `toProjection` or `serializeFile` fails while materializing backend truth, the failed target is returned as blocked and no local file, manifest entry, or base snapshot is written for that target.
Generated index and materialized view object content must be JSON-compatible. Non-serializable content is returned as a blocked update operation before any workspace file is written.

```ts
await workspace.update([{
  path: 'data/projects/1/assets/asset_1.json',
  schema: 'example.asset.v1',
  kind: 'writable_projection',
  writable: true,
  entityType: 'asset',
  entityId: 1,
}], { backendRevision: 'project-1-revision-42' })
```

For writable projections backed by an adapter, prefer `createWritableProjectionUpdateTarget`. It derives `schema`, `kind`, `writable`, `entityType`, and `content` from the adapter and validates the target path before materializing the projection.

```ts
import {
  createWritableProjectionUpdateTarget,
  createWritableProjectionUpdateTargets,
} from '@movscript/editable-projections'

await workspace.update([
  createWritableProjectionUpdateTarget({
    adapter: assetProjectionAdapter,
    entity: assetEntity,
    entityId: assetEntity.id,
    path: `data/projects/1/assets/asset_${assetEntity.id}.json`,
    backendHash: assetEntity.hash,
  }),
])
```

Use `createWritableProjectionUpdateTargets` for list refreshes. It validates every target in the batch before calling the adapter to materialize file content.

```ts
await workspace.update(createWritableProjectionUpdateTargets({
  adapter: assetProjectionAdapter,
  entities: assetEntities,
  entityIdFor: (asset) => asset.id,
  pathFor: (asset) => `data/projects/1/assets/asset_${asset.id}.json`,
  backendHashFor: (asset) => asset.hash,
}))
```

When update targets cross a CLI, MCP, HTTP, worker, or review boundary, use `serializeWorkspaceUpdateTargetsJson` and `parseWorkspaceUpdateTargetsJson`. The serializer omits undefined top-level optional fields and rejects non-JSON-compatible `content`, so generated indexes, materialized views, and canonical refresh targets cannot silently lose fields.

```ts
import {
  parseWorkspaceUpdateTargetsJson,
  serializeWorkspaceUpdateTargetsJson,
} from '@movscript/editable-projections'

const artifact = serializeWorkspaceUpdateTargetsJson(updateTargets)
await workspace.update(parseWorkspaceUpdateTargetsJson(artifact))
```

When a tool wants to persist refresh intent as a first-class artifact, configure an update target store and use the workflow facade. Node workflows include `FileWorkspaceUpdateTargetStore` by default and write under `update-targets/*.json`; tests and non-Node adapters can use `MemoryWorkspaceUpdateTargetStore`. Built-in artifact stores reject empty names, `.`, `./` path segments, and paths containing `..`.

```ts
await workflow.saveUpdateTargets('asset-refresh', updateTargets)
const refreshed = await workflow.loadAndUpdate('asset-refresh')
console.log(refreshed.markdown)
```

`workflow.saveUpdateTargets` and `workflow.loadUpdateTargets` validate artifact paths and artifact content with the same JSON-compatible rules as `serializeWorkspaceUpdateTargetsJson`, and their reports expose `json`, so custom stores can focus on persistence. Missing update target artifacts throw `MissingWorkspaceUpdateTargetArtifactError`; calling the workflow artifact helpers without a configured store throws `MissingWorkspaceUpdateTargetStoreError`.

Modes:

- `safe`: write clean files and missing files; block dirty local files.
- `overwrite`: replace local files with the remote projection.
- `merge`: three-way merge `base`, `local`, and `remote`; block conflicts.

Generated indexes and materialized views are read-only projection files. Use `createGeneratedIndexUpdateTarget` or `createMaterializedViewUpdateTarget` so `kind` and `writable` stay consistent.

```ts
import {
  createGeneratedIndexUpdateTarget,
  createMaterializedViewUpdateTarget,
} from '@movscript/editable-projections'

await workspace.update([
  createGeneratedIndexUpdateTarget({
    path: 'data/projects/1/project.index.json',
    schema: 'example.project_index.v1',
    entityType: 'project_index',
    entityId: 1,
    content: {
      schema: 'example.project_index.v1',
      assets: [{ id: 1, label: 'Hero image', path: 'assets/asset_1.json' }],
    },
  }),
  createMaterializedViewUpdateTarget({
    path: 'data/projects/1/context/asset-plan.md',
    schema: 'example.asset_plan.v1',
    entityType: 'asset_plan',
    content: '# Asset Plan\n',
  }),
], { mode: 'overwrite' })
```

## Projection Adapter

Adapters are the only place where domain semantics enter the framework.

```ts
const assetProjectionAdapter = {
  schema: 'example.asset.v1',
  entityType: 'asset',

  parseFile(content) {
    return JSON.parse(content)
  },

  validateFile(value) {
    const issues = []
    if (!value || typeof value !== 'object') {
      issues.push({ severity: 'error', message: 'Asset projection must be an object.' })
    }
    if (value.schema !== 'example.asset.v1') {
      issues.push({ severity: 'error', message: 'Wrong schema.' })
    }
    return { ok: issues.length === 0, issues }
  },

  toProjection(entity) {
    return entity
  },

  createCommands(input) {
    return {
      commands: [{
        type: `asset.${input.action}`,
        patch: input.patch,
        ...(input.entity.entityId !== undefined ? { id: input.entity.entityId } : {}),
        ...(input.target !== undefined ? { target: input.target } : {}),
      }],
    }
  },
}
```

`createCommands` must return `{ commands: [...] }` and may include `warnings`. The framework validates this shape when building an apply review; invalid adapter results throw `InvalidProjectionCommandResultError`. If `createCommands` throws for a specific projection, that projection is returned as a blocked review operation instead of aborting the whole review. If commands have a valid shape but are not JSON-compatible, the projection is also returned as blocked so callers do not receive an apply review that fails only when it is saved or applied.

For TypeScript projects, wrap adapters with `defineProjectionAdapter` to keep file, entity, and command types attached to the adapter:

```ts
import { defineProjectionAdapter } from '@movscript/editable-projections'

const assetProjectionAdapter = defineProjectionAdapter<AssetProjection, AssetEntity, AssetCommand>({
  schema: 'example.asset.v1',
  entityType: 'asset',
  parseFile: parseAssetProjection,
  validateFile: validateAssetProjection,
  toProjection: assetToProjection,
  createCommands: assetProjectionCommands,
})
```

For common JSON-backed projections, use `createJsonProjectionAdapter` to avoid repeating parse, serialize, schema validation, and command-result boilerplate:

```ts
import { createJsonProjectionAdapter } from '@movscript/editable-projections'

const noteAdapter = createJsonProjectionAdapter({
  schema: 'example.note.v1',
  entityType: 'note',
  toProjection(entity) {
    return {
      schema: 'example.note.v1',
      id: entity.id,
      title: entity.title,
    }
  },
  validate(value) {
    return typeof value.title === 'string' && value.title.length > 0
      ? []
      : [{ severity: 'error', path: '/title', message: 'Title is required.' }]
  },
  createCommands(input) {
    return [{
      type: `note.${input.action}`,
      patch: input.patch,
      ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
    }]
  },
})
```

The framework will use the adapter to parse local files, validate them, convert backend entities to remote projections, perform three-way merge, and produce domain commands.

Adapters can use `diffJsonById` when a projection contains stable-id lists such as `states`, `asset_slots`, or `relationships`. It keeps review patches focused on item-level changes instead of replacing the whole array.

```ts
import { diffJsonById } from '@movscript/editable-projections'

const patch = diffJsonById(baseProjection, targetProjection, {
  idKeys: ['id', 'client_id', 'key'],
})
```

`diffJsonById` only uses granular array patches when both sides have unique item identities and the common items have not been reordered. Reorders fall back to replacing the array, because JSON Patch array indexes become ambiguous for mixed reorder/update plans.

## Adapter Contract Tests

Use `assertProjectionAdapterContract` in the consuming application's test suite before wiring a new domain adapter into a workspace. It checks the adapter's core contract: valid files parse and validate, serialized projections round-trip, backend entities materialize into valid projections, invalid samples are rejected, and `createCommands` returns a valid command result.

```ts
import { assertProjectionAdapterContract } from '@movscript/editable-projections'

assertProjectionAdapterContract({
  adapter: assetProjectionAdapter,
  entity: assetEntity,
  entityId: assetEntity.id,
  filePath: `data/projects/1/assets/asset_${assetEntity.id}.json`,
  validFile: JSON.stringify(assetProjection),
  invalidFile: JSON.stringify({ schema: 'example.asset.v1' }),
})
```

Use `verifyProjectionAdapterContract` when a tool or UI wants a structured report instead of an exception. Failed assertions throw `InvalidProjectionAdapterContractError` with stable issue paths.
Use `validateProjectionAdapterContractOptions` when a CLI, plugin bridge, or custom test helper needs to check the sample shape before invoking adapter methods.

## Workflow Contract Tests

Use `assertEditableProjectionWorkflowContract` after wiring a product kit, backend store, executor, and artifact stores. It runs a disposable end-to-end sample through the public workflow facade: save update targets, load and update local files, edit the draft, save/load a review, apply commands, run canonical refresh, and verify the workspace is clean.

```ts
import { assertEditableProjectionWorkflowContract } from '@movscript/editable-projections'

await assertEditableProjectionWorkflowContract({
  workflow,
  fs,
  updateTarget: createWritableProjectionUpdateTarget({
    adapter: assetProjectionAdapter,
    entity: assetEntity,
    entityId: assetEntity.id,
    path: `data/projects/1/assets/asset_${assetEntity.id}.json`,
    backendHash: assetEntity.hash,
  }),
  editFile(current) {
    return current.replace('"draft"', '"ready"')
  },
})
```

Run this contract in tests against a disposable workspace and a deterministic sample backend. Use `verifyEditableProjectionWorkflowContract` when a tool or UI wants a structured report. Failed assertions throw `InvalidEditableProjectionWorkflowContractError`.
Use `validateWorkflowContractOptions` when a CLI, plugin bridge, or test helper needs to check the contract-test inputs before running the end-to-end sample.

Use `assertEditableProjectionWorkflowToolAdapterContract` after exposing a workflow through `createEditableProjectionWorkflowToolAdapter`. It runs the same update/edit/review/apply/status sample through tool names and tool-call arguments, so MCP/CLI/HTTP host wiring can be checked in CI without depending on a specific tool SDK.

```ts
import { assertEditableProjectionWorkflowToolAdapterContract } from '@movscript/editable-projections'

await assertEditableProjectionWorkflowToolAdapterContract({
  toolAdapter,
  fs,
  updateTarget,
  editFile(current) {
    return current.replace('"draft"', '"ready"')
  },
})
```

Use `verifyEditableProjectionWorkflowToolAdapterContract` for structured reports and `validateWorkflowToolAdapterContractOptions` when a bridge wants to validate contract-test input shape before running the sample. Failed assertions throw `InvalidEditableProjectionWorkflowContractError`.

## Integration Contract Tests

Use `assertEditableProjectionIntegrationContract` as the default consuming-application smoke test. It runs the adapter contract and workflow contract together, prefixes issues by `adapter` or `workflow`, and throws `InvalidEditableProjectionIntegrationContractError` with the stable code `invalid_integration_contract` when product wiring is not ready.

```ts
import { assertEditableProjectionIntegrationContract } from '@movscript/editable-projections'

await assertEditableProjectionIntegrationContract({
  adapter: {
    adapter: assetProjectionAdapter,
    entity: assetEntity,
    entityId: assetEntity.id,
    filePath: `data/projects/1/assets/asset_${assetEntity.id}.json`,
    validFile: JSON.stringify(assetProjection, null, 2),
    invalidFile: JSON.stringify({ schema: 'example.asset.v1' }, null, 2),
  },
  workflow: {
    workflow,
    fs,
    updateTarget: createWritableProjectionUpdateTarget({
      adapter: assetProjectionAdapter,
      entity: assetEntity,
      entityId: assetEntity.id,
      path: `data/projects/1/assets/asset_${assetEntity.id}.json`,
      backendHash: assetEntity.hash,
    }),
    editFile(current) {
      return current.replace('"draft"', '"ready"')
    },
  },
})
```

Use `verifyEditableProjectionIntegrationContract` for CI reports or UI diagnostics, and `validateEditableProjectionIntegrationContractOptions` when a bridge wants to validate user-provided sample definitions before running the test. Use `formatEditableProjectionIntegrationContractMarkdown(report)` when a CLI, MCP tool, CI log, or UI review pane needs a stable human-readable diagnostic summary.
Use `runEditableProjectionIntegrationContractGate(options)` when a CI job, CLI, MCP tool, or worker needs the structured report, Markdown diagnostics, and JSON artifact in one stable result.

```ts
const report = await verifyEditableProjectionIntegrationContract(options)
console.log(formatEditableProjectionIntegrationContractMarkdown(report))

const gate = await runEditableProjectionIntegrationContractGate(options)
await writeFile('editable-projection-contract.md', gate.markdown)
await writeFile('editable-projection-contract.json', gate.json)
```

Use `serializeEditableProjectionIntegrationContractReportJson(report)` and `parseEditableProjectionIntegrationContractReportJson(json)` when a CLI, MCP bridge, CI job, or worker needs to persist the diagnostic report as a JSON artifact.

## Testing Harness Quickstart

For fast consuming-application tests, import from the testing entrypoint and run a disposable in-memory integration gate with `runEditableProjectionMemoryIntegrationContractGate`. It creates the harness, runs the adapter and workflow contracts, returns Markdown and JSON diagnostics, and keeps the harness available for final backend assertions.

```ts
import {
  runEditableProjectionMemoryIntegrationContractGate,
} from '@movscript/editable-projections/testing'

const gate = await runEditableProjectionMemoryIntegrationContractGate({
  adapter: assetProjectionAdapter,
  entity: assetEntity,
  entityId: assetEntity.id,
  filePath: `data/projects/1/assets/asset_${assetEntity.id}.json`,
  validFile: JSON.stringify(assetProjection, null, 2),
  invalidFile: JSON.stringify({ schema: 'example.asset.v1' }, null, 2),
  updateTarget: assetUpdateTarget,
  backendEntities: [{
    entityType: 'asset',
    entityId: assetEntity.id,
    hash: assetEntity.hash,
    value: assetEntity,
  }],
  executor: {
    async execute(commands) {
      return {
        updateTargets: await assetService.executeForTest(commands),
      }
    },
  },
  editFile(current) {
    return current.replace('"draft"', '"ready"')
  },
})

console.log(gate.markdown)
await gate.harness.backendStore.getEntity({ entityType: 'asset', entityId: assetEntity.id })
```

Use `createEditableProjectionMemoryTestHarness` directly when a test needs to seed custom local files, manifests, base snapshots, saved reviews, or saved update targets before running lower-level workflow operations.

## Integration Checklist

Before exposing an editable projection workspace in a product, run these checks in the consuming application:

- Define one adapter per writable projection schema, not per database table.
- Keep every writable field owned by exactly one writable projection.
- Keep generated indexes and materialized views read-only.
- Validate every adapter with `assertProjectionAdapterContract`.
- Validate the assembled workflow with `assertEditableProjectionWorkflowContract`.
- Prefer one consuming-application smoke test with `runEditableProjectionMemoryIntegrationContractGate` or `assertEditableProjectionIntegrationContract`.
- Emit CI diagnostics with `runEditableProjectionIntegrationContractGate` when a report artifact is more useful than a thrown assertion.
- Use `createEditableProjectionKit` or validate lower-level dependencies with `validateEditableProjectionWorkspaceOptions` and `validateEditableProjectionWorkflowOptions`.
- Use `mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, productPaths)` when appending product-specific generated files to the framework control-directory ignore set.
- Persist cross-boundary review artifacts with `saveReview` / `loadReview` or `FileApplyReviewStore`.
- Persist cross-boundary refresh intent with `saveUpdateTargets` / `loadUpdateTargets` or `FileWorkspaceUpdateTargetStore`.
- Route `apply` through service commands; do not write database rows from adapters.
- Return canonical update targets from the executor after service commits.
- Surface `serializeEditableProjectionError(error)` at CLI, MCP, HTTP, worker, or UI boundaries.
- Run `pnpm --filter @movscript/editable-projections test` before publishing framework changes.

## Integration Recipe

Use this sequence when wiring a new product, plugin, CLI, or MCP bridge. It keeps the framework domain-neutral while making the product service layer the only place that mutates backend truth.

1. Model the file layout before writing adapters.
   Choose one writable projection file for each authoritative editing surface, such as `projects/1/assets/asset_12.json`. Put duplicated navigation, summaries, labels, or rollups in generated indexes or materialized views. Do not make two writable files own the same field.

2. Define the adapter contract.
   Implement `parseFile`, `serializeFile` when needed, `validateFile`, `toProjection`, optional `merge`, and `createCommands`. The adapter should emit business commands, not SQL, ORM calls, HTTP calls, or database rows. Validate it with `assertProjectionAdapterContract` using a valid file, invalid file, and backend entity sample.

3. Build backend refresh targets.
   Backend-to-local refresh should call product services, convert returned entities with `createWritableProjectionUpdateTarget`, and pass a stable `backendHash` for each writable projection. Use `createGeneratedIndexUpdateTarget` or `createMaterializedViewUpdateTarget` for read-only files.

4. Create the workspace kit.
   Prefer `createEditableProjectionKit` for memory or custom stores and `createNodeEditableProjectionKit` for filesystem-backed tools. Merge product ignore paths with `mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, productPaths)` so control folders, package output, and product-generated files are not reviewed accidentally.

5. Wire apply through services.
   Use `createCommandExecutor` for custom command dispatch or `createCrudCommandExecutor` when commands map to create/update/delete service methods. The executor should call the product service, wait for the backend commit, then return canonical update targets so local files, manifest entries, and base snapshots become clean.

6. Persist handoff artifacts at boundaries.
   For approval flows, save review artifacts with `reviewAndSave`, `saveReview`, or `FileApplyReviewStore`. For refresh handoff, use `saveUpdateTargets`, `loadUpdateTargets`, or `FileWorkspaceUpdateTargetStore`. Treat these artifacts as the reviewable bridge between an agent, CLI, UI, or worker and the service layer.

7. Expose small tool operations.
   Product tools should usually expose `update`, `review`, and `apply` operations over paths. `update` pulls backend truth into local draft files; `review` shows planned commands and conflicts without mutating backend state; `apply` submits only planned commands through services and refreshes canonical local state. Use `createEditableProjectionWorkflowOperationRouter` when a tool boundary wants a single standard operation dispatcher.

8. Add consuming-application gates.
   Run `runEditableProjectionMemoryIntegrationContractGate` or `assertEditableProjectionIntegrationContract` for each major projection family, and use `assertEditableProjectionWorkflowContract` when a custom workflow kit needs a lower-level check. Keep package export tests, TypeScript consumer tests, README contract tests, pack checks, and the consuming product's typecheck in CI.

## Domain Adapter Example

The package includes MovScript creative-reference and asset-slot adapters as concrete references for domain integration. They are intentionally command-based: they emit service commands and never write database rows themselves.

This example uses the recommended ownership rule: a creative reference is edited in its own writable projection, while an asset slot stores only a business reference to it. Navigation fields such as `label` and `path` may appear in local files, but service commands receive only authoritative foreign-key fields such as `owner_type` and `owner_id`.

```ts
import {
  createProjectionRegistry,
  movscriptProjectAdapters,
  movscriptAssetSlotPath,
  movscriptAssetSlotUpdateTarget,
  movscriptCreativeReferencePath,
  movscriptCreativeReferenceUpdateTarget,
} from '@movscript/editable-projections'

const registry = createProjectionRegistry(movscriptProjectAdapters)

await workspace.update([
  movscriptCreativeReferenceUpdateTarget(referenceEntity, {
    path: movscriptCreativeReferencePath(referenceEntity.projectId, referenceEntity.ID),
    backendHash: referenceEntity.hash,
  }),
  movscriptAssetSlotUpdateTarget(assetSlotEntity, {
    path: movscriptAssetSlotPath(assetSlotEntity.projectId, assetSlotEntity.ID),
    backendHash: assetSlotEntity.hash,
  }),
])
```

An edited creative-reference file produces commands shaped for the MovScript service layer:

```ts
{
  type: 'movscript.creative_reference.update',
  entityType: 'creative_reference',
  entityId: 8,
  action: 'update',
  input: {
    project_id: 1,
    kind: 'person',
    name: 'Lina',
    description: 'Lead character with a sharper visual identity.',
  },
  patch: [{ op: 'replace', path: '/description', value: 'Lead character with a sharper visual identity.' }]
}
```

An edited asset-slot file produces commands that keep references normalized:

```ts
{
  type: 'movscript.asset_slot.update',
  entityType: 'asset_slot',
  entityId: 12,
  action: 'update',
  input: {
    name: 'Hero portrait',
    kind: 'image',
    owner_type: 'creative_reference',
    owner_id: 8,
    prompt_hint: 'Keep face identity consistent and readable.',
  },
  patch: [{ op: 'replace', path: '/prompt_hint', value: 'Keep face identity consistent and readable.' }]
}
```

The same pattern should be used for other MovScript concepts and for other products: keep each projection small, make only one file authoritative for each writable fact, validate writable fields, emit business commands, and return canonical update targets after the service commits.

For a Node bridge, such as an Electron MCP tool that already resolved a single project projection directory, use the project factory with project-root relative paths:

```ts
import {
  movscriptProjectRelativeAssetSlotPath,
  movscriptProjectRelativeCreativeReferencePath,
  movscriptAssetSlotUpdateTarget,
  movscriptCreativeReferenceUpdateTarget,
} from '@movscript/editable-projections/examples/movscript-asset-slot'
import {
  createMovScriptProjectNodeProjectionKit,
} from '@movscript/editable-projections/examples/movscript-project'

const project = createMovScriptProjectNodeProjectionKit(projectProjectionDir, {
  backendStore,
  executor,
})

await project.workflow.update([
  movscriptCreativeReferenceUpdateTarget(referenceEntity, {
    path: movscriptProjectRelativeCreativeReferencePath(referenceEntity.ID),
    backendHash: referenceEntity.hash,
  }),
  movscriptAssetSlotUpdateTarget(assetSlotEntity, {
    path: movscriptProjectRelativeAssetSlotPath(assetSlotEntity.ID),
    backendHash: assetSlotEntity.hash,
  }),
])
const review = await project.workflow.reviewAndSave('.', 'reviews/project-1')
await project.workflow.loadAndApply('reviews/project-1')
```

The bridge still delegates backend writes to `executor`. The factory only standardizes adapter registration, local filesystem stores, manifest/base snapshots, review artifacts, and update-target artifacts for MovScript project-level projections.

## Review And Apply

```ts
const status = await workspace.status('data/projects/1')
const review = await workspace.applyReview('data/projects/1')
const markdown = formatApplyReviewMarkdown(review)

assertApplyReviewReady(review)
await workspace.apply(review, {
  executor: {
    async execute(commands) {
      await movscriptService.executeCommands(commands)
    },
  },
})
```

`applyReview` is the safety boundary. It produces a plan; it does not mutate backend state. `apply` executes only planned commands through the caller-provided executor.
Review options are validated before workspace scans. `includeNoop` must be a boolean when present or `InvalidWorkspaceReviewOptionsError` is thrown.
Apply options are validated before readiness checks, stale checks, and executor calls. `allowConflicts`, `allowStaleReview`, and `refreshMode` must have valid runtime types, and the executor must expose an `execute` function, or `InvalidWorkspaceApplyOptionsError` is thrown.
By default, `apply` rejects stale reviews: if the local file, manifest base hash, synced base snapshot content, or backend entity changed after `applyReview` was created, it throws `StaleApplyReviewError`. Re-run `applyReview` before applying. Advanced callers can pass `allowStaleReview: true` when they intentionally want to execute an older plan.
Use `formatApplyReviewMarkdown`, `formatWorkspaceStatusMarkdown`, and `formatWorkspaceUpdateMarkdown` when MCP tools, CLI commands, logs, or UI review panes need stable human-readable output.
Formatting options are validated by direct formatter calls and workflow markdown rendering. `includeNoop` and `includeCommands` must be booleans when present, and `maxPatchOperations` must be a non-negative integer, or `InvalidFormatOptionsError` is thrown.
Kit-level default `format` options and workflow-level override `format` options are validated before they are merged, so malformed JavaScript values cannot be hidden by object spread.
Use `evaluateApplyReview` or `assertApplyReviewReady` before submitting when a caller needs a stable pre-apply gate for blocked files and conflicts.

For service integration, use `createCommandExecutor` to dispatch command types to handlers:

```ts
const executor = createCommandExecutor({
  handlers: {
    'movscript.asset_slot.update': async (command) => {
      const assetSlot = await semanticService.patchAssetSlot(command.entityId, command.input)
      return {
        updateTargets: [
          movscriptAssetSlotUpdateTarget(assetSlot, {
            path: command.filePath,
            backendHash: assetSlot.hash,
          }),
        ],
      }
    },
  },
})

await workspace.apply(review, { executor })
```

Executors can return canonical update targets after the service layer commits. The framework will refresh the local file, manifest, and base snapshot with `overwrite` mode by default.
`createCommandExecutor` validates returned update targets before returning them to `workspace.apply`; invalid or duplicate refresh targets throw `InvalidWorkspaceUpdateTargetError`.

For the common case where command types map directly to create/update/delete service methods, use `createCrudCommandExecutor` to keep the bridge small while still returning explicit canonical refresh targets:

```ts
const executor = createCrudCommandExecutor({
  commandTypes: {
    create: 'asset.create',
    update: 'asset.update',
    delete: 'asset.delete',
  },
  create: (command) => assetService.create(command.input),
  update: (command) => assetService.update(command.entityId, command.input),
  delete: (command) => assetService.delete(command.entityId),
  refresh: {
    create: (asset, command) => [
      assetProjectionUpdateTarget(asset),
      createWritableProjectionDeleteTarget({
        adapter: assetProjectionAdapter,
        path: command.filePath,
        entityId: asset.id,
      }),
    ],
    update: (asset, command) => [assetProjectionUpdateTarget(asset, { path: command.filePath })],
    delete: (_result, command) => [
      createWritableProjectionDeleteTarget({
        adapter: assetProjectionAdapter,
        path: command.filePath,
        entityId: command.entityId,
      }),
    ],
  },
})
```

The CRUD helper does not infer database routes or mutate data itself. It only dispatches already-planned commands to caller-provided service functions and validates the refresh targets through the same executor pipeline as `createCommandExecutor`.
Each `commandTypes` value may be a string or an array of strings, so one action handler can cover multiple domain command types such as `creative_reference.update` and `asset_slot.update` when they share the same service boundary.

```ts
await workspace.apply(review, {
  executor: {
    async execute(commands) {
      const result = await movscriptService.executeCommands(commands)
      return {
        updateTargets: result.updatedAssets.map((asset) => ({
          path: `data/projects/${asset.projectId}/assets/asset_${asset.id}.json`,
          schema: 'example.asset.v1',
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
          entityId: asset.id,
          backendHash: asset.hash,
          content: asset.projection,
        })),
      }
    },
  },
})
```

This keeps the workspace clean after create/update commands and records the new backend hash as the synced base.
For successful deletes, return a delete update target to remove the local projection, manifest entry, and base snapshot:

```ts
import { createWritableProjectionDeleteTarget } from '@movscript/editable-projections'

return {
  updateTargets: [
    createWritableProjectionDeleteTarget({
      adapter: assetProjectionAdapter,
      path: command.filePath,
      entityId: command.entityId,
    }),
  ],
}
```

## Merge Model

For writable projections, the framework compares:

```text
base   = last synced file snapshot
local  = current file draft
remote = current backend projection
```

Disjoint JSON object edits are merged automatically. Same-field edits become conflicts unless the adapter provides a custom `merge` implementation.
If the base snapshot cannot be parsed or fails adapter validation, `applyReview` reports a blocked operation instead of executing commands from an unsafe merge base.

## Guardrails

- Generated indexes and materialized views are blocked from apply.
- Unknown schemas are blocked.
- Invalid local files are blocked.
- Invalid base snapshots are blocked before command planning.
- Adapter materialization and serialization failures are blocked before workspace writes.
- Non-JSON-compatible generated index and materialized view content is blocked before workspace writes.
- Adapter command generation failures are blocked before apply execution.
- Invalid manifests are rejected before workspace operations continue.
- Invalid update targets are rejected before workspace files or manifests are written.
- Duplicate update target paths are rejected before adapter materialization or workspace writes.
- Delete update targets with content, writable readonly projections, and readonly upserts without content are rejected before workspace writes.
- Failed update artifact writes attempt to roll back local files, base snapshots, and in-memory manifest entries for the current update call.
- Workspace paths, manifest paths, review artifact paths, update targets, and Node or memory stores reject parent-directory path segments.
- Concurrent remote changes require three-way merge.
- Same-field conflicts are surfaced in the review plan.
- Database writes must go through application services via commands.

## Errors

Framework errors carry stable `code` values so tools can branch without parsing messages.
`workflow.applyReview()`, `workflow.reviewAndApply()`, and `workspace.apply()` throw `ApplyReviewNotReadyError` for blocked or conflicting reviews unless `allowConflicts: true` is passed.
`workspace.update()` and workflow update calls throw `InvalidWorkspaceUpdateOptionsError` before writing files when update options are malformed. `workspace.apply()` validates `refreshMode` before executing commands.
`workspace.applyReview()` throws `InvalidWorkspaceReviewOptionsError` for malformed review options, and `workspace.apply()` throws `InvalidWorkspaceApplyOptionsError` for malformed apply options before executing commands.
Formatter helpers and workflow markdown rendering throw `InvalidFormatOptionsError` for malformed formatting options.
Workspace scans throw `InvalidEditableProjectionWorkspaceOptionsError` for malformed workspace options such as invalid `ignorePaths`.
Workflow apply calls throw `MissingCommandExecutorError` when neither the workflow nor the call provides an executor.
Workflow review artifact calls throw `MissingApplyReviewStoreError` when no review store is configured.
Review stores throw `MissingApplyReviewArtifactError` when a requested review artifact does not exist.
`LocalWorkspaceFileSystem.readFile()` and `MemoryWorkspaceFileSystem.readFile()` throw `MissingWorkspaceFileError` when a requested file does not exist.
`parseJsonProjection()` throws `InvalidJsonProjectionError` for malformed JSON content.

For CLI, MCP, HTTP, or worker boundaries, serialize errors before returning them:

```ts
import {
  formatSerializedEditableProjectionErrorMarkdown,
  isEditableProjectionErrorCode,
  isSerializedEditableProjectionError,
  parseSerializedEditableProjectionErrorJson,
  serializeEditableProjectionError,
  serializeEditableProjectionErrorJson,
} from '@movscript/editable-projections'

try {
  const result = await workflow.reviewAndApply('data/projects/1')
  return { ok: true, result }
} catch (error) {
  return { ok: false, error: serializeEditableProjectionError(error) }
}

function handleSerializedErrorJson(errorJson: string) {
  const error = parseSerializedEditableProjectionErrorJson(errorJson)
  if (isSerializedEditableProjectionError(error)) {
    console.error(formatSerializedEditableProjectionErrorMarkdown(error))
  }
  if (isEditableProjectionErrorCode(error.code)) {
    return { knownCode: error.code }
  }
  return { knownCode: undefined }
}

const errorJson = serializeEditableProjectionErrorJson(new Error('bad input'))
```

`editableProjectionErrorCodes` exposes the runtime list of supported framework error codes.
Use `serializeEditableProjectionErrorJson(error)` and `parseSerializedEditableProjectionErrorJson(json)` when the boundary persists or transports error payloads as JSON strings. Use `isSerializedEditableProjectionError(value)` before trusting a cross-boundary payload as a framework-style error object. Use `formatSerializedEditableProjectionErrorMarkdown(error)` when a CLI, MCP tool, HTTP handler, worker, or UI review pane needs stable human-readable diagnostics.

```ts
import {
  ApplyReviewNotReadyError,
  DuplicateProjectionAdapterError,
  InvalidApplyReviewError,
  InvalidFormatOptionsError,
  InvalidEditableProjectionKitOptionsError,
  InvalidEditableProjectionWorkflowOptionsError,
  InvalidWorkspaceApplyOptionsError,
  InvalidWorkspaceReviewOptionsError,
  InvalidJsonProjectionError,
  InvalidProjectionAdapterContractError,
  InvalidProjectionCommandResultError,
  InvalidEditableProjectionIntegrationContractError,
  InvalidEditableProjectionWorkflowContractError,
  InvalidEditableProjectionWorkspaceOptionsError,
  InvalidWorkspaceUpdateTargetError,
  InvalidWorkspaceUpdateOptionsError,
  InvalidWorkspaceManifestError,
  MissingApplyReviewArtifactError,
  MissingApplyReviewStoreError,
  MissingCommandExecutorError,
  MissingWorkspaceUpdateTargetArtifactError,
  MissingWorkspaceUpdateTargetStoreError,
  MissingWorkspaceFileError,
  StaleApplyReviewError,
  UnknownProjectionCommandError,
  WorkspacePathEscapeError,
} from '@movscript/editable-projections'

try {
  assertApplyReviewReady(review)
} catch (error) {
  if (error instanceof ApplyReviewNotReadyError) {
    console.error(error.gate.reasons)
  }
  if (error instanceof DuplicateProjectionAdapterError) {
    console.error(error.schema)
  }
  if (error instanceof InvalidApplyReviewError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidFormatOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidEditableProjectionKitOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidEditableProjectionWorkflowOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidWorkspaceApplyOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidWorkspaceReviewOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidJsonProjectionError) {
    console.error(error.projectionPath, error.causeMessage)
  }
  if (error instanceof InvalidProjectionAdapterContractError) {
    console.error(error.adapterSchema, error.issues)
  }
  if (error instanceof InvalidProjectionCommandResultError) {
    console.error(error.adapterSchema, error.issues)
  }
  if (error instanceof InvalidEditableProjectionIntegrationContractError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidEditableProjectionWorkflowContractError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidEditableProjectionWorkspaceOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidWorkspaceManifestError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidWorkspaceUpdateTargetError) {
    console.error(error.issues)
  }
  if (error instanceof InvalidWorkspaceUpdateOptionsError) {
    console.error(error.issues)
  }
  if (error instanceof MissingCommandExecutorError) {
    console.error(error.code)
  }
  if (error instanceof MissingApplyReviewArtifactError) {
    console.error(error.reviewPath)
  }
  if (error instanceof MissingApplyReviewStoreError) {
    console.error(error.code)
  }
  if (error instanceof MissingWorkspaceUpdateTargetArtifactError) {
    console.error(error.artifactPath)
  }
  if (error instanceof MissingWorkspaceUpdateTargetStoreError) {
    console.error(error.code)
  }
  if (error instanceof MissingWorkspaceFileError) {
    console.error(error.filePath)
  }
  if (error instanceof StaleApplyReviewError) {
    console.error(error.mismatches)
  }
}
```

Current codes:

- `apply_review_not_ready`
- `duplicate_adapter`
- `invalid_adapter_contract`
- `invalid_kit_options`
- `invalid_apply_review`
- `invalid_artifact_compatibility`
- `invalid_bridge_operation`
- `invalid_bridge_result`
- `invalid_apply_options`
- `invalid_review_options`
- `invalid_format_options`
- `invalid_json_projection`
- `invalid_command_result`
- `invalid_integration_contract`
- `invalid_result_artifact`
- `invalid_workspace_options`
- `invalid_manifest`
- `invalid_status_artifact`
- `invalid_update_target`
- `invalid_update_options`
- `invalid_workflow_contract`
- `invalid_workflow_options`
- `missing_executor`
- `missing_review_artifact`
- `missing_review_store`
- `missing_update_target_artifact`
- `missing_update_target_store`
- `missing_workspace_file`
- `path_escape`
- `stale_apply_review`
- `unknown_command`

## Quality Gates

```sh
pnpm --filter @movscript/editable-projections typecheck
pnpm --filter @movscript/editable-projections test
```

The test command builds ESM, CommonJS, and declaration files, checks a TypeScript consumer against the package exports, verifies the `npm pack --dry-run` file list, installs the generated tarball into a temporary consumer project, compiles a TypeScript consumer against that installed tarball, and runs the runtime test suite.

## Release Checklist

Before publishing or tagging a release:

- Run `pnpm --filter @movscript/editable-projections test`.
- Confirm `prepack` remains `npm run build` so `npm pack` and `npm publish` cannot use stale `dist` files.
- Confirm `pack:check` still rejects `src/`, `tests/`, `tsconfig.json`, and `tsconfig.consumer.json` from the published tarball.
- Confirm `package-install-smoke.test.mjs` still imports the installed tarball through ESM, CommonJS, and TypeScript for root, `node`, `testing`, examples, and `package.json` subpaths.
- Confirm `exports.test.mjs` snapshots every public entrypoint.
- Confirm `readme.test.mjs` keeps current error codes, public API policy, compatibility policy, integration checklist, testing harness quickstart, and quality gates synchronized with runtime exports.
- Confirm `docs/compatibility.md` still matches any artifact schema, error-code, package-export, or semver-policy changes.
