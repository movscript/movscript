import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ContentStatusRecipe = UiStatusRecipe

export function contentEntityStatusRecipe(status?: string): ContentStatusRecipe {
  return contentEntityStatus.recipe(status)
}

export function contentReadinessRecipe(ready: boolean): ContentStatusRecipe {
  return contentReadinessStatus.recipe(ready ? 'ready' : 'required')
}

export function contentOptionalReadinessRecipe(ready: boolean, required: boolean): ContentStatusRecipe {
  if (ready) return contentReadinessStatus.recipe('ready')
  return contentReadinessStatus.recipe(required ? 'required' : 'optional')
}

export function contentGapRecipe(count: number): ContentStatusRecipe {
  return contentGapStatus.recipe(count > 0 ? 'has_gap' : 'complete')
}

export function contentProgressRecipe(percent: number): ContentStatusRecipe {
  return contentProgressStatus.recipe(percent >= 70 ? 'healthy' : 'default')
}

export function contentInputStateRecipe(state: string): ContentStatusRecipe {
  return contentInputStatus.recipe(state)
}

export function contentWorkbenchStatusRecipe(status?: string): ContentStatusRecipe {
  return contentWorkbenchStatus.recipe(status)
}

export function contentReviewQueueRecipe(state?: string): ContentStatusRecipe {
  return contentReviewQueueStatus.recipe(state)
}

export function contentKeyframeGenerationRecipe(input: { running: boolean; hasOutput: boolean; failed: boolean }): ContentStatusRecipe {
  if (input.running) return contentKeyframeGenerationStatus.recipe('running')
  if (input.hasOutput) return contentKeyframeGenerationStatus.recipe('ready')
  if (input.failed) return contentKeyframeGenerationStatus.recipe('failed')
  return contentKeyframeGenerationStatus.recipe('default')
}

const contentEntityStatus = defineFeatureStatusRecipeGroup('content.entity.status', {
  confirmed: 'success',
  locked: 'success',
  accepted: 'success',
  attached: 'success',
  active: 'info',
  candidate: 'info',
  generated: 'info',
  in_production: 'info',
  missing: 'warning',
  pending: 'warning',
  review: 'warning',
  waiting: 'warning',
  blocked: 'danger',
  failed: 'danger',
  rejected: 'danger',
  default: 'neutral',
})

const contentReadinessStatus = defineFeatureStatusRecipeGroup('content.readiness.status', {
  ready: 'success',
  required: 'warning',
  optional: 'neutral',
  default: 'neutral',
})

const contentGapStatus = defineFeatureStatusRecipeGroup('content.gap.status', {
  complete: 'success',
  has_gap: 'warning',
  default: 'neutral',
})

const contentProgressStatus = defineFeatureStatusRecipeGroup('content.progress.status', {
  healthy: 'success',
  default: 'neutral',
})

const contentInputStatus = defineFeatureStatusRecipeGroup('content.input.status', {
  success: 'success',
  ready: 'success',
  warning: 'warning',
  blocked: 'warning',
  required: 'warning',
  default: 'neutral',
})

const contentWorkbenchStatus = defineFeatureStatusRecipeGroup('content.workbench.status', {
  blocked: 'warning',
  ready: 'success',
  default: 'neutral',
})

const contentReviewQueueStatus = defineFeatureStatusRecipeGroup('content.review.queue.status', {
  processed: 'success',
  needs_review: 'warning',
  pending_review: 'warning',
  default: 'neutral',
})

const contentKeyframeGenerationStatus = defineFeatureStatusRecipeGroup('content.keyframe.generation.status', {
  running: 'neutral',
  ready: 'success',
  failed: 'danger',
  default: 'neutral',
})
