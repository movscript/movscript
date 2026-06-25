import { defineStatusRecipeGroup as defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@movscript/ui/style-system'

export type ProjectStatusRecipe = UiStatusRecipe

export function projectLaneStateRecipe(state?: string): ProjectStatusRecipe {
  return projectLaneStatus.recipe(state)
}

export function projectStatusRecipe(state?: string): ProjectStatusRecipe {
  return projectStatus.recipe(state)
}

export function projectPriorityRecipe(priority?: string): ProjectStatusRecipe {
  return projectPriorityStatus.recipe(priority)
}

export function projectBlockedSummaryRecipe(blockedCount: number): ProjectStatusRecipe {
  return projectBlockedSummaryStatus.recipe(blockedCount > 0 ? 'blocked' : 'clear')
}

export function projectReadinessRecipe(readiness: number): ProjectStatusRecipe {
  return projectReadinessStatus.recipe(readiness >= 70 ? 'ready' : 'default')
}

const projectLaneStatus = defineFeatureStatusRecipeGroup('project.lane.status', {
  ready: 'success',
  active: 'info',
  blocked: 'warning',
  default: 'neutral',
})

const projectStatus = defineFeatureStatusRecipeGroup('project.status', {
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
