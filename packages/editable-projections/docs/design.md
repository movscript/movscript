# Editable Projections Design

`@movscript/editable-projections` turns backend-owned application data into a file workspace that agents, CLIs, and local tools can edit safely. The local files are drafts. `apply` is the only operation that converts drafts into backend mutations, and those mutations must go through application services.

The framework is intentionally domain-neutral. It does not know about MovScript projects, assets, orders, tickets, articles, or customers. A product integrates by supplying projection adapters, a backend reader, and a command executor.

```text
Backend owns truth.
Files own drafts.
Review owns intent.
Services own mutation.
Canonical refresh restores clean state.
```

## Why This Exists

Typed workspace editors are hard to scale across many product concepts. Every new entity needs a bespoke editing interface, and agents need to learn many tool shapes. A file projection workspace gives every integration the same workflow:

1. `update` materializes backend truth into local files.
2. A user, agent, CLI, or IDE edits those files.
3. `review` compares local drafts with base snapshots and latest backend truth.
4. `apply` executes reviewed domain commands through services.
5. Executor-returned canonical update targets refresh files, manifest, and base snapshots.

This is close to a Git working tree plus Terraform plan/apply, but without making Git or Terraform a runtime dependency.

## Core Boundary

The framework owns:

- Workspace path safety.
- Manifest and base snapshot bookkeeping.
- Update target validation.
- Local status, diff, merge, and stale-review checks.
- Apply review artifacts.
- Stable JSON artifacts for process and tool boundaries.
- Stable framework error codes.
- Contract tests and memory harnesses.

The product owns:

- Backend storage and service APIs.
- Projection schemas.
- Domain validation rules.
- Domain command shapes.
- Permission checks.
- Audit logging and durable database writes.
- Canonical entities returned after command execution.

This boundary is important: the framework should never become a generic database editor. Files express draft intent; services decide what may actually change.

## File Model

Use three file categories.

`Writable Projection`
: An editable file with exactly one owner for its writable facts. Review can turn changes in this file into domain commands.

`Generated Index`
: A read-only navigation file. It may duplicate labels, summaries, paths, counts, and status to make a workspace easy to browse. Apply must not treat these duplicated facts as authoritative edits.

`Materialized View`
: A read-only context file prepared for an agent or workflow. It can be markdown, JSON, or any file format a product adapter exposes as non-writable context.

The key rule is: every authoritative fact has one writable owner. Other files may reference or summarize it, but those copies are hints, not mutation sources.

## Avoid Database-Shaped Files

A one-file-per-database-row design is tempting, but it leaks table structure, foreign keys, internal columns, and service bypasses into the workspace. It also forces agents to understand storage internals.

A single giant aggregate document has the opposite problem: too much redundancy, broad conflicts, slow review, and unclear ownership.

Prefer product-level editable projections:

```text
projects/1/
  project.index.json
  project.json
  references/
    creative_reference_12.json
  assets/
    asset_1.json
  productions/
    production_1/
      production.json
      structure.json
      content_units/
        content_unit_101.json
```

`project.index.json` is navigation. `project.json`, `creative_reference_12.json`, `asset_1.json`, `structure.json`, and `content_unit_101.json` are separate writable projections only when each owns a distinct set of facts.

## Reference Model

References between files should be plain data, not hidden object pointers.

Use stable identity fields plus a path hint:

```json
{
  "entityType": "creative_reference",
  "entityId": 12,
  "label": "Zhang Jianguo",
  "path": "../../references/creative_reference_12.json"
}
```

Do not rely on JSON Schema `$ref` as the primary application reference model. `$ref` is useful for schema composition, but product references need stable identity, readable labels, and paths that agents can open directly. The path is a convenience hint; identity remains the source of truth for apply.

## Manifest And Snapshots

Business files should stay clean. Sync metadata belongs in framework control files.

