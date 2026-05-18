# Agent Schema Reference

This page documents the stable Agent schemas used by issue reports, support
bundles, and settings migration. The JSON Schemas remain the source of truth in
`contracts/agent/`; this document explains ownership and compatibility rules.

## Agent Debug Bundle v1

- Schema file: `contracts/agent/agent-debug-bundle-v1.schema.json`.
- Fixture file: `contracts/agent/agent-debug-bundle-v1.fixture.json`.
- Stable schema URL: `https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json`.
- Producer: Agent Debug page.
- Consumer intent: read-only support and issue-triage bundles.

Required top-level fields:

- `schema`, `schemaVersion`, `schemaUrl`, `redacted`, `exportedAt`.
- Runtime context: `baseURL`, `currentProject`, `runtime`, `lastUpdated`.
- Model context: `modelConfig`, `modelConfigError`.
- Observation context: `observationCoverage`, `evidenceChecklist`,
  `triageItems`, `runSummary`, `remediationPlan`, `runIssueGroups`,
  `warnings`, `warningGroups`, `preview`.

Compatibility rules:

- Bundles are always redacted before copy/download.
- Consumers must treat unknown additional properties as forward-compatible.
- Per-run step details remain in conversation details; Debug Bundle summarizes
  Runtime health, recent-run health, and read-only next-step routing.

## Agent Settings Snapshot v1

- Schema file: `contracts/agent/agent-settings-snapshot-v1.schema.json`.
- Fixture file: `contracts/agent/agent-settings-snapshot-v1.fixture.json`.
- Stable schema URL: `https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json`.
- Producer: Agent Settings page.
- Consumer intent: settings backup, migration, dry-run import, and selective
  section apply.

Required top-level fields:

- `schema`, `schemaVersion`, `schemaUrl`, `exportedAt`.

Optional migration sections:

- `modelConfig`: model ID, optional backend config ID, API mode, Base URL, and
  chat/planner route toggles.
- `defaultProfileId`: future-run default Profile.
- `skillPolicy`: enabled and disabled Skill rules.
- `toolPolicy`: tool allow/deny rules and approval mode.
- `runPresets` and `activeRunPresetId`: local run templates and selected
  template.

Compatibility rules:

- Snapshots reject unknown top-level properties.
- Import must run preflight validation before writing Runtime or local defaults.
- Import UI may apply named presets to select sections, but writing still
  requires dry-run/import actions.
- Exports must not include provider API keys, bearer tokens, or secret URL
  credentials.

## Static Gate

Run:

```bash
node --test tests/scripts/agent/verify-run-debugging.test.mjs
```

The gate checks schema IDs, fixtures, page ownership, documentation links, and
Settings/Debug boundary rules.
