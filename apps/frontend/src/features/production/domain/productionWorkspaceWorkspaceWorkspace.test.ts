import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionWorkspaceWorkspaceWorkspaceData,
  workspaceIdForWorkspaceNode,
} from './productionWorkspaceWorkspaceWorkspace'
import type { WorkspaceWorkspaceContent } from './productionWorkspaceReviewModel'

test('production workspace workspace workspace data mirrors ordinary orchestration records', () => {
  const workspace: WorkspaceWorkspaceContent = {
    mode: 'snapshot',
    productionId: 12,
    workspace: {
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
          writing_expressions: [{ client_id: 'expr-a', kind: 'action', speaker: '林夏', text: '林夏推门进入', intent: '动作推进' }],
          content_units: [{ client_id: 'unit-a', title: '动作条目', kind: 'action', description: '林夏推门进入' }],
        }],
      }],
    },
  }

  const data = buildProductionWorkspaceWorkspaceWorkspaceData(workspace, {
    productionId: 12,
    creativeReferences: [{ ID: 7, name: '林夏', kind: 'person' }],
  })

  assert.equal(data.segments.length, 1)
  assert.equal(data.sceneMoments.length, 1)
  assert.equal(data.writingExpressions.length, 1)
  assert.equal(data.contentUnits.length, 1)
  assert.equal(data.creativeReferenceUsages.length, 1)
  assert.equal(data.segments[0]?.ID, workspaceIdForWorkspaceNode('client:segment-a'))
  assert.equal(data.sceneMoments[0]?.segment_id, data.segments[0]?.ID)
  assert.equal(data.sceneMoments[0]?.script_block_id, undefined)
  assert.equal(data.writingExpressions[0]?.scene_moment_id, data.sceneMoments[0]?.ID)
  assert.equal(data.writingExpressions[0]?.text, '林夏推门进入')
  assert.equal(data.contentUnits[0]?.scene_moment_id, data.sceneMoments[0]?.ID)
  assert.equal(data.creativeReferenceUsages[0]?.owner_id, data.sceneMoments[0]?.ID)
  assert.equal(data.creativeReferenceUsages[0]?.creative_reference_id, 7)
  assert.equal(data.segmentKeyByWorkspaceId.get(data.segments[0]!.ID), 'client:segment-a')
  assert.deepEqual(data.sceneMomentKeyByWorkspaceId.get(data.sceneMoments[0]!.ID), {
    segmentKey: 'client:segment-a',
    momentKey: 'client:moment-a',
  })
  assert.deepEqual(data.writingExpressionKeyByWorkspaceId.get(data.writingExpressions[0]!.ID), {
    segmentKey: 'client:segment-a',
    momentKey: 'client:moment-a',
    expressionKey: 'client:expr-a',
  })
})
