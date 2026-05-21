import assert from 'node:assert/strict'
import test from 'node:test'

import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from './contentWorkbenchModel'
import {
  buildContentWorkbenchFilteredRows,
  buildContentWorkbenchProductionFilterOptions,
  buildContentWorkbenchProductionRows,
  buildContentWorkbenchSceneMomentFilterOptions,
  buildContentWorkbenchSegmentFilterOptions,
  buildContentWorkbenchVisibleRows,
  contentWorkbenchSelectedRow,
  contentWorkbenchSelectedUnit,
  readContentWorkbenchLinkedIds,
} from './contentWorkbenchPageController'

function record(input: Partial<ContentWorkbenchRecord> & Pick<ContentWorkbenchRecord, 'ID'>): ContentWorkbenchRecord {
  return input as ContentWorkbenchRecord
}

function row(input: {
  id: string
  title: string
  momentId: number
  productionIds?: number[]
  segmentId?: number
  units?: ContentWorkbenchRecord[]
}): ContentGenerationMomentRow {
  return {
    id: input.id,
    title: input.title,
    scope: '',
    status: 'ready',
    priority: 'medium',
    progress: 0,
    moment: record({ ID: input.momentId, scene_code: `S${input.momentId}` }),
    productionIds: input.productionIds ?? [],
    segment: input.segmentId ? record({ ID: input.segmentId, name: `段${input.segmentId}` }) : undefined,
    references: [],
    referenceUsages: [],
    units: input.units ?? [],
    assetSlots: [],
    missingSlots: [],
    keyframes: [],
    scriptBlocks: [],
    previewTimelineItems: [],
  }
}

test('content workbench page controller filters rows by production, segment, and search', () => {
  const rows = [
    row({ id: 'a', title: '雨巷开场', momentId: 1, productionIds: [10], segmentId: 20 }),
    row({ id: 'b', title: '室内对白', momentId: 2, productionIds: [11] }),
    row({ id: 'c', title: '无归属', momentId: 3 }),
  ]

  assert.deepEqual(buildContentWorkbenchProductionRows(rows, '10').map((item) => item.id), ['a'])
  assert.deepEqual(buildContentWorkbenchProductionRows(rows, 'unassigned').map((item) => item.id), ['c'])
  assert.deepEqual(buildContentWorkbenchFilteredRows(rows, '20').map((item) => item.id), ['a'])
  assert.deepEqual(buildContentWorkbenchFilteredRows(rows, 'unassigned').map((item) => item.id), ['b', 'c'])
  assert.deepEqual(buildContentWorkbenchVisibleRows({
    rows,
    query: '雨巷',
    matchesSearch: (item, query) => item.title.includes(query),
  }).map((item) => item.id), ['a'])
})

test('content workbench page controller builds hierarchy filter options', () => {
  const rows = [
    row({ id: 'a', title: '雨巷开场', momentId: 1, productionIds: [10], segmentId: 20, units: [record({ ID: 100 })] }),
    row({ id: 'b', title: '室内对白', momentId: 2, productionIds: [10], segmentId: 20 }),
    row({ id: 'c', title: '无归属', momentId: 3 }),
  ]

  assert.deepEqual(buildContentWorkbenchProductionFilterOptions({
    rows,
    productions: [record({ ID: 10, title: '第一集' })],
  }), [
    { value: 'unassigned', label: '未绑定制作', count: 1 },
    { value: '10', label: '第一集', count: 2 },
  ])
  assert.deepEqual(buildContentWorkbenchSegmentFilterOptions(rows), [
    { value: 'unassigned', label: '未绑定情绪段', count: 1 },
    { value: '20', label: '段20', count: 2 },
  ])
  assert.deepEqual(buildContentWorkbenchSceneMomentFilterOptions(rows).map((option) => ({
    value: option.value,
    identifier: option.identifier,
    count: option.count,
  })), [
    { value: 'a', identifier: 'Scene S1', count: 1 },
    { value: 'b', identifier: 'Scene S2', count: 0 },
    { value: 'c', identifier: 'Scene S3', count: 0 },
  ])
})

test('content workbench page controller resolves linked ids and selected unit', () => {
  const unit = record({ ID: 100, scene_moment_id: 1 })
  const fallbackUnit = record({ ID: 101, scene_moment_id: 1 })
  const rows = [row({ id: 'a', title: '雨巷开场', momentId: 1, units: [unit] })]

  assert.deepEqual(readContentWorkbenchLinkedIds(new URLSearchParams('productionId=10&scene_moment_id=1&content_unit_id=100')), {
    linkedProductionId: 10,
    linkedSceneMomentId: 1,
    linkedContentUnitId: 100,
  })
  assert.equal(contentWorkbenchSelectedRow({ visibleRows: rows, selectedId: '', scopeLevel: 'scene_moment' })?.id, 'a')
  assert.equal(contentWorkbenchSelectedUnit({ selected: rows[0], selectedUnitId: 100, optimisticSelectedUnit: fallbackUnit })?.ID, 100)
  assert.equal(contentWorkbenchSelectedUnit({ selected: rows[0], selectedUnitId: 101, optimisticSelectedUnit: fallbackUnit })?.ID, 101)
})
