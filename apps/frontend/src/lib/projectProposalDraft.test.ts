import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmptyProjectProposalDraftContent } from './projectProposalDraft'

test('buildEmptyProjectProposalDraftContent can seed editable snapshot content', () => {
  const content = buildEmptyProjectProposalDraftContent({
    projectId: 4,
    mode: 'snapshot',
    creativeReferences: [{
      id: 10,
      name: 'Lin Xia',
      kind: 'person',
    }],
    assetSlots: [{
      id: 20,
      owner: { type: 'creative_reference', id: 10 },
      name: 'Lin Xia front view',
      kind: 'image',
    }],
    summary: 'seeded snapshot',
  })

  assert.equal(content.projectId, 4)
  assert.equal(content.mode, 'snapshot')
  assert.equal(content.proposal.creative_references.length, 1)
  assert.equal(content.proposal.asset_slots.length, 1)
  assert.equal(content.proposal.creative_references[0].name, 'Lin Xia')
  assert.equal(content.proposal.asset_slots[0].owner?.id, 10)
})
