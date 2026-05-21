import assert from 'node:assert/strict'
import test from 'node:test'

import type { ContentUnit, DeliveryTimelineItem, DeliveryVersion, PreviewTimelineItem } from '@/api/deliveryEntities'

import {
  buildDeliveryGateChecks,
  buildDeliveryReadiness,
  deliveryKindFromContentUnit,
  deliveryKindFromPreviewItem,
  deliveryResourceTypeForTimelineKind,
  deliveryStatusFromPreviewItem,
  deliveryWorkbenchStatusTone,
  filterDeliveryVersions,
  nullableDeliveryNumber,
  parsePositiveDeliveryNumber,
  pickBestDeliveryPreviewTimeline,
  selectDeliveryResource,
  sortDeliveryContentUnits,
  sortDeliveryPreviewTimelineItems,
  sortDeliveryTimelineItems,
  sumDeliverySourceTimelineDuration,
  sumDeliveryTimelineDuration,
} from './deliveryWorkbenchModel'

function timelineItem(overrides: Partial<DeliveryTimelineItem>): DeliveryTimelineItem {
  return {
    ID: 1,
    project_id: 10,
    delivery_version_id: 20,
    kind: 'video',
    order: 1,
    start_sec: 0,
    duration_sec: 3,
    status: 'missing',
    ...overrides,
  }
}

function contentUnit(overrides: Partial<ContentUnit>): ContentUnit {
  return {
    ID: 1,
    project_id: 10,
    title: 'Unit',
    kind: 'video',
    order: 1,
    duration_sec: 3,
    status: 'draft',
    ...overrides,
  }
}

function previewItem(overrides: Partial<PreviewTimelineItem>): PreviewTimelineItem {
  return {
    ID: 1,
    project_id: 10,
    preview_timeline_id: 20,
    kind: 'video',
    order: 1,
    start_sec: 0,
    duration_sec: 3,
    status: 'playable',
    ...overrides,
  }
}

function version(overrides: Partial<DeliveryVersion>): DeliveryVersion {
  return {
    ID: 1,
    project_id: 10,
    name: 'Delivery',
    status: 'draft',
    is_primary: false,
    duration_sec: 3,
    ...overrides,
  }
}

test('delivery workbench model sorts and filters versions and timeline sources', () => {
  assert.deepEqual(sortDeliveryTimelineItems([
    timelineItem({ ID: 3, order: 2 }),
    timelineItem({ ID: 2, order: 1 }),
    timelineItem({ ID: 1, order: 1 }),
  ]).map((item) => item.ID), [1, 2, 3])

  assert.deepEqual(sortDeliveryContentUnits([
    contentUnit({ ID: 2, order: 2 }),
    contentUnit({ ID: 1, order: 1 }),
  ]).map((item) => item.ID), [1, 2])

  assert.deepEqual(sortDeliveryPreviewTimelineItems([
    previewItem({ ID: 2, order: 2 }),
    previewItem({ ID: 1, order: 1 }),
  ]).map((item) => item.ID), [1, 2])

  assert.deepEqual(filterDeliveryVersions([
    version({ ID: 1, name: 'Main cut', status: 'approved' }),
    version({ ID: 2, name: 'Scratch', status: 'draft' }),
  ], 'approved', 'main').map((item) => item.ID), [1])
})

test('delivery workbench model computes readiness and gate checks', () => {
  const items = [
    timelineItem({ ID: 1, content_unit_id: 11, resource_id: 101, status: 'locked' }),
    timelineItem({ ID: 2, content_unit_id: 12, resource_id: 102, status: 'approved' }),
  ]
  const readiness = buildDeliveryReadiness(items)

  assert.deepEqual(readiness, {
    missingCount: 0,
    noResourceCount: 0,
    lockedCount: 2,
    ready: true,
  })
  assert.deepEqual(buildDeliveryGateChecks({
    timelineItems: items,
    versionReadiness: readiness,
    selectedVersion: version({ status: 'approved' }),
  }).map((check) => check.status), ['passed', 'passed', 'passed', 'passed'])
})

test('delivery workbench model maps source timeline items to delivery semantics', () => {
  assert.equal(deliveryKindFromPreviewItem('subtitle'), 'caption')
  assert.equal(deliveryKindFromContentUnit('voice_over'), 'audio')
  assert.equal(deliveryKindFromContentUnit('keyframe still'), 'image')
  assert.equal(deliveryKindFromContentUnit('transition'), 'gap')
  assert.equal(deliveryStatusFromPreviewItem(previewItem({ kind: 'caption', status: 'draft' })), 'confirmed')
  assert.equal(deliveryStatusFromPreviewItem(previewItem({ kind: 'video', status: 'draft' })), 'needs_asset')
  assert.equal(deliveryResourceTypeForTimelineKind('caption'), 'text')
})

test('delivery workbench model chooses source timelines and fallback resources', () => {
  assert.equal(pickBestDeliveryPreviewTimeline([
    { ID: 2, status: 'draft' },
    { ID: 1, status: 'playable' },
    { ID: 3, is_primary: true },
  ])?.ID, 3)

  assert.equal(sumDeliveryTimelineDuration([
    timelineItem({ duration_sec: 2 }),
    timelineItem({ duration_sec: Number.NaN }),
    timelineItem({ duration_sec: 4 }),
  ]), 6)
  assert.equal(sumDeliverySourceTimelineDuration([previewItem({ duration_sec: 5 })], [contentUnit({ duration_sec: 9 })]), 5)
  assert.equal(sumDeliverySourceTimelineDuration([], [contentUnit({ duration_sec: 9 })]), 9)

  assert.equal(selectDeliveryResource([], timelineItem({ resource_id: 7, kind: 'audio', label: 'Voice' }))?.type, 'audio')
  assert.equal(selectDeliveryResource([{ ID: 7, owner_id: 1, type: 'video', name: 'Final', url: '/x', size: 1, mime_type: 'video/mp4' }], timelineItem({ resource_id: 7 }))?.name, 'Final')
  assert.equal(selectDeliveryResource([], timelineItem({ resource_id: null })), null)
})

test('delivery workbench model parses positive numeric identifiers', () => {
  assert.equal(parsePositiveDeliveryNumber('12'), 12)
  assert.equal(parsePositiveDeliveryNumber('0'), null)
  assert.equal(parsePositiveDeliveryNumber('abc'), null)
  assert.equal(nullableDeliveryNumber(9), 9)
  assert.equal(nullableDeliveryNumber(-1), null)
})

test('delivery workbench model maps status values to shared semantic tones', () => {
  assert.equal(deliveryWorkbenchStatusTone('approved'), 'success')
  assert.equal(deliveryWorkbenchStatusTone('needs_asset'), 'warning')
  assert.equal(deliveryWorkbenchStatusTone('confirmed'), 'info')
  assert.equal(deliveryWorkbenchStatusTone('failed'), 'danger')
  assert.equal(deliveryWorkbenchStatusTone('draft'), 'neutral')
})
