import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectBlockedSummaryRecipe,
  projectLaneStateRecipe,
  projectPriorityRecipe,
  projectReadinessRecipe,
} from './projectSemanticUi'

test('project workspace states map to UI semantic recipes', () => {
  assert.deepEqual(projectLaneStateRecipe('ready'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectLaneStateRecipe('active'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(projectLaneStateRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(projectPriorityRecipe('high'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(projectPriorityRecipe('medium'), { intent: 'warning', emphasis: 'soft' })

  assert.deepEqual(projectBlockedSummaryRecipe(1), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(projectBlockedSummaryRecipe(0), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectReadinessRecipe(70), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(projectReadinessRecipe(69), { intent: 'neutral', emphasis: 'soft' })
})
