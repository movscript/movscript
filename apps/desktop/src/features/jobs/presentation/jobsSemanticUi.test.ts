import assert from 'node:assert/strict'
import test from 'node:test'

import { jobStatusRecipe } from './jobsSemanticUi'

test('job statuses map to UI semantic recipes', () => {
  assert.deepEqual(jobStatusRecipe('pending'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(jobStatusRecipe('running'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(jobStatusRecipe('succeeded'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(jobStatusRecipe('failed'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(jobStatusRecipe('cancelled'), { intent: 'neutral', emphasis: 'soft' })
})
