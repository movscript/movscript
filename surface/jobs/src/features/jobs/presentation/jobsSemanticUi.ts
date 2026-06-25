import { defineStatusRecipeGroup, type UiStatusRecipe } from '@movscript/ui/style-system'

export type JobsStatusRecipe = UiStatusRecipe

export function jobStatusRecipe(status?: string): JobsStatusRecipe {
  return jobStatus.recipe(status)
}

const jobStatus = defineStatusRecipeGroup('jobs.job.status', {
  pending: 'warning',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  default: 'neutral',
})
