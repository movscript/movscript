import assert from 'node:assert/strict'
import test from 'node:test'

import { canvasNodeStatusRecipe } from './canvasSemanticUi'

test('canvas node statuses map to UI semantic recipes', () => {
  assert.deepEqual(canvasNodeStatusRecipe('done'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(canvasNodeStatusRecipe('pending'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(canvasNodeStatusRecipe('running'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(canvasNodeStatusRecipe('failed'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(canvasNodeStatusRecipe('idle'), { intent: 'neutral', emphasis: 'soft' })
})
