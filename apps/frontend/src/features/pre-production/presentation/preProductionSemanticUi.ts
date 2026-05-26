import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'
import type { ProductionTermState } from '@/shared/domain/productionTerminology'

export type PreProductionStatusRecipe = UiStatusRecipe

export function preProductionQueueDetailRecipe(): PreProductionStatusRecipe {
  return preProductionQueueStatus.recipe('default')
}

export function preProductionCoverageRecipe(state: ProductionTermState): PreProductionStatusRecipe {
  return preProductionStateRecipe(state)
}

export function preProductionSlotActionRecipe(state: ProductionTermState): PreProductionStatusRecipe {
  return preProductionStateRecipe(state)
}

export function preProductionDraftRecipe(): PreProductionStatusRecipe {
  return preProductionDraftStatus.recipe('draft')
}

export function preProductionCountRecipe(kind: 'missing' | 'candidate' | 'locked'): PreProductionStatusRecipe {
  return preProductionCountStatus.recipe(kind)
}

export function preProductionMissingCountRecipe(count: number): PreProductionStatusRecipe {
  return preProductionMissingCountStatus.recipe(count > 0 ? 'missing' : 'default')
}

export function preProductionCandidateAvailabilityRecipe(canLock: boolean): PreProductionStatusRecipe {
  return preProductionCandidateAvailabilityStatus.recipe(canLock ? 'lockable' : 'blocked')
}

export function preProductionProposalDraftStatusRecipe(status?: string): PreProductionStatusRecipe {
  return preProductionProposalDraftStatus.recipe(status)
}

export function preProductionProposalEntryChangeRecipe(changeType?: string): PreProductionStatusRecipe {
  return preProductionProposalEntryChangeStatus.recipe(changeType)
}

export function preProductionProposalDecisionRecipe(decision?: 'submitted' | 'rejected'): PreProductionStatusRecipe {
  return preProductionProposalDecisionStatus.recipe(decision)
}

export function preProductionProposalCountRecipe(kind: 'deleted' | 'submitted' | 'rejected'): PreProductionStatusRecipe {
  return preProductionProposalCountStatus.recipe(kind)
}

function preProductionStateRecipe(state: ProductionTermState): PreProductionStatusRecipe {
  return preProductionTermStatus.recipe(state)
}

const preProductionQueueStatus = defineFeatureStatusRecipeGroup('pre-production.queue.status', {
  default: 'neutral',
})

const preProductionTermStatus = defineFeatureStatusRecipeGroup('pre-production.term.status', {
  blocked: 'warning',
  pending: 'info',
  active: 'info',
  ready: 'success',
  complete: 'success',
  default: 'neutral',
})

const preProductionDraftStatus = defineFeatureStatusRecipeGroup('pre-production.draft.status', {
  draft: 'info',
  default: 'neutral',
})

const preProductionCountStatus = defineFeatureStatusRecipeGroup('pre-production.count.status', {
  missing: 'warning',
  candidate: 'info',
  locked: 'success',
  default: 'neutral',
})

const preProductionMissingCountStatus = defineFeatureStatusRecipeGroup('pre-production.missing-count.status', {
  missing: 'warning',
  default: 'neutral',
})

const preProductionCandidateAvailabilityStatus = defineFeatureStatusRecipeGroup('pre-production.candidate-availability.status', {
  lockable: 'success',
  blocked: 'warning',
  default: 'neutral',
})

const preProductionProposalDraftStatus = defineFeatureStatusRecipeGroup('pre-production.proposal.draft.status', {
  applied: 'success',
  rejected: 'danger',
  draft: 'warning',
  default: 'neutral',
})

const preProductionProposalEntryChangeStatus = defineFeatureStatusRecipeGroup('pre-production.proposal.entry-change.status', {
  deleted: 'danger',
  default: 'neutral',
})

const preProductionProposalDecisionStatus = defineFeatureStatusRecipeGroup('pre-production.proposal.decision.status', {
  submitted: 'success',
  rejected: 'danger',
  default: 'neutral',
})

const preProductionProposalCountStatus = defineFeatureStatusRecipeGroup('pre-production.proposal.count.status', {
  submitted: 'success',
  deleted: 'danger',
  rejected: 'danger',
  default: 'neutral',
})
