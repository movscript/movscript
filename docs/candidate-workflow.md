# Candidate Workflow

中文版本：[候选集工作流](./candidate-workflow.zh-CN.md)。

This note records the current product contract for AI-generated candidate media.
The user-facing action is **join candidate list**, not direct binding.

## Product Contract

- AI-generated media is reviewable until a user or work item accepts it.
- One target can hold multiple candidates.
- One generation job can return multiple `output_resource_id` values; each usable positive integer resource ID is written as a separate candidate.
- Candidate writes and accept / lock application both verify that the referenced raw resource exists.
- Candidate targets currently include asset slots and keyframes / visual anchors.
- Future visual-anchor-like targets should reuse the same candidate pattern instead of introducing direct binding.

## Target Types

Asset slot candidates:

- Write through `/projects/:projectId/entities/asset-slot-candidates`.
- Store `asset_slot_id`, `resource_id`, `status: candidate`, source provenance, and notes.
- Accepting a candidate locks the target asset slot, copies the selected resource to the target, and rejects siblings.
- Candidates without a real raw resource cannot be locked, even if an old record still carries a `resource_id`.
- The backend enforces the same resource check for direct `PATCH /asset-slot-candidates/:id` selection; UI disabled states are only a convenience layer.

Keyframe / visual anchor candidates:

- Write as a `keyframe` with `status: candidate` and `resource_id`.
- Mark generated candidates with `metadata_json.source = "ai_generated_keyframe_candidate"`.
- Store `metadata_json.target_keyframe_id` as the original keyframe / visual anchor.
- Direct `accepted` creation is rejected; acceptance must happen through a work item.
- Work-item acceptance requires the AI-generated candidate marker; legacy records that only carry `target_keyframe_id` are excluded from official context, but are not treated as valid AI candidates for acceptance.
- Accepting copies resource/canvas/description/prompt to the original target, marks the selected candidate accepted, and rejects sibling candidates.
- Generated and legacy keyframe candidates are excluded from official keyframe readiness, source-lock checks, preview output, and production / generation context lists.

## UI Behavior

- Generated result cards say `加入候选`.
- Results without `resourceId` remain visible but cannot be copied or joined to a candidate list.
- Non-positive, non-integer, or non-finite resource IDs are treated as missing resource IDs.
- Single-result controls add one resource to one target candidate list.
- Multi-result controls can add all usable resources to the same target candidate list.
- Workbench keyframe resource-library picks and uploads add a keyframe / visual-anchor candidate; they do not patch the official keyframe resource directly.
- Canvas output push actions add an asset-slot candidate; they do not patch or lock the target asset slot directly.
- Generic resource bindings do not backfill `asset_slot.resource_id`. Official adoption is owned by explicit candidate accept / lock flows.
- Generic semantic editing hides direct asset-slot and keyframe `resource_id` fields. Backend create / patch APIs reject direct asset-slot resource / lock adoption and direct keyframe resource adoption; candidate accept / lock flows use internal repository paths to apply official resources.
- If bulk writing partially succeeds, retry only submits failed / unwritten attachments so successful candidates are not duplicated.
- After a successful write, candidate consumers are invalidated across task, workbench, pre-production, overview, and production surfaces.

## Agent And MCP Contract

- `movscript_attach_asset_slot_candidate` adds one resource to an asset slot candidate set.
- `movscript_attach_keyframe_candidate` adds one resource to an original keyframe / visual anchor candidate set.
- Attach tool target IDs and resource IDs must be positive integers; non-positive IDs and conflicting aliases are rejected before any write.
- Agents must write every usable `output_resource_id` individually and report each success, failure, or blocker.
- Agents must not claim a resource joined a candidate set unless the attach tool succeeded.
- Agents must not pass an existing generated keyframe candidate as the keyframe target.
- Generic Agent draft apply cannot write `asset_slot.resource_id`, `asset_slot.locked_asset_slot_id`, or `keyframe.resource_id`; resource adoption must go through candidate attach plus explicit accept / lock flows.

## Verification

Focused checks that cover this contract:

