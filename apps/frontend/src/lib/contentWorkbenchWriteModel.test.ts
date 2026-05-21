import assert from 'node:assert/strict'
import test from 'node:test'

import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from './contentWorkbenchModel'
import {
  buildContentCandidateAttachmentPayload,
  buildContentUnitProposalPatch,
  buildContentUnitReorderPatchPlan,
  buildContentUnitTimelineMovePlan,
} from './contentWorkbenchWriteModel'

function record(input: Partial<ContentWorkbenchRecord> & Pick<ContentWorkbenchRecord, 'ID'>): ContentWorkbenchRecord {
  return input as ContentWorkbenchRecord
}

function row(input: Partial<ContentGenerationMomentRow>): ContentGenerationMomentRow {
  return {
    id: 'scene-20',
    moment: record({ ID: 20, title: '敲门' }),
    title: '敲门',
    scope: '',
    status: 'ready',
    priority: 'medium',
    progress: 0,
    productionIds: [1],
    units: [],
    references: [],
    referenceUsages: [],
    assetSlots: [],
    missingSlots: [],
    keyframes: [],
    scriptBlocks: [],
    previewTimelineItems: [],
    ...input,
  }
}

test('content workbench write model builds proposal patch and merges metadata', () => {
  const patch = buildContentUnitProposalPatch(
    record({ ID: 50, metadata_json: JSON.stringify({ existing: true }) }),
    {
      title: '手部特写',
      kind: 'shot',
      description: '手敲门',
      prompt: '生成手敲门',
      visual_plan: { blocking: '手靠近门' },
    },
  )

  assert.equal(patch.title, '手部特写')
  assert.equal(patch.status, undefined)
  assert.equal(JSON.parse(String(patch.metadata_json)).existing, true)
  assert.deepEqual(JSON.parse(String(patch.metadata_json)).visual_plan, { blocking: '手靠近门' })
})

test('content workbench write model builds only changed reorder patches', () => {
  const plan = buildContentUnitReorderPatchPlan(row({
    units: [
      record({ ID: 10, order: 1 }),
      record({ ID: 11, order: 2 }),
      record({ ID: 12, order: 3 }),
    ],
  }), 12, 10, 'before')

  assert.deepEqual(plan.patches, [
    { unitId: 12, payload: { order: 1 } },
    { unitId: 10, payload: { order: 2 } },
    { unitId: 11, payload: { order: 3 } },
  ])
  assert.deepEqual(buildContentUnitReorderPatchPlan(row({
    units: [record({ ID: 10, order: 1 }), record({ ID: 11, order: 2 })],
  }), 10, 10, 'after').patches, [])
})

test('content workbench write model updates an existing timeline item', () => {
  const plan = buildContentUnitTimelineMovePlan({
    row: row({
      units: [record({ ID: 50, production_id: 1, duration_sec: 6, order: 2 })],
      previewTimelineItems: [record({ ID: 80, content_unit_id: 50, preview_timeline_id: 70, duration_sec: 4, order: 5 })],
    }),
    unitId: 50,
    startSec: 12.34,
    previewTimelines: [],
  })

  assert.equal(plan.kind, 'update_item')
  assert.equal(plan.itemId, 80)
  assert.deepEqual(plan.payload, {
    preview_timeline_id: 70,
    start_sec: 12.3,
    duration_sec: 4,
    order: 5,
  })
})

test('content workbench write model creates a timeline item and missing timeline payload', () => {
  const plan = buildContentUnitTimelineMovePlan({
    row: row({
      units: [record({ ID: 50, production_id: 1, title: '手部特写', duration_sec: 6, order: 2 })],
      productionIds: [1],
    }),
    unitId: 50,
    startSec: 8,
    previewTimelines: [],
  })

  assert.equal(plan.kind, 'create_item')
  assert.equal(plan.timelineId, undefined)
  assert.deepEqual(plan.timelinePayload, {
    production_id: 1,
    name: '手部特写 时间轴',
    duration_sec: 14,
    is_primary: true,
    status: 'draft',
  })
  assert.deepEqual(plan.itemPayload, {
    production_id: 1,
    scene_moment_id: 20,
    content_unit_id: 50,
    kind: 'content_unit',
    label: '手部特写',
    start_sec: 8,
    duration_sec: 6,
    order: 2,
    status: 'draft',
  })
})

test('content workbench write model builds candidate attachment payload', () => {
  assert.deepEqual(buildContentCandidateAttachmentPayload(
    record({ ID: 60 }),
    { ID: 90, name: 'door.png' },
  ), {
    asset_slot_id: 60,
    resource_id: 90,
    source_type: 'upload',
    source_id: 90,
    score: 0.75,
    status: 'candidate',
    note: '内容编排主动上传：door.png',
  })
})
