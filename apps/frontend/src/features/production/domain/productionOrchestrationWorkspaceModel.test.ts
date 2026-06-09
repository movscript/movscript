import assert from 'node:assert/strict'
import test from 'node:test'

import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { ExpressionUnitRecord } from './productionOrchestrationData'
import { buildProductionOrchestrationLookup } from '@/features/production/domain/productionOrchestrationEntityModel'
import {
  buildProductionSceneMomentReorderPatches,
  buildProductionSegmentReorderPatches,
  buildProductionOrchestrationWorkspaceView,
  compareProductionOrchestrationOrder,
  filterProductionContentUnitsForProduction,
  filterProductionSceneMomentsForSegments,
  filterProductionSegmentsForProduction,
  productionOrchestrationRecordTitle,
} from './productionOrchestrationWorkspaceModel'

function record(input: Partial<SemanticEntityRecord> & Pick<SemanticEntityRecord, 'ID'>): SemanticEntityRecord {
  return input as SemanticEntityRecord
}

function expressionUnit(input: Partial<ExpressionUnitRecord> & Pick<ExpressionUnitRecord, 'ID'>): ExpressionUnitRecord {
  return input as ExpressionUnitRecord
}

test('production orchestration workspace model filters current production graph', () => {
  const segments = [
    record({ ID: 2, production_id: 10, order: 2 }),
    record({ ID: 1, production_id: 10, order: 1 }),
    record({ ID: 3, production_id: 11, order: 3 }),
  ]
  const moments = [
    record({ ID: 20, segment_id: 2 }),
    record({ ID: 10, segment_id: 1 }),
    record({ ID: 30, segment_id: 3 }),
  ]
  const segmentIds = new Set([1, 2])
  const momentIds = new Set([10, 20])

  assert.deepEqual(filterProductionSegmentsForProduction(segments, 10).sort(compareProductionOrchestrationOrder).map((item) => item.ID), [1, 2])
  assert.deepEqual(filterProductionSceneMomentsForSegments(moments, segmentIds).map((item) => item.ID), [20, 10])
  assert.deepEqual(filterProductionContentUnitsForProduction([
    record({ ID: 100, production_id: 10 }),
    record({ ID: 101, segment_id: 2 }),
    record({ ID: 102, scene_moment_id: 10 }),
    record({ ID: 103, production_id: 11 }),
  ], 10, segmentIds, momentIds).map((item) => item.ID), [100, 101, 102])
})

test('production orchestration workspace model builds segment reorder patches', () => {
  const patches = buildProductionSegmentReorderPatches([
    record({ ID: 1, order: 1 }),
    record({ ID: 2, order: 2 }),
    record({ ID: 3, order: 3 }),
  ], 3, 1, 'before')

  assert.deepEqual(patches, [
    { segmentId: 3, payload: { order: 1 } },
    { segmentId: 1, payload: { order: 2 } },
    { segmentId: 2, payload: { order: 3 } },
  ])
})

test('production orchestration workspace model builds scene moment reorder patches across segments', () => {
  const patches = buildProductionSceneMomentReorderPatches({
    sceneMoments: [
      record({ ID: 10, segment_id: 1, order: 1 }),
      record({ ID: 11, segment_id: 1, order: 2 }),
      record({ ID: 20, segment_id: 2, order: 1 }),
      record({ ID: 21, segment_id: 2, order: 2 }),
    ],
    draggedMomentId: 11,
    targetSegmentId: 2,
    targetMomentId: 20,
    position: 'after',
  })

  assert.deepEqual(patches, [
    { momentId: 11, payload: { order: 2, segment_id: 2 } },
    { momentId: 21, payload: { order: 3 } },
  ])
})

test('production orchestration workspace model appends scene moment into empty segment', () => {
  const patches = buildProductionSceneMomentReorderPatches({
    sceneMoments: [
      record({ ID: 10, segment_id: 1, order: 1 }),
      record({ ID: 11, segment_id: 1, order: 2 }),
    ],
    draggedMomentId: 10,
    targetSegmentId: 2,
    targetMomentId: null,
  })

  assert.deepEqual(patches, [
    { momentId: 11, payload: { order: 1 } },
    { momentId: 10, payload: { order: 1, segment_id: 2 } },
  ])
})

