import assert from 'node:assert/strict'
import test from 'node:test'

import {
  scriptLibraryStatusRecipe,
  scriptReadinessItemRecipe,
  scriptReadinessRecipe,
  scriptStageRecipe,
} from './scriptsSemanticUi'

test('script workspace states map to UI semantic recipes', () => {
  assert.deepEqual(scriptLibraryStatusRecipe(true, 0), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(scriptLibraryStatusRecipe(false, 12), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(scriptLibraryStatusRecipe(false, 0), { intent: 'neutral', emphasis: 'soft' })

  assert.deepEqual(scriptReadinessRecipe(80), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(scriptReadinessRecipe(79), { intent: 'warning', emphasis: 'soft' })

  assert.deepEqual(scriptStageRecipe(1), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(scriptStageRecipe(0), { intent: 'warning', emphasis: 'soft' })

  assert.deepEqual(scriptReadinessItemRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(scriptReadinessItemRecipe(false), { intent: 'warning', emphasis: 'soft' })
})
