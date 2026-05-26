import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deliveryGateStatusRecipe,
  deliveryOverviewMetricRecipe,
  deliveryTimelineItemRecipe,
  deliveryWorkbenchStatusRecipe,
} from './deliverySemanticUi'

test('delivery status recipes map delivery workflow states', () => {
  assert.deepEqual(deliveryWorkbenchStatusRecipe('approved'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(deliveryWorkbenchStatusRecipe('needs_asset'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(deliveryWorkbenchStatusRecipe('confirmed'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(deliveryWorkbenchStatusRecipe('failed'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(deliveryWorkbenchStatusRecipe('draft'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(deliveryGateStatusRecipe('passed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(deliveryGateStatusRecipe('warning'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(deliveryGateStatusRecipe('blocked'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(deliveryOverviewMetricRecipe('version_inventory'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(deliveryOverviewMetricRecipe('timeline_inventory'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(deliveryOverviewMetricRecipe('delivery_gaps'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(deliveryOverviewMetricRecipe('delivery_ready'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(deliveryOverviewMetricRecipe('export_available'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(deliveryOverviewMetricRecipe('not_exported'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(deliveryTimelineItemRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(deliveryTimelineItemRecipe('ready'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(deliveryTimelineItemRecipe('running'), { intent: 'neutral', emphasis: 'soft' })
})
