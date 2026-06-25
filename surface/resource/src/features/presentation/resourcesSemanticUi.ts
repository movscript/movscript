import { defineStatusRecipeGroup as defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@movscript/ui/style-system'

export type ResourcesStatusRecipe = UiStatusRecipe

export function resourceAvailabilityRecipe(available: boolean): ResourcesStatusRecipe {
  return resourceAvailabilityStatus.recipe(available ? 'available' : 'missing')
}

export function resourceBindingRecipe(bound: boolean): ResourcesStatusRecipe {
  return resourceBindingStatus.recipe(bound ? 'bound' : 'default')
}

const resourceAvailabilityStatus = defineFeatureStatusRecipeGroup('resources.availability.status', {
  available: 'success',
  missing: 'warning',
  default: 'neutral',
})

const resourceBindingStatus = defineFeatureStatusRecipeGroup('resources.binding.status', {
  bound: 'success',
  default: 'neutral',
})
