# Agent Settings And Debug Boundaries

This document fixes the product boundary between Agent Settings and Agent Debug
so future work does not mix persistent configuration with runtime observation.

## Principles

- Agent Settings is the control plane: it manages persistent configuration for
  future default runs.
- Agent Debug is the observability plane: it reads Runtime, context, preview,
  and recent run health.
- Per-run diagnostics belong to conversation details: steps, tool calls,
  approval waits, and run-specific errors are inspected from the run entry.
- The pages may link to each other, but write operations stay in Settings.

## Machine-Readable Contracts

- Debug Bundle schema: `contracts/agent/agent-debug-bundle-v1.schema.json`.
- Settings Snapshot schema:
  `contracts/agent/agent-settings-snapshot-v1.schema.json`.
- Static gate: `node --test tests/scripts/agent/verify-run-debugging.test.mjs`.

## Agent Settings Owns

Agent Settings should answer: how will future Agent runs behave by default?

Settings owns:

- Model call modes: backend gateway, OpenAI Responses, OpenAI Chat
  Completions, Anthropic Messages, and call-mode migration guidance.
- Model usage routes such as chat and planning.
- Provider model IDs, Base URLs, credential readiness, secret hygiene, and
  per-provider model compatibility probes.
- Skills management: install, uninstall, reload catalog, enable policy,
  dependency checks, conflict checks, version coverage, source, and trust
  posture.
- Profile work modes: default Profile, switch impact, and tool grant boundary.
- Tool permission policy: allow, deny, approval mode, save-before diff preview,
  search/filter for large catalogs, saved filter presets, bulk edits on filtered tools,
  and unsavable draft fixes.
- Run presets: create, duplicate, delete custom presets, permission mode, tool
  call limit, iteration limit, planning workers, timeouts, and retries.
- Settings snapshots: export, import, dry-run, selective section apply, impact
  preview, named import presets, and pre-import backup.
- Configuration readiness across model, API mode, credentials, routes, run
  presets, Profile, Skills, tool policy, and pending changes.
- Configuration action items: severity ordering, quick fixes, reasons,
  persistence hints, and audit.
- Settings audit for saves, tests, clears, quick fixes, operation failures, and
  imports/exports, with granular quick-fix audit categories.

Settings should not display per-run internal steps or duplicate Agent Debug
runtime observation panels.

## Agent Debug Owns

Agent Debug should answer: what is wrong with the current Runtime or recent
runs?

Debug owns:

- Runtime connection, catalog, capabilities, and MCP status.
- Read-only current model configuration and credential status.
- Prompt Preview, context summary, plan, and approval preview.
- Recent run lists grouped by failed, waiting, and in-progress states.
- Observation coverage for available and missing diagnostic signals.
- Triage that aggregates run failures, approval waits, and warning signals.
- Read-only remediation plan that routes the next step to Agent Settings, run
  details, Prompt Preview, or observation-only review without writing config.
- Redacted Debug Bundle copy/download.
- Links to Agent Settings for persistent configuration fixes.

Debug must not save models, edit Skills, edit Profiles, edit tool policy, or
write run presets.

## Conversation Details Own

Conversation details should answer: what happened in this specific run?

Conversation details retain:

- Run steps.
- Tool call inputs and outputs.
- Approval waits and user confirmations.
- Run-specific error stacks, traces, context packages, and result attachments.

Agent Debug may link to run details, but should not reimplement per-run
diagnostics.

## Remaining Maturity Gaps

- Restore complete dependency installation so TS/TSX contract tests and
  typecheck can run.
- Add cryptographic Skill signature verification once signed Skill bundles are
  available from Runtime.
- Add run preset sharing templates for teams once workspace-level settings are
  available.
- Publish the existing schema reference pages to the public documentation site
  once documentation hosting is wired.