test('production orchestration workspace model builds selected expression unit view', () => {
  const segments = [
    record({ ID: 1, title: '开场', summary: '建立气氛', kind: 'setup', order: 1 }),
    record({ ID: 2, title: '反转', summary: '制造冲突', kind: 'reversal', order: 2 }),
  ]
  const sceneMoments = [
    record({ ID: 10, segment_id: 1, scene_code: 'A01', title: '敲门', description: '主角听见敲门', action_text: '主角走向门口', script_block_id: 100 }),
    record({ ID: 11, segment_id: 1, scene_code: 'A02', title: '开门', description: '门外无人' }),
    record({ ID: 20, segment_id: 2, scene_code: 'B01', title: '发现线索' }),
  ]
  const scriptBlocks = [record({ ID: 100, content: '谁在外面？', kind: 'dialogue', speaker: '主角' })]
  const expressionUnits = [
    expressionUnit({ ID: 1000, scene_moment_id: 10, kind: 'dialogue', speaker: '主角', text: '谁？', order: 1 }),
  ]
  const contentUnits = [
    record({ ID: 200, scene_moment_id: 10, title: '门把手特写', kind: 'image' }),
  ]
  const lookup = buildProductionOrchestrationLookup({
    scriptText: 'INT. 门厅',
    scriptVersionTitle: 'v1',
    segments,
    sceneMoments,
    settings: [],
    settingUsages: [],
    assetSlots: [],
    contentUnits,
  })

  const view = buildProductionOrchestrationWorkspaceView({
    segments,
    sceneMoments,
    expressionUnits,
    scriptBlocks,
    selectedMomentId: 10,
    lookup,
  })

  assert.equal(view.selectedMoment?.ID, 10)
  assert.equal(view.selectedSegment?.ID, 1)
  assert.equal(view.selectedMomentScriptBlock?.ID, 100)
  assert.deepEqual(view.selectedMomentContentUnits.map((item) => item.ID), [200])
  assert.deepEqual(view.expressionLines.map((line) => line.text), ['谁？'])
  assert.equal(view.selectedSegmentLineCount, 2)
  assert.equal(view.expressionProgressLabel, '1 条表达')
  assert.deepEqual(view.segmentNavigatorItems.map((item) => ({
    id: item.id,
    title: item.title,
    kindLabel: item.kindLabel,
    active: item.active,
    moments: item.moments.map((moment) => ({
      id: moment.id,
      identifier: moment.identifier,
      lineCount: moment.lineCount,
      active: moment.active,
    })),
  })), [
    {
      id: 1,
      title: '开场',
      kindLabel: '铺垫',
      active: true,
      moments: [
        { id: 10, identifier: 'Scene A01', lineCount: 1, active: true },
        { id: 11, identifier: 'Scene A02', lineCount: 1, active: false },
      ],
    },
    {
      id: 2,
      title: '反转',
      kindLabel: '反转',
      active: false,
      moments: [
        { id: 20, identifier: 'Scene B01', lineCount: 0, active: false },
      ],
    },
  ])
})

test('production orchestration workspace model preserves empty selection', () => {
  const segments = [record({ ID: 1, title: '开场', kind: 'setup', order: 1 })]
  const sceneMoments = [record({ ID: 10, segment_id: 1, scene_code: 'A01', title: '敲门' })]
  const lookup = buildProductionOrchestrationLookup({
    scriptText: '',
    scriptVersionTitle: '',
    segments,
    sceneMoments,
    settings: [],
    settingUsages: [],
    assetSlots: [],
    contentUnits: [],
  })

  const view = buildProductionOrchestrationWorkspaceView({
    segments,
    sceneMoments,
    expressionUnits: [],
    scriptBlocks: [],
    selectedMomentId: null,
    lookup,
  })

  assert.equal(view.selectedMoment, null)
  assert.equal(view.selectedSegment, null)
  assert.deepEqual(view.segmentNavigatorItems.map((item) => ({
    active: item.active,
    moments: item.moments.map((moment) => moment.active),
  })), [{ active: false, moments: [false] }])
})

test('production orchestration workspace model falls back to readable record titles', () => {
  assert.equal(productionOrchestrationRecordTitle(record({ ID: 8, name: '制作标题' })), '制作标题')
  assert.equal(productionOrchestrationRecordTitle(record({ ID: 9 })), '#9')
  assert.equal(productionOrchestrationRecordTitle(null), '#-')
})
