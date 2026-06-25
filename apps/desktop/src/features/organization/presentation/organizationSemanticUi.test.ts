import assert from 'node:assert/strict'
import test from 'node:test'

import {
  organizationDefaultServerRecipe,
  organizationSaveRecipe,
  organizationServerEnabledRecipe,
} from './organizationSemanticUi'

test('organization status recipes map settings states to UI semantics', () => {
  assert.deepEqual(organizationSaveRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(organizationSaveRecipe(false), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(organizationServerEnabledRecipe(2), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(organizationServerEnabledRecipe(0), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(organizationDefaultServerRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(organizationDefaultServerRecipe(false), { intent: 'neutral', emphasis: 'soft' })
})
