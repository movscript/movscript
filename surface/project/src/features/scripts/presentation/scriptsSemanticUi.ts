import { defineStatusRecipeGroup as defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@movscript/ui/style-system'

export type ScriptsStatusRecipe = UiStatusRecipe

export function scriptReadinessRecipe(readiness: number): ScriptsStatusRecipe {
  return scriptsReadinessStatus.recipe(readiness >= 80 ? 'ready' : 'missing')
}

export function scriptStageRecipe(versionCount: number): ScriptsStatusRecipe {
  return scriptsReadinessStatus.recipe(versionCount > 0 ? 'ready' : 'missing')
}

export function scriptVersionStatusRecipe(saved: boolean): ScriptsStatusRecipe {
  return scriptsVersionStatus.recipe(saved ? 'saved' : 'draft')
}

export function scriptReadinessItemRecipe(done: boolean): ScriptsStatusRecipe {
  return scriptsReadinessStatus.recipe(done ? 'ready' : 'missing')
}

const scriptsReadinessStatus = defineFeatureStatusRecipeGroup('scripts.readiness.status', {
  ready: 'success',
  missing: 'warning',
  default: 'neutral',
})

const scriptsVersionStatus = defineFeatureStatusRecipeGroup('scripts.version.status', {
  saved: 'success',
  draft: 'warning',
  default: 'neutral',
})
