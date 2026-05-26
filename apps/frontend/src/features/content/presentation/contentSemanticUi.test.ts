import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contentEntityStatusRecipe,
  contentGapRecipe,
  contentInputStateRecipe,
  contentKeyframeGenerationRecipe,
  contentOptionalReadinessRecipe,
  contentProgressRecipe,
  contentReadinessRecipe,
  contentReviewQueueRecipe,
  contentWorkbenchStatusRecipe,
} from './contentSemanticUi'

test('content entity statuses map to UI semantic recipes', () => {
  assert.deepEqual(contentEntityStatusRecipe('confirmed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentEntityStatusRecipe('candidate'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(contentEntityStatusRecipe('missing'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentEntityStatusRecipe('blocked'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(contentEntityStatusRecipe('draft'), { intent: 'neutral', emphasis: 'soft' })
})

test('content readiness recipes keep required and optional states distinct', () => {
  assert.deepEqual(contentReadinessRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentReadinessRecipe(false), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentOptionalReadinessRecipe(false, true), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentOptionalReadinessRecipe(false, false), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(contentGapRecipe(2), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentGapRecipe(0), { intent: 'success', emphasis: 'soft' })
})

test('content progress and input state recipes map grouped UI semantics', () => {
  assert.deepEqual(contentProgressRecipe(70), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentProgressRecipe(30), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(contentInputStateRecipe('success'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentInputStateRecipe('warning'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentInputStateRecipe('default'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(contentWorkbenchStatusRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentWorkbenchStatusRecipe('ready'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentWorkbenchStatusRecipe('running'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(contentReviewQueueRecipe('processed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentReviewQueueRecipe('needs_review'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentReviewQueueRecipe('pending_review'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(contentReviewQueueRecipe('empty'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(contentKeyframeGenerationRecipe({ running: true, hasOutput: false, failed: false }), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(contentKeyframeGenerationRecipe({ running: false, hasOutput: true, failed: false }), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(contentKeyframeGenerationRecipe({ running: false, hasOutput: false, failed: true }), { intent: 'danger', emphasis: 'soft' })
})
