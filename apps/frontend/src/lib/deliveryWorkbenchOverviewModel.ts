import type { DeliveryTimelineItem, DeliveryVersion, ExportRecord, Production } from '@/api/deliveryEntities'
import {
  deliveryStatusLabel,
  sumDeliveryTimelineDuration,
  type DeliveryReadiness,
} from '@/lib/deliveryWorkbenchModel'

export type DeliveryOverviewMetricId = 'versions' | 'items' | 'missing' | 'exports'
export type DeliveryOverviewMetricTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface DeliveryOverviewMetric {
  id: DeliveryOverviewMetricId
  label: string
  value: number
  detail: string
  tone: DeliveryOverviewMetricTone
}

export interface DeliveryVersionSummary {
  title: string
  description: string
  status: string
  isPrimary: boolean
  total: number
  lockedCount: number
  warningCount: number
  completion: number
  totalDurationLabel: string
}

export interface DeliveryVersionDetailField {
  id: 'name' | 'status' | 'production' | 'preview' | 'description'
  label: string
  value: string
  strong?: boolean
  className?: string
}

export function formatDeliveryDuration(seconds?: number) {
  const value = Math.max(0, Math.round(seconds ?? 0))
  const min = Math.floor(value / 60)
  const sec = value % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function deliveryProductionLabel(productionId: number | null | undefined, productions: Production[]) {
  if (!productionId) return '未关联'
  const production = productions.find((item) => item.ID === productionId)
  return production?.name || `制作 #${productionId}`
}

export function buildDeliveryOverviewMetrics({
  versions,
  timelineItems,
  versionReadiness,
  exportRecords,
}: {
  versions: DeliveryVersion[]
  timelineItems: DeliveryTimelineItem[]
  versionReadiness: DeliveryReadiness
  exportRecords: ExportRecord[]
}): DeliveryOverviewMetric[] {
  return [
    {
      id: 'versions',
      label: '交付版本',
      value: versions.length,
      detail: `${versions.filter((item) => ['approved', 'exported'].includes(item.status)).length} 个可导出`,
      tone: 'info',
    },
    {
      id: 'items',
      label: '时间线片段',
      value: timelineItems.length,
      detail: `${formatDeliveryDuration(sumDeliveryTimelineDuration(timelineItems))} 总时长`,
      tone: 'info',
    },
    {
      id: 'missing',
      label: '缺失内容',
      value: versionReadiness.missingCount + versionReadiness.noResourceCount,
      detail: 'missing / needs_asset / 无资源',
      tone: versionReadiness.missingCount + versionReadiness.noResourceCount > 0 ? 'warning' : 'success',
    },
    {
      id: 'exports',
      label: '导出记录',
      value: exportRecords.length,
      detail: exportRecords[0]?.status ? deliveryStatusLabel(exportRecords[0].status) : '尚未导出',
      tone: exportRecords.length > 0 ? 'success' : 'neutral',
    },
  ]
}

export function buildDeliveryVersionSummary({
  version,
  items,
  readiness,
}: {
  version: DeliveryVersion
  items: DeliveryTimelineItem[]
  readiness: DeliveryReadiness
}): DeliveryVersionSummary {
  const total = items.length
  const warningCount = items.filter((item) => !['locked', 'approved'].includes(item.status)).length
  return {
    title: version.name || `Delivery #${version.ID}`,
    description: version.description || '未填写版本说明',
    status: version.status,
    isPrimary: version.is_primary,
    total,
    lockedCount: readiness.lockedCount,
    warningCount,
    completion: total > 0 ? Math.round((readiness.lockedCount / total) * 100) : 0,
    totalDurationLabel: formatDeliveryDuration(sumDeliveryTimelineDuration(items)),
  }
}

export function buildDeliveryVersionDetailFields(version: DeliveryVersion, productions: Production[]): DeliveryVersionDetailField[] {
  return [
    {
      id: 'name',
      label: '版本名称',
      value: version.name || `Delivery #${version.ID}`,
      strong: true,
    },
    {
      id: 'status',
      label: '状态',
      value: deliveryStatusLabel(version.status),
    },
    {
      id: 'production',
      label: '关联制作',
      value: deliveryProductionLabel(version.production_id, productions),
    },
    {
      id: 'preview',
      label: '关联预览时间线',
      value: version.preview_timeline_id ? `Preview #${version.preview_timeline_id}` : '未关联',
    },
    {
      id: 'description',
      label: '版本说明',
      value: version.description || '未填写版本说明',
      className: 'sm:col-span-2',
    },
  ]
}
