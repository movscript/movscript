import assert from 'node:assert/strict'
import test from 'node:test'

import { PRODUCTION_ORCHESTRATION_ENTITY_KINDS } from './productionOrchestrationData'

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
  ])
})
