import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type OrganizationStatusRecipe = UiStatusRecipe

export function organizationSaveRecipe(saved: boolean): OrganizationStatusRecipe {
  return organizationBooleanStatus.recipe(saved ? 'enabled' : 'default')
}

export function organizationServerEnabledRecipe(enabledCount: number): OrganizationStatusRecipe {
  return organizationBooleanStatus.recipe(enabledCount > 0 ? 'enabled' : 'default')
}

export function organizationDefaultServerRecipe(isDefault: boolean): OrganizationStatusRecipe {
  return organizationBooleanStatus.recipe(isDefault ? 'enabled' : 'default')
}

const organizationBooleanStatus = defineFeatureStatusRecipeGroup('organization.boolean.status', {
  enabled: 'success',
  default: 'neutral',
})
