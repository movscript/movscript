import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionOrchestrationLookup,
  createProductionOrchestrationDefaultsForType,
  productionOrchestrationOwnerKey,
} from './productionOrchestrationEntityModel'

test('production orchestration entity defaults stay scoped to the selected production and segment', () => {
  assert.deepEqual(createProductionOrchestrationDefaultsForType('segments', 12), {
    status: 'draft',
    kind: 'emotional_function',
    production_id: 12,
  })
  assert.deepEqual(createProductionOrchestrationDefaultsForType('assetSlots', 12, 34), {
    status: 'missing',
    production_id: 12,
    owner_type: 'segment',
    owner_id: 34,
  })
  assert.deepEqual(createProductionOrchestrationDefaultsForType('contentUnits', 12, 34, 56), {
    status: 'draft',
    production_id: 12,
    segment_id: 34,
    scene_moment_id: 56,
  })
  assert.deepEqual(createProductionOrchestrationDefaultsForType('writingExpressions', 12, 34, 56), {
    scene_moment_id: 56,
    kind: 'dialogue',
    order: 1,
  })
})

test('production orchestration lookup groups references and asset slots by owner and reference', () => {
  const lookup = buildProductionOrchestrationLookup({
    scriptText: 'INT. 房间',
    scriptVersionTitle: '剧本 v1',
    segments: [{ ID: 1, title: '开场' }],
    sceneMoments: [{ ID: 2, segment_id: 1, title: '敲门' }],
    contentUnits: [{ ID: 3, scene_moment_id: 2, title: '门把手特写' }],
    creativeReferences: [{ ID: 4, name: '主角' }],
    creativeReferenceUsages: [
      { ID: 5, owner_type: 'scene_moment', owner_id: 2, creative_reference_id: 4 },
    ],
    assetSlots: [
      { ID: 6, owner_type: 'scene_moment', owner_id: 2, creative_reference_id: 4, name: '手部参考' },
    ],
  })

  assert.equal(lookup.scriptText, 'INT. 房间')
  assert.equal(lookup.scriptVersionTitle, '剧本 v1')
  assert.equal(lookup.segmentById.get(1)?.title, '开场')
  assert.equal(lookup.sceneMomentById.get(2)?.title, '敲门')
  assert.equal(lookup.contentUnitById.get(3)?.title, '门把手特写')
  assert.equal(lookup.creativeReferenceById.get(4)?.name, '主角')
  assert.equal(lookup.usagesByOwnerKey.get('scene_moment:2')?.[0].ID, 5)
  assert.equal(lookup.usagesByReferenceId.get(4)?.[0].ID, 5)
  assert.equal(lookup.assetSlotsByOwnerKey.get('scene_moment:2')?.[0].ID, 6)
  assert.equal(lookup.assetSlotsByReferenceId.get(4)?.[0].ID, 6)
})

test('production orchestration owner key matches writing lookup conventions', () => {
  assert.equal(productionOrchestrationOwnerKey('scene_moment', 2), 'scene_moment:2')
})
