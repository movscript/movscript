import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectStandardsDraftStatusRecipe,
  projectStandardsEnabledRuleRecipe,
  projectStandardsReadyRecipe,
  projectStandardsRequiredRuleRecipe,
} from './projectStandardsSemanticUi'

test('project standards recipes map standards-specific states', () => {
  assert.deepEqual(projectStandardsReadyRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectStandardsReadyRecipe(false), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(projectStandardsRequiredRuleRecipe(), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(projectStandardsEnabledRuleRecipe(false), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(projectStandardsDraftStatusRecipe('applied'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectStandardsDraftStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(projectStandardsDraftStatusRecipe('draft'), { intent: 'warning', emphasis: 'soft' })
})
