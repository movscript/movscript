import assert from 'node:assert/strict'
import test from 'node:test'

import type { MovScriptWorkspaceService } from '@movscript/core/workspace'
import { __setElectronMovScriptWorkspaceServiceFactoryForTest } from '@/shared/infrastructure/workspaceDomainRepository'
import {
  createProductionWritingExpressionWorkspaceEdit,
  deleteProductionWritingExpressionWorkspaceEdit,
  linkProductionSceneMomentReferenceWorkspaceEdit,
  saveProductionSceneMomentOrderWorkspaceEdit,
  saveProductionSegmentWorkspaceEdit,
  saveProductionWritingExpressionWorkspaceEdit,
  unlinkProductionSceneMomentReferenceWorkspaceEdit,
  type ProductionWorkspaceSnapshot,
} from './productionWorkspaceRepository'

test('production workspace repository saves segment edits through core service', async () => {
  const calls = withProductionService()
  try {
    await saveProductionSegmentWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      segmentId: 1,
      payload: {
        title: '新段落',
        kind: 'reversal',
        summary: '新的结构摘要',
      },
    })

    const saved = calls.snapshots[0]
    assert.equal(saved?.projectId, 9)
    assert.equal(saved?.productionId, 7)
    assert.equal(saved?.snapshot.segments[0]?.title, '新段落')
    assert.equal(saved?.snapshot.segments[0]?.kind, 'reversal')
    assert.equal(saved?.snapshot.segments[0]?.scene_moments?.[0]?.title, '情节一')
  } finally {
    calls.restore()
  }
})

test('production workspace repository saves scene moment reorder across segments', async () => {
  const calls = withProductionService()
  try {
    await saveProductionSceneMomentOrderWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      patches: [
        { momentId: 11, payload: { order: 1 } },
        { momentId: 10, payload: { order: 2, segment_id: 2 } },
      ],
    })

    const firstSegmentMoments = calls.snapshots[0]?.snapshot.segments[0]?.scene_moments ?? []
    const secondSegmentMoments = calls.snapshots[0]?.snapshot.segments[1]?.scene_moments ?? []
    assert.deepEqual(firstSegmentMoments.map((item) => item.id), [11])
    assert.deepEqual(secondSegmentMoments.map((item) => item.id), [20, 10])
    assert.equal(secondSegmentMoments[1]?.order, 2)
  } finally {
    calls.restore()
  }
})

test('production workspace repository saves writing expression changes through core service', async () => {
  const calls = withProductionService()
  try {
    await saveProductionWritingExpressionWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      target: { kind: 'writingExpressions', id: 100 },
      payload: {
        kind: 'dialogue',
        speaker: '林夏',
        text: '我看见了。',
        note: '压低声音',
        intent: '发现线索',
      },
    })

    const expression = calls.snapshots[0]?.snapshot.segments[0]?.scene_moments?.[0]?.writing_expressions?.[0]
    assert.equal(expression?.id, 100)
    assert.equal(expression?.kind, 'dialogue')
    assert.equal(expression?.speaker, '林夏')
    assert.equal(expression?.text, '我看见了。')
    assert.equal(expression?.intent, '发现线索')
  } finally {
    calls.restore()
  }
})

test('production workspace repository creates and deletes writing expressions through core service', async () => {
  const calls = withProductionService()
  const originalDateNow = Date.now
  Date.now = () => 123456
  try {
    await createProductionWritingExpressionWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      momentId: 11,
      order: 2,
      scriptBlockId: null,
    })
    const created = calls.snapshots[0]?.snapshot.segments[0]?.scene_moments?.[1]?.writing_expressions?.[0]
    assert.equal(created?.client_id, 'writing_expression_local_123456')
    assert.equal(created?.kind, 'dialogue')
    assert.equal(created?.order, 2)

    await deleteProductionWritingExpressionWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      expressionId: 100,
    })
    const deleted = calls.snapshots[1]?.snapshot.segments[0]?.scene_moments?.[0]?.writing_expressions?.[0]
    assert.equal(deleted?.id, 100)
    assert.equal(deleted?.__delete, true)
  } finally {
    Date.now = originalDateNow
    calls.restore()
  }
})

test('production workspace repository links and unlinks scene moment references through core service', async () => {
  const calls = withProductionService()
  try {
    await linkProductionSceneMomentReferenceWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      momentId: 11,
      reference: { ID: 501, name: '林夏', kind: 'person' },
      role: 'lead',
    })
    const linked = calls.snapshots[0]?.snapshot.segments[0]?.scene_moments?.[1]?.settings?.[0]
    assert.equal(linked?.id, 501)
    assert.equal(linked?.name, '林夏')
    assert.equal(linked?.role, 'lead')

    await unlinkProductionSceneMomentReferenceWorkspaceEdit({
      projectId: 9,
      productionId: 7,
      currentSnapshot: snapshot(),
      momentId: 10,
      referenceId: 500,
    })
    const unlinked = calls.snapshots[1]?.snapshot.segments[0]?.scene_moments?.[0]?.settings?.[0]
    assert.equal(unlinked?.id, 500)
    assert.equal(unlinked?.__delete, true)
  } finally {
    calls.restore()
  }
})

function snapshot(): ProductionWorkspaceSnapshot {
  return {
    segments: [
      {
        id: 1,
        title: '段落一',
        kind: 'setup',
        order: 1,
        scene_moments: [
          {
            id: 10,
            title: '情节一',
            order: 1,
            settings: [
              { id: 500, name: '旧设定', kind: 'person', role: 'supporting' },
            ],
            writing_expressions: [
              { id: 100, kind: 'dialogue', speaker: '旧说话人', text: '旧台词', order: 1 },
            ],
          },
          { id: 11, title: '情节二', order: 2 },
        ],
      },
      {
        id: 2,
        title: '段落二',
        kind: 'reversal',
        order: 2,
        scene_moments: [
          { id: 20, title: '情节三', order: 1 },
        ],
      },
    ],
  }
}

function withProductionService(): {
  snapshots: Array<{
    projectId?: string | number
    productionId: string | number
    snapshot: ProductionWorkspaceSnapshot
  }>
  restore: () => void
} {
  const snapshots: Array<{
    projectId?: string | number
    productionId: string | number
    snapshot: ProductionWorkspaceSnapshot
  }> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest(() => ({
    saveProductionSnapshot: async (input) => {
      snapshots.push({
        projectId: input.projectId,
        productionId: input.productionId,
        snapshot: input.snapshot as ProductionWorkspaceSnapshot,
      })
      return {
        productionPath: '',
        snapshot: input.snapshot,
        writtenPaths: [],
      }
    },
  } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService))
  return { snapshots, restore }
}
