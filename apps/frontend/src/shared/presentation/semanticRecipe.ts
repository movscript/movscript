import * as styleSystemRuntime from '@movscript/ui/style-system'
import type {
  UiStatusRecipe,
  UiStatusRecipeGroup,
  UiStatusRecipeIntentMap,
} from '@movscript/ui/style-system'

type DefineStatusRecipeGroup = <const Namespace extends string, const IntentMap extends UiStatusRecipeIntentMap>(
  namespace: Namespace,
  intents: IntentMap,
) => UiStatusRecipeGroup<Namespace, IntentMap>

type StyleSystemRuntime = {
  defineStatusRecipeGroup?: DefineStatusRecipeGroup
  default?: unknown
}

export const defineFeatureStatusRecipeGroup: DefineStatusRecipeGroup = getDefineStatusRecipeGroup(
  styleSystemRuntime as StyleSystemRuntime,
)

export type { UiStatusRecipe }

function getDefineStatusRecipeGroup(runtime: StyleSystemRuntime): DefineStatusRecipeGroup {
  if (typeof runtime.defineStatusRecipeGroup === 'function') {
    return runtime.defineStatusRecipeGroup
  }

  const defaultExport = runtime.default
  if (typeof defaultExport === 'function') {
    return defaultExport as DefineStatusRecipeGroup
  }

  if (isRuntimeObject(defaultExport) && typeof defaultExport.defineStatusRecipeGroup === 'function') {
    return defaultExport.defineStatusRecipeGroup as DefineStatusRecipeGroup
  }

  throw new Error('@movscript/ui/style-system must export defineStatusRecipeGroup')
}

function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
