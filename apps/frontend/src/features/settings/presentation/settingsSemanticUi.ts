import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type SettingsStatusRecipe = UiStatusRecipe

export function settingsSaveStatusRecipe(saved: boolean): SettingsStatusRecipe {
  return settingsSaveStatus.recipe(saved ? 'saved' : 'default')
}

const settingsSaveStatus = defineFeatureStatusRecipeGroup('settings.save.status', {
  saved: 'success',
  default: 'neutral',
})
