import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type ScriptsStatusRecipe = UiStatusRecipe

export function scriptLibraryStatusRecipe(hasVersions: boolean, bodyLength: number): ScriptsStatusRecipe {
  if (hasVersions) return scriptsLibraryStatus.recipe('versioned')
  if (bodyLength > 0) return scriptsLibraryStatus.recipe('drafted')
  return scriptsLibraryStatus.recipe('default')
}

export function scriptReadinessRecipe(readiness: number): ScriptsStatusRecipe {
  return scriptsReadinessStatus.recipe(readiness >= 80 ? 'ready' : 'missing')
}

export function scriptVersionStatusRecipe(status: string): ScriptsStatusRecipe {
  return scriptsVersionStatus.recipe(status)
}

export function scriptStageRecipe(versionCount: number): ScriptsStatusRecipe {
  return scriptsReadinessStatus.recipe(versionCount > 0 ? 'ready' : 'missing')
}

export function scriptReadinessItemRecipe(done: boolean): ScriptsStatusRecipe {
  return scriptsReadinessStatus.recipe(done ? 'ready' : 'missing')
}

const scriptsLibraryStatus = defineFeatureStatusRecipeGroup('scripts.library.status', {
  versioned: 'success',
  drafted: 'warning',
  default: 'neutral',
})

const scriptsReadinessStatus = defineFeatureStatusRecipeGroup('scripts.readiness.status', {
  ready: 'success',
  missing: 'warning',
  default: 'neutral',
})

const scriptsVersionStatus = defineFeatureStatusRecipeGroup('scripts.version.status', {
  active: 'success',
  archived: 'neutral',
  default: 'warning',
})
