import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ProjectStatusRecipe = UiStatusRecipe

export function projectStatusRecipe(status?: string): ProjectStatusRecipe {
  return projectWorkflowStatus.recipe(status)
}

export function projectLaneStateRecipe(state?: string): ProjectStatusRecipe {
  return projectLaneStatus.recipe(state)
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

export function projectTaskStatusRecipe(status?: string): ProjectStatusRecipe {
  return projectTaskStatus.recipe(status)
}

export function projectReviewStatusRecipe(status?: string): ProjectStatusRecipe {
  return projectReviewStatus.recipe(status)
}

export function projectAiAssignmentRecipe(): ProjectStatusRecipe {
  return projectSystemStatus.recipe('ai_assigned')
}

export function projectErrorRecipe(): ProjectStatusRecipe {
  return projectSystemStatus.recipe('error')
}

const projectWorkflowStatus = defineFeatureStatusRecipeGroup('project.workflow.status', {
  done: 'success',
  production: 'info',
  editing: 'info',
  asset_prep: 'warning',
  default: 'neutral',
})

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

const projectTaskStatus = defineFeatureStatusRecipeGroup('project.task.status', {
  in_progress: 'info',
  submitted: 'warning',
  blocked: 'warning',
  changes_requested: 'danger',
  approved: 'success',
  default: 'neutral',
})

const projectReviewStatus = defineFeatureStatusRecipeGroup('project.review.status', {
  pending: 'warning',
  approved: 'success',
  changes_requested: 'danger',
  default: 'neutral',
})

const projectSystemStatus = defineFeatureStatusRecipeGroup('project.system.status', {
  ai_assigned: 'info',
  error: 'danger',
  default: 'neutral',
})
