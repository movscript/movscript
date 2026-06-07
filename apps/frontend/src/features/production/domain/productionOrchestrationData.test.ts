import assert from 'node:assert/strict'
import test from 'node:test'

import { isActiveProductionOrchestrationRecord, PRODUCTION_ORCHESTRATION_ENTITY_KINDS } from './productionOrchestrationData'

test('production orchestration data loader covers the creative planning graph', () => {
  assert.deepEqual([...PRODUCTION_ORCHESTRATION_ENTITY_KINDS], [
    'productions',
    'segments',
    'sceneMoments',
    'settings',
    'settingUsages',
    'assetSlots',
    'contentUnits',
    'scriptBlocks',
    'writingExpressions',
    'keyframes',
    'previewTimelines',
    'previewTimelineItems',
  ])
})

test('production orchestration active record filter hides deleted graph records', () => {
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 1 }), true)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 2, __delete: true }), false)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 3, deleted: true }), false)
})
