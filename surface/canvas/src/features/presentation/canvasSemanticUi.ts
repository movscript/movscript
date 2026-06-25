import { defineStatusRecipeGroup as defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@movscript/ui/style-system'

export type CanvasStatusRecipe = UiStatusRecipe

export function canvasNodeStatusRecipe(status?: string): CanvasStatusRecipe {
  return canvasNodeStatus.recipe(status)
}

const canvasNodeStatus = defineFeatureStatusRecipeGroup('canvas.node.status', {
  done: 'success',
  pending: 'info',
  running: 'info',
  failed: 'danger',
  default: 'neutral',
})
