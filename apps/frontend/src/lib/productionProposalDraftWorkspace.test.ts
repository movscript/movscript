import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionProposalDraftWorkspaceData,
  workspaceIdForProposalNode,
} from './productionProposalDraftWorkspace'
import type { ProposalDraftContent } from './productionProposalReviewModel'

test('production proposal draft workspace data mirrors ordinary orchestration records', () => {
  const draft: ProposalDraftContent = {
    mode: 'snapshot',
    productionId: 12,
    proposal: {
      segments: [{
        client_id: 'segment-a',
        title: '段落 A',
        summary: '摘要 A',
        scene_moments: [{
          client_id: 'moment-a',
          title: '情节 A',
          script_block_id: null,
          time_text: '夜',
          location_text: '街口',
          action_text: '推门',
          creative_references: [{ id: 7, name: '林夏', role: 'protagonist' }],
          content_units: [{ client_id: 'unit-a', title: '动作条目', kind: 'action', description: '林夏推门进入' }],
        }],
      }],
    },
  }

  const data = buildProductionProposalDraftWorkspaceData(draft, {
    productionId: 12,
    creativeReferences: [{ ID: 7, name: '林夏', kind: 'person' }],
  })

  assert.equal(data.segments.length, 1)
  assert.equal(data.sceneMoments.length, 1)
  assert.equal(data.contentUnits.length, 1)
  assert.equal(data.creativeReferenceUsages.length, 1)
  assert.equal(data.segments[0]?.ID, workspaceIdForProposalNode('client:segment-a'))
  assert.equal(data.sceneMoments[0]?.segment_id, data.segments[0]?.ID)
  assert.equal(data.sceneMoments[0]?.script_block_id, undefined)
  assert.equal(data.contentUnits[0]?.scene_moment_id, data.sceneMoments[0]?.ID)
  assert.equal(data.creativeReferenceUsages[0]?.owner_id, data.sceneMoments[0]?.ID)
  assert.equal(data.creativeReferenceUsages[0]?.creative_reference_id, 7)
  assert.equal(data.segmentKeyByWorkspaceId.get(data.segments[0]!.ID), 'client:segment-a')
  assert.deepEqual(data.sceneMomentKeyByWorkspaceId.get(data.sceneMoments[0]!.ID), {
    segmentKey: 'client:segment-a',
    momentKey: 'client:moment-a',
  })
})
