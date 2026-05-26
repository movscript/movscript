import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ProductionStatusRecipe = UiStatusRecipe

export function productionStatusRecipe(status?: string): ProductionStatusRecipe {
  return productionWorkflowStatus.recipe(status)
}

export function productionUnitStatusRecipe(status?: string): ProductionStatusRecipe {
  return productionUnitStatus.recipe(status)
}

export function productionEntityStatusRecipe(status?: string): ProductionStatusRecipe {
  return productionEntityStatus.recipe(status)
}

export function productionPresenceRecipe(present: boolean): ProductionStatusRecipe {
  return productionPresenceStatus.recipe(present ? 'present' : 'missing')
}

export function productionReferencePresenceRecipe(input: { linkedCount: number; visibleCount: number }): ProductionStatusRecipe {
  if (input.linkedCount > 0) return productionReferencePresenceStatus.recipe('linked')
  if (input.visibleCount > 0) return productionReferencePresenceStatus.recipe('visible')
  return productionReferencePresenceStatus.recipe('missing')
}

export function productionChangeRecipe(change: 'before' | 'after' | 'blocked'): ProductionStatusRecipe {
  return productionChangeStatus.recipe(change)
}

export function productionProposalModeRecipe(active: boolean): ProductionStatusRecipe {
  return productionProposalModeStatus.recipe(active ? 'active' : 'default')
}

const productionWorkflowStatus = defineFeatureStatusRecipeGroup('production.workflow.status', {
  delivered: 'success',
  approved: 'success',
  exported: 'success',
  previewing: 'info',
  producing: 'info',
  confirmed: 'info',
  materializing: 'warning',
  reviewing: 'warning',
  checking: 'warning',
  default: 'neutral',
})

const productionUnitStatus = defineFeatureStatusRecipeGroup('production.unit.status', {
  done: 'success',
  active: 'info',
  blocked: 'danger',
  failed: 'danger',
  rejected: 'danger',
  default: 'warning',
})

const productionEntityStatus = defineFeatureStatusRecipeGroup('production.entity.status', {
  accepted: 'success',
  active: 'success',
  confirmed: 'success',
  locked: 'success',
  candidate: 'info',
  in_production: 'info',
  missing: 'warning',
  blocked: 'danger',
  rejected: 'danger',
  default: 'neutral',
})

const productionPresenceStatus = defineFeatureStatusRecipeGroup('production.presence.status', {
  missing: 'warning',
  present: 'neutral',
  default: 'neutral',
})

const productionReferencePresenceStatus = defineFeatureStatusRecipeGroup('production.reference.presence.status', {
  linked: 'success',
  visible: 'neutral',
  missing: 'warning',
  default: 'neutral',
})

const productionChangeStatus = defineFeatureStatusRecipeGroup('production.change.status', {
  before: 'danger',
  after: 'success',
  blocked: 'warning',
  default: 'neutral',
})

const productionProposalModeStatus = defineFeatureStatusRecipeGroup('production.proposal.mode.status', {
  active: 'warning',
  default: 'neutral',
})
