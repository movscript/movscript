import assert from 'node:assert/strict'
import test from 'node:test'

import type { DeliveryTimelineItem, DeliveryVersion, ExportRecord, Production } from '@/api/deliveryEntities'
import {
  buildDeliveryOverviewMetrics,
  buildDeliveryVersionDetailFields,
  buildDeliveryVersionSummary,
  deliveryProductionLabel,
  formatDeliveryDuration,
} from './deliveryWorkbenchOverviewModel'

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

function exportRecord(input: Partial<ExportRecord> & Pick<ExportRecord, 'ID'>): ExportRecord {
  return {
    project_id: 1,
    delivery_version_id: 10,
    status: 'pending',
    ...input,
  } as ExportRecord
}

function production(input: Partial<Production> & Pick<Production, 'ID'>): Production {
  return {
    project_id: 1,
    name: `制作 ${input.ID}`,
    status: 'draft',
    ...input,
  } as Production
}

test('delivery workbench overview model builds stable metric view models', () => {
  const metrics = buildDeliveryOverviewMetrics({
    versions: [
      version({ ID: 1, status: 'approved' }),
      version({ ID: 2, status: 'draft' }),
    ],
    timelineItems: [
      item({ ID: 1, duration_sec: 6, status: 'locked', resource_id: 1 }),
      item({ ID: 2, duration_sec: 4, status: 'missing' }),
    ],
    versionReadiness: {
      missingCount: 1,
      noResourceCount: 1,
      lockedCount: 1,
      ready: false,
    },
    exportRecords: [exportRecord({ ID: 8, status: 'succeeded' })],
  })

  assert.deepEqual(metrics.map((metric) => ({
    id: metric.id,
    value: metric.value,
    detail: metric.detail,
    tone: metric.tone,
  })), [
    { id: 'versions', value: 2, detail: '1 个可导出', tone: 'info' },
    { id: 'items', value: 2, detail: '0:10 总时长', tone: 'info' },
    { id: 'missing', value: 2, detail: 'missing / needs_asset / 无资源', tone: 'warning' },
    { id: 'exports', value: 1, detail: '成功', tone: 'success' },
  ])
})

test('delivery workbench overview model summarizes selected version state', () => {
  const summary = buildDeliveryVersionSummary({
    version: version({ ID: 3, name: '正式交付', description: '', status: 'checking', is_primary: true }),
    items: [
      item({ ID: 1, duration_sec: 5, status: 'locked' }),
      item({ ID: 2, duration_sec: 7, status: 'draft' }),
    ],
    readiness: {
      missingCount: 0,
      noResourceCount: 0,
      lockedCount: 1,
      ready: false,
    },
  })

  assert.deepEqual(summary, {
    title: '正式交付',
    description: '未填写版本说明',
    status: 'checking',
    isPrimary: true,
    total: 2,
    lockedCount: 1,
    warningCount: 1,
    completion: 50,
    totalDurationLabel: '0:12',
  })
})

test('delivery workbench overview model builds version detail fields', () => {
  assert.equal(formatDeliveryDuration(65.4), '1:05')
  assert.equal(deliveryProductionLabel(4, [production({ ID: 4, name: '第二集制作' })]), '第二集制作')
  assert.equal(deliveryProductionLabel(null, []), '未关联')

  assert.deepEqual(buildDeliveryVersionDetailFields(
    version({ ID: 5, production_id: 4, preview_timeline_id: 9, name: '', description: '', status: 'exported' }),
    [production({ ID: 4, name: '第二集制作' })],
  ).map((field) => [field.id, field.value]), [
    ['name', 'Delivery #5'],
    ['status', '已导出'],
    ['production', '第二集制作'],
    ['preview', 'Preview #9'],
    ['description', '未填写版本说明'],
  ])
})
