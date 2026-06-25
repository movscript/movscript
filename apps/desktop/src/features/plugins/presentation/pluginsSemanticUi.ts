import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type PluginsStatusRecipe = UiStatusRecipe

export function pluginInstallStatusRecipe(status?: string): PluginsStatusRecipe {
  return pluginInstallStatus.recipe(status)
}

const pluginInstallStatus = defineFeatureStatusRecipeGroup('plugins.install.status', {
  installed: 'success',
  installing: 'info',
  failed: 'danger',
  removable: 'warning',
  default: 'neutral',
})
