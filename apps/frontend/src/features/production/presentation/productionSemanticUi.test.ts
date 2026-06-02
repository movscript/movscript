import assert from 'node:assert/strict'
import test from 'node:test'
import {
  productionChangeRecipe,
  productionEntityStatusRecipe,
  productionPresenceRecipe,
  productionWorkspaceModeRecipe,
  productionReferencePresenceRecipe,
  productionStatusRecipe,
  productionUnitStatusRecipe,
} from './productionSemanticUi'

test('production status recipes map grouped workflow states', () => {
  assert.deepEqual(productionStatusRecipe('delivered'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(productionStatusRecipe('producing'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(productionStatusRecipe('reviewing'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionStatusRecipe('planning'), { intent: 'neutral', emphasis: 'soft' })
})

test('production unit and entity statuses map to UI semantic recipes', () => {
  assert.deepEqual(productionUnitStatusRecipe('done'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(productionUnitStatusRecipe('active'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(productionUnitStatusRecipe('blocked'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(productionUnitStatusRecipe('waiting'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionEntityStatusRecipe('confirmed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(productionEntityStatusRecipe('candidate'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(productionEntityStatusRecipe('missing'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionEntityStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(productionEntityStatusRecipe('workspace'), { intent: 'neutral', emphasis: 'soft' })
})

test('production availability, diff, and timeline recipes keep business meaning explicit', () => {
  assert.deepEqual(productionPresenceRecipe(true), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(productionPresenceRecipe(false), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionReferencePresenceRecipe({ linkedCount: 1, visibleCount: 1 }), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(productionReferencePresenceRecipe({ linkedCount: 0, visibleCount: 1 }), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(productionReferencePresenceRecipe({ linkedCount: 0, visibleCount: 0 }), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionChangeRecipe('before'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(productionChangeRecipe('after'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(productionChangeRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionWorkspaceModeRecipe(true), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(productionWorkspaceModeRecipe(false), { intent: 'neutral', emphasis: 'soft' })
})
