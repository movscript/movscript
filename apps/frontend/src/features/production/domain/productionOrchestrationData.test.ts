import assert from 'node:assert/strict'
import test from 'node:test'

import { isActiveProductionOrchestrationRecord, PRODUCTION_ORCHESTRATION_ENTITY_KINDS } from './productionOrchestrationData'

test('production orchestration data loader covers the creative planning graph', () => {
  assert.deepEqual([...PRODUCTION_ORCHESTRATION_ENTITY_KINDS], [
    'productions',
    'segments',
    'sceneMoments',
    'creativeReferences',
    'creativeReferenceUsages',
    'assetSlots',
    'contentUnits',
    'scriptBlocks',
    'writingExpressions',
    'keyframes',
    'previewTimelines',
    'previewTimelineItems',
    'deliveryVersions',
  ])
})

test('production orchestration active record filter hides abandoned graph records', () => {
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 1, status: 'confirmed' }), true)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 2, status: 'ignored' }), false)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 3, status: 'removed' }), false)
  assert.equal(isActiveProductionOrchestrationRecord({ ID: 4, status: 'abandoned' }), false)
})
