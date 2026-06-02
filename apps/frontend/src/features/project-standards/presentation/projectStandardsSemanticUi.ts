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

export function projectStandardsWorkspaceStatusRecipe(status?: string): ProjectStandardsStatusRecipe {
  return projectStandardsWorkspaceStatus.recipe(status)
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

const projectStandardsWorkspaceStatus = defineFeatureStatusRecipeGroup('project-standards.workspace.status', {
  applied: 'success',
  rejected: 'danger',
  workspace: 'warning',
  default: 'neutral',
})
