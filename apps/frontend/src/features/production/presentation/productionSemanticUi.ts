import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ProductionSemanticRecipe = UiStatusRecipe

export function productionPresenceRecipe(present: boolean): ProductionSemanticRecipe {
  return productionPresenceStatus.recipe(present ? 'present' : 'missing')
}

export function productionReferencePresenceRecipe(input: { linkedCount: number; visibleCount: number }): ProductionSemanticRecipe {
  if (input.linkedCount > 0) return productionReferencePresenceStatus.recipe('linked')
  if (input.visibleCount > 0) return productionReferencePresenceStatus.recipe('visible')
  return productionReferencePresenceStatus.recipe('missing')
}

export function productionChangeRecipe(change: 'before' | 'after' | 'blocked'): ProductionSemanticRecipe {
  return productionChangeStatus.recipe(change)
}

export function productionWorkspaceModeRecipe(active: boolean): ProductionSemanticRecipe {
  return productionWorkspaceModeStatus.recipe(active ? 'active' : 'default')
}

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

const productionWorkspaceModeStatus = defineFeatureStatusRecipeGroup('production.workspace.mode.status', {
  active: 'warning',
  default: 'neutral',
})
