import { defineStatusRecipeGroup as defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@movscript/ui/style-system'

export type ShotLibraryStatusRecipe = UiStatusRecipe

export function shotLibrarySourceStatusRecipe(status?: string): ShotLibraryStatusRecipe {
  return shotLibrarySourceStatus.recipe(status)
}

const shotLibrarySourceStatus = defineFeatureStatusRecipeGroup('shot-library.source.status', {
  ready: 'success',
  loading: 'info',
  failed: 'danger',
  default: 'neutral',
})
