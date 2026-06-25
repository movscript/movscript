import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectStandardsWorkspaceStatusRecipe,
  projectStandardsEnabledRuleRecipe,
  projectStandardsReadyRecipe,
  projectStandardsRequiredRuleRecipe,
} from './projectStandardsSemanticUi'

test('project standards recipes map standards-specific states', () => {
  assert.deepEqual(projectStandardsReadyRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectStandardsReadyRecipe(false), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(projectStandardsRequiredRuleRecipe(), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(projectStandardsEnabledRuleRecipe(false), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(projectStandardsWorkspaceStatusRecipe('applied'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectStandardsWorkspaceStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(projectStandardsWorkspaceStatusRecipe('workspace'), { intent: 'warning', emphasis: 'soft' })
})
