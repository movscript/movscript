import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

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
