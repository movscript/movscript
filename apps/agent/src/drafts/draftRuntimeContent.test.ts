import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assetProposalContainsAssetSlots,
  canonicalizeProjectStandardsProposalDraftContent,
  normalizeRuntimeDraftSource,
} from './draftRuntimeContent.js'
import type { BackendApplyResult } from './backendApplyClient.js'
import type { AgentDraft } from './draftStore.js'

test('assetProposalContainsAssetSlots detects concrete asset slots only', () => {
  assert.equal(assetProposalContainsAssetSlots(JSON.stringify({ proposal: { asset_slots: [{ id: 'slot_1' }] } })), true)
  assert.equal(assetProposalContainsAssetSlots(JSON.stringify({ proposal: { asset_slots: [] } })), false)
  assert.equal(assetProposalContainsAssetSlots('not json'), false)
})

test('canonicalizeProjectStandardsProposalDraftContent rebases asset proposals onto canonical snapshots', () => {
  const content = canonicalizeProjectStandardsProposalDraftContent(
    draft({ kind: 'asset_proposal', content: JSON.stringify({ mode: 'proposal', proposal: { note: 'keep' } }) }),
    backendApply({ canonical_snapshot: { asset_slots: [{ id: 'slot_1' }], creative_references: [{ id: 'ref_1' }] } }),
  )
  assert.deepEqual(JSON.parse(content ?? ''), {
    mode: 'snapshot',
    snapshot_base: { asset_slots: [{ id: 'slot_1' }], creative_references: [{ id: 'ref_1' }] },
    proposal: { note: 'keep', creative_references: [], asset_slots: [{ id: 'slot_1' }] },
  })
})

test('canonicalizeProjectStandardsProposalDraftContent preserves project standards proposal style without planning arrays', () => {
  const content = canonicalizeProjectStandardsProposalDraftContent(
    draft({ kind: 'project_standards_proposal', content: JSON.stringify({ proposal: { project_style: { tone: 'calm', custom_rules: [{ key: 'qa', label: 'QA', value: 'Check every output.' }] }, asset_slots: [{ id: 'old' }] } }) }),
    backendApply({ canonical_snapshot: { asset_slots: [{ id: 'slot_1' }] } }),
  )
  assert.deepEqual(JSON.parse(content ?? '').proposal, {
    project_style: { tone: 'calm', custom_rules: [{ key: 'qa', label: 'QA', value: 'Check every output.' }] },
  })
})

test('canonicalizeProjectStandardsProposalDraftContent rejects unsupported or malformed inputs', () => {
  assert.equal(canonicalizeProjectStandardsProposalDraftContent(draft({ kind: 'script' }), backendApply({ canonical_snapshot: {} })), undefined)
  assert.equal(canonicalizeProjectStandardsProposalDraftContent(draft({ content: 'not json' }), backendApply({ canonical_snapshot: {} })), undefined)
  assert.equal(canonicalizeProjectStandardsProposalDraftContent(draft(), backendApply({ other: true })), undefined)
})

test('canonicalizeProjectStandardsProposalDraftContent rejects non-finite canonical snapshots', () => {
  const content = canonicalizeProjectStandardsProposalDraftContent(
    draft({ kind: 'asset_proposal' }),
    backendApply({ canonical_snapshot: { asset_slots: [{ score: Number.POSITIVE_INFINITY }] } }),
  )

  assert.equal(content, undefined)
})

test('normalizeRuntimeDraftSource keeps known JSON-safe draft source fields', () => {
  assert.deepEqual(normalizeRuntimeDraftSource({
    entityType: 'script',
    entityId: 1,
    runId: 'run_1',
    pageKey: 'page',
    pageEntityId: 'entity_1',
    ignored: 'ignored',
  }), {
    entityType: 'script',
    entityId: 1,
    runId: 'run_1',
    pageKey: 'page',
    pageEntityId: 'entity_1',
  })
  assert.equal(normalizeRuntimeDraftSource({ ignored: 'ignored' }), undefined)
  assert.equal(normalizeRuntimeDraftSource({ entityType: Symbol('bad') }), undefined)
  assert.equal(normalizeRuntimeDraftSource({ entityId: Number.POSITIVE_INFINITY }), undefined)
})

test('normalizeRuntimeDraftSource drops invalid numeric business reference ids', () => {
  assert.deepEqual(normalizeRuntimeDraftSource({
    entityType: 'scene_moment',
    entityId: 0,
    pageEntityType: 'production',
    pageEntityId: 7.5,
    pageKey: 'production',
  }), {
    entityType: 'scene_moment',
    pageEntityType: 'production',
    pageKey: 'production',
  })
})

function draft(overrides: Partial<AgentDraft> = {}): AgentDraft {
  return {
    id: 'draft_1',
    kind: 'asset_proposal',
    title: 'Draft',
    content: JSON.stringify({ proposal: {} }),
    status: 'draft',
    createdAt: 'created',
    updatedAt: 'updated',
    ...overrides,
  }
}

function backendApply(response: NonNullable<BackendApplyResult['response']>): BackendApplyResult {
  return {
    performed: true,
    response,
  }
}
