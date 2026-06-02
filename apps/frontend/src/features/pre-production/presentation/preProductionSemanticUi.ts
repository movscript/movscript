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

export function preProductionWorkspaceRecipe(): PreProductionStatusRecipe {
  return preProductionWorkspaceStatus.recipe('workspace')
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

export function preProductionWorkspaceWorkspaceStatusRecipe(status?: string): PreProductionStatusRecipe {
  return preProductionWorkspaceWorkspaceStatus.recipe(status)
}

export function preProductionWorkspaceEntryChangeRecipe(changeType?: string): PreProductionStatusRecipe {
  return preProductionWorkspaceEntryChangeStatus.recipe(changeType)
}

export function preProductionWorkspaceDecisionRecipe(decision?: 'submitted' | 'rejected'): PreProductionStatusRecipe {
  return preProductionWorkspaceDecisionStatus.recipe(decision)
}

export function preProductionWorkspaceCountRecipe(kind: 'deleted' | 'submitted' | 'rejected'): PreProductionStatusRecipe {
  return preProductionWorkspaceCountStatus.recipe(kind)
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

const preProductionWorkspaceStatus = defineFeatureStatusRecipeGroup('pre-production.workspace.status', {
  workspace: 'info',
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

const preProductionWorkspaceWorkspaceStatus = defineFeatureStatusRecipeGroup('pre-production.workspace.workspace.status', {
  applied: 'success',
  rejected: 'danger',
  workspace: 'warning',
  default: 'neutral',
})

const preProductionWorkspaceEntryChangeStatus = defineFeatureStatusRecipeGroup('pre-production.workspace.entry-change.status', {
  deleted: 'danger',
  default: 'neutral',
})

const preProductionWorkspaceDecisionStatus = defineFeatureStatusRecipeGroup('pre-production.workspace.decision.status', {
  submitted: 'success',
  rejected: 'danger',
  default: 'neutral',
})

const preProductionWorkspaceCountStatus = defineFeatureStatusRecipeGroup('pre-production.workspace.count.status', {
  submitted: 'success',
  deleted: 'danger',
  rejected: 'danger',
  default: 'neutral',
})