```bash
# From the repository root.
cd apps/frontend
node --experimental-strip-types --test \
  src/api/semanticEntities.test.ts \
  electron/mcp/candidateParams.test.ts \
  electron/mcp/generation.test.ts \
  electron/mcp/serverCandidateContract.test.ts \
  src/lib/agentGenerationArtifacts.test.ts \
  src/lib/agentGenerationMedia.test.ts \
  src/lib/agentGenerationTraceFixtures.test.ts \
  src/lib/assetCandidateQueryInvalidation.test.ts \
  src/lib/agentGeneratedResourceBinding.test.ts \
  src/lib/agentGeneratedResultAttachments.test.ts \
  src/lib/tasksCandidateSelectionContract.test.ts \
  src/lib/contentWorkbenchUiContract.test.ts \
  src/lib/agentCatalogCandidateContract.test.ts \
  src/lib/preProductionCandidateLockContract.test.ts \
  src/lib/canvasCandidatePushContract.test.ts
```

```bash
cd ../backend
GOCACHE=/private/tmp/movscript-go-build-cache go test ./internal/app/workflow ./internal/app/semantic ./internal/domain/semantic ./internal/app/preview ./internal/interfaces/http/handler

# Broader backend regression after service or handler changes.
GOCACHE=/private/tmp/movscript-go-build-cache go test ./...

cd ../..
node tests/scripts/agent/candidate-feature-source.test.mjs
pnpm run test:scripts
pnpm --filter movscript-frontend test:generation-contract
pnpm run typecheck
node --test tests/scripts/agent/verify-compact-contract.test.mjs
node scripts/verify-script-manifest.mjs
```

Known verification blockers in a dependency-incomplete workspace:

- `pnpm --filter movscript-frontend test:generation-contract`, root `pnpm run typecheck`, full frontend typecheck, and TSX tests require frontend dependencies to be installed.
- Use `CI=true pnpm fetch --offline --frozen-lockfile` as a non-destructive offline store preflight before running install; it reports missing tarballs without rebuilding `node_modules`.
- `pnpm install --offline --frozen-lockfile` can fail with `ERR_PNPM_NO_OFFLINE_TARBALL` when the local store is missing packages such as `@radix-ui/react-toast`.
- `pnpm install --frozen-lockfile` can fail with `ENOTFOUND registry.npmjs.org` in a network-restricted sandbox.
- A failed `pnpm install` attempt can leave `node_modules` incomplete; rerun dependency installation before relying on dependency-based typecheck or E2E gates.
- Plugin build commands reuse the `apps/movcli` toolchain, so real plugin packaging requires the movcli workspace dependencies to be installed.
- Browser / Electron E2E requires a sandbox that can listen on local ports and launch the browser runtime.

Current local snapshot on 2026-05-18:

- Passed: focused candidate tests, backend `go test ./...`, `pnpm --filter movscript-frontend test:generation-contract`, root `pnpm run typecheck`, `pnpm run test:scripts`, `node tests/scripts/agent/candidate-feature-source.test.mjs`, and `git diff --check`.
- Blocked after dependency preflight: offline store is missing `@radix-ui/react-toast-1.2.15.tgz`; the failed offline install left `node_modules` incomplete, so dependency-based gates must be rerun after dependencies are restored.
- Not yet completed: browser / Electron E2E and the manual release acceptance checklist below.

## Release Acceptance Checklist

Run these checks after frontend dependencies are restored and the desktop workflow can start:

- Generate multiple image outputs in the AI assistant, add all usable outputs to one asset slot, and confirm multiple candidate rows exist while `asset_slot.resource_id` stays unset until explicit lock.
- Generate multiple keyframe outputs, add them to the original keyframe / visual anchor, and confirm generated candidates do not appear as official keyframes until work-item acceptance.
- Confirm a placeholder or no-resource result remains visible with candidate and copy actions disabled.
- Force a partial bulk write failure, retry, and confirm only failed / unwritten outputs are submitted again.
- Push a canvas output to an asset slot and confirm it creates a candidate without locking the target.
- Pick a keyframe resource from the Workbench library and upload a keyframe image; confirm both create keyframe candidates without direct official resource patches.
- Accept and reject asset-slot candidates from task / pre-production surfaces; confirm sibling rejection and missing-resource errors.
- Accept and reject keyframe candidates from task / workbench surfaces; confirm sibling rejection and generated-candidate marker requirements.
- Call `movscript_attach_asset_slot_candidate` and `movscript_attach_keyframe_candidate` with invalid IDs, conflicting aliases, and a generated candidate target; confirm they fail before write.
- Try generic semantic create / patch and Agent draft apply paths with official resource fields; confirm they are rejected or stripped.
