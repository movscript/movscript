import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ProjectStandardsStatusRecipe = UiStatusRecipe

export function projectStandardsReadyRecipe(ready: boolean): ProjectStandardsStatusRecipe {
  return projectStandardsReadinessStatus.recipe(ready ? 'ready' : 'missing')
}

export function projectStandardsRequiredRuleRecipe(): ProjectStandardsStatusRecipe {
  return projectStandardsRuleStatus.recipe('required')
}

export function projectStandardsEnabledRuleRecipe(enabled: boolean): ProjectStandardsStatusRecipe {
  return projectStandardsRuleStatus.recipe(enabled ? 'enabled' : 'default')
}

export function projectStandardsDraftStatusRecipe(status?: string): ProjectStandardsStatusRecipe {
  return projectStandardsDraftStatus.recipe(status)
}

const projectStandardsReadinessStatus = defineFeatureStatusRecipeGroup('project-standards.readiness.status', {
  ready: 'success',
  missing: 'warning',
  default: 'neutral',
})

const projectStandardsRuleStatus = defineFeatureStatusRecipeGroup('project-standards.rule.status', {
  enabled: 'success',
  required: 'warning',
  default: 'neutral',
})

const projectStandardsDraftStatus = defineFeatureStatusRecipeGroup('project-standards.draft.status', {
  applied: 'success',
  rejected: 'danger',
  draft: 'warning',
  default: 'neutral',
})
