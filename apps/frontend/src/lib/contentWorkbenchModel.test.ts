import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildContentGenerationMomentRows,
  buildGenerationContextRows,
  buildGenerationContextStandards,
  buildMomentStandards,
  contentWorkbenchNullableNumber,
  isVisibleContentWorkbenchRecord,
  type ContentWorkbenchRecord,
  type ProductionWorkbenchData,
} from './contentWorkbenchModel'

function record(input: Partial<ContentWorkbenchRecord> & Pick<ContentWorkbenchRecord, 'ID'>): ContentWorkbenchRecord {
  return input as ContentWorkbenchRecord
}

function data(input: Partial<ProductionWorkbenchData>): ProductionWorkbenchData {
  return {
    productions: [],
    segments: [],
    sceneMoments: [],
    creativeReferences: [],
    creativeReferenceUsages: [],
    contentUnits: [],
    assetSlots: [],
    keyframes: [],
    scriptBlocks: [],
    previewTimelines: [],
    previewTimelineItems: [],
    deliveryVersions: [],
    jobs: [],
    ...input,
  }
}

test('content workbench model builds scene moment rows with scoped units, references, assets, and keyframes', () => {
  const rows = buildContentGenerationMomentRows(data({
    productions: [record({ ID: 1, name: '第一集' })],
    segments: [record({ ID: 10, production_id: 1, title: '开场' })],
    sceneMoments: [record({ ID: 20, segment_id: 10, title: '敲门', description: '主角敲门', order: 1 })],
    creativeReferences: [record({ ID: 30, name: '主角' })],
    creativeReferenceUsages: [record({ ID: 40, owner_type: 'scene_moment', owner_id: 20, creative_reference_id: 30 })],
    contentUnits: [record({ ID: 50, scene_moment_id: 20, production_id: 1, title: '手部特写', description: '手敲门', order: 1 })],
    assetSlots: [record({ ID: 60, owner_type: 'content_unit', owner_id: 50, status: 'missing', name: '手部参考' })],
    keyframes: [record({ ID: 70, scene_moment_id: 20, title: '首帧', order: 1 })],
    scriptBlocks: [record({ ID: 80, title: '剧本块', order: 1 })],
    previewTimelines: [record({ ID: 90, production_id: 1, status: 'confirmed' })],
    previewTimelineItems: [record({ ID: 100, preview_timeline_id: 90, content_unit_id: 50 })],
  }))

  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, '敲门')
  assert.equal(rows[0].segment?.ID, 10)
  assert.deepEqual(rows[0].productionIds, [1])
  assert.equal(rows[0].units[0].ID, 50)
  assert.equal(rows[0].references[0].ID, 30)
  assert.equal(rows[0].assetSlots[0].ID, 60)
  assert.equal(rows[0].missingSlots[0].ID, 60)
  assert.equal(rows[0].keyframes[0].ID, 70)
  assert.equal(rows[0].previewTimelineItems[0].ID, 100)
  assert.equal(rows[0].status, 'blocked')
  assert.equal(rows[0].priority, 'high')
})

test('content workbench model filters hidden records and generated keyframe candidates', () => {
  const rows = buildContentGenerationMomentRows(data({
    sceneMoments: [record({ ID: 20, title: '敲门' })],
    creativeReferences: [
      record({ ID: 30, name: '主角' }),
      record({ ID: 31, name: '废弃设定', status: 'ignored' }),
    ],
    keyframes: [
      record({ ID: 70, scene_moment_id: 20, title: '正式关键帧' }),
      record({
        ID: 71,
        scene_moment_id: 20,
        metadata_json: JSON.stringify({
          source: 'ai_generated_keyframe_candidate',
          target_keyframe_id: 70,
          resource_id: 900,
        }),
      }),
    ],
  }))

  assert.equal(isVisibleContentWorkbenchRecord(record({ ID: 1, status: 'merged' })), false)
  assert.equal(rows[0].references.map((item) => item.ID).includes(31), false)
  assert.equal(rows[0].keyframes.map((item) => item.ID).includes(71), false)
})

test('content workbench model builds fallback and backend generation gates', () => {
  const [row] = buildContentGenerationMomentRows(data({
    sceneMoments: [record({ ID: 20, title: '敲门', description: '主角敲门' })],
    contentUnits: [record({ ID: 50, scene_moment_id: 20, title: '手部特写', description: '手敲门' })],
  }))
  const fallbackGates = buildMomentStandards(row, [])

  assert.equal(fallbackGates[0].done, true)
  assert.equal(fallbackGates[1].done, true)
  assert.equal(fallbackGates[3].done, true)

  const backendGates = buildGenerationContextStandards({
    target: { content_unit: { ID: 50, prompt: '生成手部特写' } },
    script_block: { ID: 80, start_line: 1, end_line: 3 },
    scene_moment: { ID: 20, title: '敲门' },
    creative_references: [{ reference: { ID: 30, name: '主角' } }],
    asset_slots: [{ ID: 60, status: 'locked', resource_id: 90 }],
    keyframes: [{ ID: 70, title: '首帧' }],
    constraints: { write_targets: ['content_unit'] },
  } as any)

  assert.equal(backendGates.every((gate) => gate.done), true)
})

test('content workbench model builds backend generation context rows', () => {
  const rows = buildGenerationContextRows({
    target: { content_unit: { ID: 50, prompt: '生成手部特写' } },
    script_block: { ID: 80, content: '他敲门。' },
    scene_moment: { ID: 20, action_text: '敲门' },
    creative_references: [{ reference: { ID: 30, name: '主角' } }],
    asset_slots: [{ ID: 60, status: 'missing' }],
    keyframes: [{ ID: 70, title: '首帧' }],
    constraints: { write_targets: ['content_unit', 'keyframe'] },
  } as any)

  assert.equal(rows[0].label, '后端目标')
  assert.match(rows[4].value, /1 个素材输入/)
  assert.equal(rows[6].value, 'content_unit、keyframe')
})

test('content workbench nullable number keeps payload ids clean', () => {
  assert.equal(contentWorkbenchNullableNumber(12), 12)
  assert.equal(contentWorkbenchNullableNumber('13'), 13)
  assert.equal(contentWorkbenchNullableNumber(0), null)
  assert.equal(contentWorkbenchNullableNumber(undefined), null)
})
