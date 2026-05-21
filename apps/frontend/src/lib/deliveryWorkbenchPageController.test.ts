import assert from 'node:assert/strict'
import test from 'node:test'

import type { DeliveryTimelineItem, DeliveryVersion } from '@/api/deliveryEntities'
import {
  buildDeliveryWorkbenchProductionSearchParams,
  buildDeliveryWorkbenchVisibleVersions,
  readDeliveryWorkbenchProductionId,
  resolveDeliveryWorkbenchSelectedItem,
  resolveDeliveryWorkbenchSelectedVersion,
} from './deliveryWorkbenchPageController'

function version(input: Partial<DeliveryVersion> & Pick<DeliveryVersion, 'ID'>): DeliveryVersion {
  return {
    project_id: 1,
    name: `Delivery ${input.ID}`,
    status: 'draft',
    is_primary: false,
    duration_sec: 0,
    ...input,
  } as DeliveryVersion
}

function item(input: Partial<DeliveryTimelineItem> & Pick<DeliveryTimelineItem, 'ID'>): DeliveryTimelineItem {
  return {
    project_id: 1,
    delivery_version_id: 10,
    kind: 'video',
    order: input.ID,
    start_sec: 0,
    duration_sec: 3,
    status: 'missing',
    ...input,
  } as DeliveryTimelineItem
}

test('delivery workbench page controller reads and writes production scope params', () => {
  assert.equal(readDeliveryWorkbenchProductionId(new URLSearchParams('productionId=42')), 42)
  assert.equal(readDeliveryWorkbenchProductionId(new URLSearchParams('productionId=0')), null)
  assert.equal(readDeliveryWorkbenchProductionId(new URLSearchParams('productionId=abc')), null)

  const base = new URLSearchParams('productionId=1&tab=delivery')
  assert.equal(buildDeliveryWorkbenchProductionSearchParams(base, 9).toString(), 'productionId=9&tab=delivery')
  assert.equal(buildDeliveryWorkbenchProductionSearchParams(base, null).toString(), 'tab=delivery')
})

test('delivery workbench page controller resolves selected version and item fallbacks', () => {
  const versions = [
    version({ ID: 10, name: 'Draft A' }),
    version({ ID: 11, name: 'Primary', is_primary: true }),
    version({ ID: 12, name: 'Approved', status: 'approved' }),
  ]
  const items = [item({ ID: 20 }), item({ ID: 21 })]

  assert.equal(resolveDeliveryWorkbenchSelectedVersion(versions, 12)?.ID, 12)
  assert.equal(resolveDeliveryWorkbenchSelectedVersion(versions, 99)?.ID, 11)
  assert.equal(resolveDeliveryWorkbenchSelectedVersion([], 12), null)
  assert.equal(resolveDeliveryWorkbenchSelectedItem(items, 21)?.ID, 21)
  assert.equal(resolveDeliveryWorkbenchSelectedItem(items, 99), null)
  assert.equal(resolveDeliveryWorkbenchSelectedItem(items, null), null)
})

test('delivery workbench page controller filters visible versions through the shared delivery model', () => {
  const versions = [
    version({ ID: 10, name: 'Rough cut', status: 'draft' }),
    version({ ID: 11, name: 'Client approved', status: 'approved' }),
    version({ ID: 12, name: 'Export package', status: 'exported' }),
  ]

  assert.deepEqual(buildDeliveryWorkbenchVisibleVersions(versions, 'approved', '').map((entry) => entry.ID), [11])
  assert.deepEqual(buildDeliveryWorkbenchVisibleVersions(versions, 'all', 'package').map((entry) => entry.ID), [12])
})
