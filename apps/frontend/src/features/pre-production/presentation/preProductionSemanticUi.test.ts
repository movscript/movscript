import assert from 'node:assert/strict'
import test from 'node:test'

import {
  preProductionCandidateAvailabilityRecipe,
  preProductionCountRecipe,
  preProductionCoverageRecipe,
  preProductionDraftRecipe,
  preProductionMissingCountRecipe,
  preProductionProposalCountRecipe,
  preProductionProposalDecisionRecipe,
  preProductionProposalDraftStatusRecipe,
  preProductionProposalEntryChangeRecipe,
  preProductionQueueDetailRecipe,
  preProductionSlotActionRecipe,
} from './preProductionSemanticUi'

test('resource preparation states map to UI semantic recipes', () => {
  assert.deepEqual(preProductionQueueDetailRecipe(), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(preProductionDraftRecipe(), { intent: 'info', emphasis: 'soft' })

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

  assert.deepEqual(preProductionProposalDraftStatusRecipe('applied'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(preProductionProposalDraftStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(preProductionProposalDraftStatusRecipe('draft'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(preProductionProposalEntryChangeRecipe('deleted'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(preProductionProposalDecisionRecipe('submitted'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(preProductionProposalDecisionRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(preProductionProposalCountRecipe('submitted'), { intent: 'success', emphasis: 'soft' })
})