The manifest records each tracked file path, projection kind, schema, entity type, entity id, base file hash, backend hash, and optional batch backend revision. The snapshot store keeps the last synced file content for three-way merge and stale-review checks.

This lets local files avoid embedded sync fields such as `baseHash`, `remoteHash`, or `lastSyncedAt`.

## Update Semantics

`update` writes local projections from backend truth and records clean base snapshots.

Modes:

- `safe`: refresh clean or missing files; block dirty local files.
- `overwrite`: replace local drafts with backend truth.
- `merge`: perform a three-way merge of base, local, and remote.

Backend refresh targets are explicit update targets. For writable projections, prefer helpers such as `createWritableProjectionUpdateTarget` so schema, kind, entity type, file content, and path validation stay consistent.

## Review Semantics

`review` is a local plan. It does not mutate the backend.

A review can contain:

- Planned creates, updates, and deletes.
- Blocked files, such as invalid JSON, readonly edits, or command generation failures.
- Conflicts, such as same-field concurrent edits.
- Commands produced by projection adapters.
- JSON patches and hashes used for auditability and stale-review checks.

Reviews are stable artifacts. They can be saved, shown in a UI, passed through MCP, approved later, and reloaded before apply.

## Apply Semantics

`apply` validates the review again, rejects stale reviews by default, then sends planned commands to the configured executor.

The executor must call product services. It should return canonical update targets representing the backend state after successful mutation. The framework then refreshes local files, manifest entries, and base snapshots from those canonical targets.

This keeps the workspace clean after apply and prevents local draft formatting or partial command results from becoming the new source of truth.

## Integration Shape

A product usually implements three pieces:

```text
BackendStore
  get current canonical entities for update, status, merge, and stale checks.

ProjectionAdapter
  parse, serialize, validate, materialize backend entities, and create domain commands.

CommandExecutor
  execute reviewed domain commands through services and return canonical update targets.
```

Minimal Node setup:

```ts
import { createNodeEditableProjectionKit } from '@movscript/editable-projections/node'

const { workflow } = createNodeEditableProjectionKit('/path/to/workdir', {
  adapters: [assetProjectionAdapter],
  backendStore,
  executor,
})

await workflow.update([assetUpdateTarget])

// Files are edited by an agent, IDE, CLI, or user.

const review = await workflow.reviewAndSave('.', 'current')
const applied = await workflow.loadAndApply('current')

console.log(review.markdown)
console.log(applied.markdown)
```

## Tool Integration

Hosts should expose small workflow operations instead of inventing product-specific edit tools for every entity.

Use `createEditableProjectionWorkflowToolAdapter(workflow)` to get tool definitions and dispatch helpers for operations such as `status`, `update`, `review`, `applyReview`, and `reviewAndApply`. Tool results use bridge envelopes so success and failure can cross MCP, HTTP, worker, or plugin boundaries without depending on thrown exceptions.

## Contract Tests

Every integration should keep contract tests close to the product adapter.

Use:

- `assertProjectionAdapterContract` for adapter parse, validate, serialize, projection, and command behavior.
- `assertEditableProjectionWorkflowContract` for update, edit, review, apply, canonical refresh, and final clean status.
- `assertEditableProjectionWorkflowToolAdapterContract` for tool definition and tool-call dispatch wiring.
- `assertEditableProjectionIntegrationContract` when a consuming app wants one end-to-end gate.

These tests are part of the framework product surface. They protect downstream integrations from accidentally depending on undocumented internals.

## Anti-Goals

The framework should not:

- Expose direct database writes.
- Treat generated indexes as editable authority.
- Hide product permissions inside local files.
- Require agents to understand table schemas.
- Make every backend row a public file contract by default.
- Depend on MovScript concepts in core APIs.
- Depend on a specific transport such as MCP, Electron, HTTP, or a CLI.

The framework is a controlled draft-to-command pipeline, not an ORM, CMS, sync engine, or database admin surface.
