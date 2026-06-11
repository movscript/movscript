import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ProjectSemanticRecipe = UiStatusRecipe

export function projectLaneStateRecipe(state?: string): ProjectSemanticRecipe {
  return projectLaneStatus.recipe(state)
}

export function projectPriorityRecipe(priority?: string): ProjectSemanticRecipe {
  return projectPriorityStatus.recipe(priority)
}

export function projectBlockedSummaryRecipe(blockedCount: number): ProjectSemanticRecipe {
  return projectBlockedSummaryStatus.recipe(blockedCount > 0 ? 'blocked' : 'clear')
}

export function projectReadinessRecipe(readiness: number): ProjectSemanticRecipe {
  return projectReadinessStatus.recipe(readiness >= 70 ? 'ready' : 'default')
}

const projectLaneStatus = defineFeatureStatusRecipeGroup('project.lane.status', {
  ready: 'success',
  active: 'info',
  blocked: 'warning',
  default: 'neutral',
})

const projectPriorityStatus = defineFeatureStatusRecipeGroup('project.priority.status', {
  high: 'danger',
  medium: 'warning',
  default: 'neutral',
})

const projectBlockedSummaryStatus = defineFeatureStatusRecipeGroup('project.blocked-summary.status', {
  clear: 'success',
  blocked: 'warning',
  default: 'neutral',
})

const projectReadinessStatus = defineFeatureStatusRecipeGroup('project.readiness.status', {
  ready: 'success',
  default: 'neutral',
})
