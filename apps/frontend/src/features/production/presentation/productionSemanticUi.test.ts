import assert from 'node:assert/strict'
import test from 'node:test'
import {
  productionChangeRecipe,
  productionPresenceRecipe,
  productionWorkspaceModeRecipe,
  productionReferencePresenceRecipe,
} from './productionSemanticUi'

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
