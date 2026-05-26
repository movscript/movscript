import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'

export type DeliveryStatusRecipe = UiStatusRecipe

export function deliveryWorkbenchStatusRecipe(status?: string): DeliveryStatusRecipe {
  return deliveryWorkbenchStatus.recipe(status)
}

export function deliveryGateStatusRecipe(status?: string): DeliveryStatusRecipe {
  return deliveryGateStatus.recipe(status)
}

export function deliveryOverviewMetricRecipe(state?: string): DeliveryStatusRecipe {
  return deliveryOverviewMetricStatus.recipe(state)
}

export function deliveryTimelineItemRecipe(state?: string): DeliveryStatusRecipe {
  return deliveryTimelineItemStatus.recipe(state)
}

const deliveryWorkbenchStatus = defineFeatureStatusRecipeGroup('delivery.workbench.status', {
  approved: 'success',
  exported: 'success',
  locked: 'success',
  succeeded: 'success',
  checking: 'warning',
  needs_asset: 'warning',
  pending: 'warning',
  running: 'warning',
  confirmed: 'info',
  missing: 'danger',
  failed: 'danger',
  blocked: 'danger',
  default: 'neutral',
})

const deliveryGateStatus = defineFeatureStatusRecipeGroup('delivery.gate.status', {
  passed: 'success',
  blocked: 'danger',
  default: 'warning',
})

const deliveryOverviewMetricStatus = defineFeatureStatusRecipeGroup('delivery.overview.metric.status', {
  version_inventory: 'info',
  timeline_inventory: 'info',
  delivery_gaps: 'warning',
  delivery_ready: 'success',
  export_available: 'success',
  default: 'neutral',
})

const deliveryTimelineItemStatus = defineFeatureStatusRecipeGroup('delivery.timeline.item.status', {
  blocked: 'warning',
  ready: 'success',
  default: 'neutral',
})
