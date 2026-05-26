import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmptyAssetProposalDraftContent } from './assetProposalDraft'

test('buildEmptyAssetProposalDraftContent creates canonical snapshot shell', () => {
  const content = buildEmptyAssetProposalDraftContent({
    projectId: 7,
    assetSlotId: 12,
    slotName: '角色半身照',
    slotKind: 'image',
    description: '用于角色一致性参考。',
    promptHint: '正面站姿，干净背景。',
    ownerLabel: '设定资料 #3',
    referenceResourceIds: [21, 22],
    createdAt: '2026-05-21T00:00:00.000Z',
  })

  assert.equal(content.schema, 'movscript.asset_proposal.v1')
  assert.equal(content.scope, 'asset_proposal')
  assert.equal(content.mode, 'snapshot')
  assert.equal(content.projectId, 7)
  assert.equal(content.assetSlotId, 12)
  assert.equal(content.slot.id, 12)
  assert.equal(content.slot.name, '角色半身照')
  assert.deepEqual(content.proposal.creative_references, [])
  assert.deepEqual(content.proposal.asset_slots, [])
  assert.deepEqual(content.proposal.candidate_plans, [])
  assert.deepEqual(content.context.reference_resources, [
    { resource_id: 21, role: 'context' },
    { resource_id: 22, role: 'context' },
  ])
})
