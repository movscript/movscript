import assert from 'node:assert/strict'
import test from 'node:test'

import {
  preProductionCandidateAvailabilityRecipe,
  preProductionCountRecipe,
  preProductionCoverageRecipe,
  preProductionWorkspaceRecipe,
  preProductionMissingCountRecipe,
  preProductionWorkspaceCountRecipe,
  preProductionWorkspaceDecisionRecipe,
  preProductionWorkspaceWorkspaceStatusRecipe,
  preProductionWorkspaceEntryChangeRecipe,
  preProductionQueueDetailRecipe,
  preProductionSlotActionRecipe,
} from './preProductionSemanticUi'

test('resource preparation states map to UI semantic recipes', () => {
  assert.deepEqual(preProductionQueueDetailRecipe(), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceRecipe(), { intent: 'info', emphasis: 'soft' })

  assert.deepEqual(preProductionCoverageRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(preProductionCoverageRecipe('pending'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(preProductionSlotActionRecipe('complete'), { intent: 'success', emphasis: 'soft' })

  assert.deepEqual(preProductionCountRecipe('missing'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(preProductionCountRecipe('candidate'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(preProductionCountRecipe('locked'), { intent: 'success', emphasis: 'soft' })

  assert.deepEqual(preProductionMissingCountRecipe(2), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(preProductionMissingCountRecipe(0), { intent: 'neutral', emphasis: 'soft' })

  assert.deepEqual(preProductionCandidateAvailabilityRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(preProductionCandidateAvailabilityRecipe(false), { intent: 'warning', emphasis: 'soft' })

  assert.deepEqual(preProductionWorkspaceWorkspaceStatusRecipe('applied'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceWorkspaceStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceWorkspaceStatusRecipe('workspace'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceEntryChangeRecipe('deleted'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceDecisionRecipe('submitted'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceDecisionRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(preProductionWorkspaceCountRecipe('submitted'), { intent: 'success', emphasis: 'soft' })
})
