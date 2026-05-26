import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type JobsStatusRecipe = UiStatusRecipe

export function jobStatusRecipe(status?: string): JobsStatusRecipe {
  return jobStatus.recipe(status)
}

const jobStatus = defineFeatureStatusRecipeGroup('jobs.job.status', {
  pending: 'warning',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  default: 'neutral',
})
