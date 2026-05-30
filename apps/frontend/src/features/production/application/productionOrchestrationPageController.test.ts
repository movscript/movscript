import assert from 'node:assert/strict'
import test from 'node:test'

import type { SceneMomentRecord } from '@/features/production/domain/productionOrchestrationData'
import {
  buildProductionOrchestrationSessionRestoreParams,
  buildProductionOrchestrationStaleContentUnitParams,
} from './productionOrchestrationPageController'

function moment(id: number): SceneMomentRecord {
  return { ID: id, project_id: 1, production_id: 3 } as SceneMomentRecord
}

test('production orchestration session restore keeps only valid production scene focus', () => {
  const restored = buildProductionOrchestrationSessionRestoreParams({
    searchParams: new URLSearchParams('view=review&scene_moment_id=99'),
    productionId: 3,
    sceneMoments: [moment(20)],
    sceneMomentId: 20,
  })

  assert.equal(restored.searchParams.get('productionId'), '3')
  assert.equal(restored.searchParams.get('scene_moment_id'), '20')
  assert.equal(restored.searchParams.get('view'), 'review')
  assert.equal(restored.restoredSceneMomentId, 20)

  const invalidMoment = buildProductionOrchestrationSessionRestoreParams({
    searchParams: new URLSearchParams('scene_moment_id=99'),
    productionId: 3,
    sceneMoments: [moment(20)],
    sceneMomentId: 99,
  })

  assert.equal(invalidMoment.searchParams.get('productionId'), '3')
  assert.equal(invalidMoment.searchParams.has('scene_moment_id'), false)
  assert.equal(invalidMoment.restoredSceneMomentId, null)
})

test('production orchestration clears stale content unit deep links', () => {
  const cleared = buildProductionOrchestrationStaleContentUnitParams({
    searchParams: new URLSearchParams('productionId=3&scene_moment_id=20&content_unit_id=900&view=review'),
    sceneMomentId: 20,
  })

  assert.equal(cleared.get('productionId'), '3')
  assert.equal(cleared.has('scene_moment_id'), false)
  assert.equal(cleared.has('content_unit_id'), false)
  assert.equal(cleared.get('view'), 'review')

  const preservedScene = buildProductionOrchestrationStaleContentUnitParams({
    searchParams: new URLSearchParams('scene_moment_id=21&content_unit_id=900'),
    sceneMomentId: 20,
  })

  assert.equal(preservedScene.get('scene_moment_id'), '21')
  assert.equal(preservedScene.has('content_unit_id'), false)
})
