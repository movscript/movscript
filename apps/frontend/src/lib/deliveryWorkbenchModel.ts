import { resourceFromId, type ContentUnit, type DeliveryTimelineItem, type DeliveryVersion, type PreviewTimelineItem } from '@/api/deliveryEntities'
import type { RawResource } from '@/types'

export type DeliveryVersionFilter = 'all' | 'draft' | 'checking' | 'approved' | 'exported'

export interface DeliveryReadiness {
  missingCount: number
  noResourceCount: number
  lockedCount: number
  ready: boolean
}

export type DeliveryGateCheckStatus = 'passed' | 'warning' | 'blocked'

export interface DeliveryGateCheck {
  id: 'timeline' | 'assets' | 'version' | 'export'
  label: string
  description: string
  status: DeliveryGateCheckStatus
  count: string
}

export function sortDeliveryTimelineItems(items: DeliveryTimelineItem[]) {
  return [...items].sort((a, b) => a.order - b.order || a.ID - b.ID)
}

export function sortDeliveryContentUnits(items: ContentUnit[]) {
  return [...items].sort((a, b) => a.order - b.order || a.ID - b.ID)
}

export function sortDeliveryPreviewTimelineItems(items: PreviewTimelineItem[]) {
  return [...items].sort((a, b) => a.order - b.order || a.ID - b.ID)
}

export function filterDeliveryVersions(versions: DeliveryVersion[], filter: DeliveryVersionFilter, search: string) {
  const q = search.trim().toLowerCase()
  return versions.filter((item) => {
    const matchesFilter = filter === 'all' || item.status === filter
    const haystack = `${item.name} ${item.description ?? ''} ${item.status} ${item.ID}`.toLowerCase()
    return matchesFilter && (!q || haystack.includes(q))
  })
}

export function buildDeliveryContentUnitMap(items: ContentUnit[]) {
  return new Map(items.map((item) => [item.ID, item]))
}

export function buildDeliveryReadiness(items: DeliveryTimelineItem[]): DeliveryReadiness {
  const missingCount = items.filter((item) => ['missing', 'needs_asset'].includes(item.status)).length
  const noResourceCount = items.filter((item) => ['video', 'image', 'audio'].includes(item.kind) && !item.resource_id).length
  const lockedCount = items.filter((item) => ['locked', 'approved'].includes(item.status)).length
  const unapprovedCount = items.filter((item) => !['locked', 'approved'].includes(item.status)).length
  return {
    missingCount,
    noResourceCount,
    lockedCount,
    ready: items.length > 0 && missingCount === 0 && noResourceCount === 0 && unapprovedCount === 0,
  }
}

export function buildDeliveryGateChecks(input: {
  timelineItems: DeliveryTimelineItem[]
  versionReadiness: DeliveryReadiness
  selectedVersion: DeliveryVersion | null
}): DeliveryGateCheck[] {
  const { timelineItems, versionReadiness, selectedVersion } = input
  const total = timelineItems.length
  const unlinked = timelineItems.filter((item) => !item.content_unit_id).length
  const timelineOk = total > 0 && unlinked === 0
  const assetOk = versionReadiness.missingCount === 0 && versionReadiness.noResourceCount === 0
  const versionOk = selectedVersion ? ['approved', 'exported'].includes(selectedVersion.status) : false
  const exportOk = timelineOk && assetOk && versionOk

  return [
    {
      id: 'timeline',
      label: '时间线完整性',
      description: total === 0
        ? '尚未添加任何片段。'
        : unlinked > 0
          ? `${unlinked} 个片段未绑定制作项。`
          : `全部 ${total} 个片段已绑定制作项。`,
      status: timelineOk ? 'passed' : 'warning',
      count: `${total - unlinked}/${total}`,
    },
    {
      id: 'assets',
      label: '素材完整性',
      description: assetOk
        ? '全部媒体片段已锁定资源。'
        : `${versionReadiness.missingCount + versionReadiness.noResourceCount} 个片段缺少成片资源。`,
      status: assetOk ? 'passed' : 'warning',
      count: assetOk ? '全部就绪' : `${versionReadiness.missingCount + versionReadiness.noResourceCount} 项`,
    },
    {
      id: 'version',
      label: '版本审核',
      description: versionOk
        ? '版本已批准，可以导出。'
        : `当前版本状态为「${deliveryStatusLabel(selectedVersion?.status ?? 'draft')}」，需推进到「已批准」。`,
      status: versionOk ? 'passed' : 'warning',
      count: selectedVersion ? deliveryStatusLabel(selectedVersion.status) : '未选择',
    },
    {
      id: 'export',
      label: '导出条件',
      description: exportOk ? '全部门禁通过，可以创建导出记录。' : '需先满足以上条件才能导出。',
      status: exportOk ? 'passed' : (timelineOk && assetOk ? 'warning' : 'blocked'),
      count: exportOk ? '可导出' : '未就绪',
    },
  ]
}

export function sumDeliveryTimelineDuration(items: DeliveryTimelineItem[]) {
  return items.reduce((total, item) => total + (Number.isFinite(item.duration_sec) ? item.duration_sec : 0), 0)
}

export function sumDeliverySourceTimelineDuration(previewItems: PreviewTimelineItem[], units: ContentUnit[]) {
  if (previewItems.length > 0) {
    return previewItems.reduce((sum, item) => sum + (Number.isFinite(item.duration_sec) ? item.duration_sec : 0), 0)
  }
  return units.reduce((sum, unit) => sum + (Number.isFinite(unit.duration_sec) ? unit.duration_sec : 0), 0)
}

export function pickBestDeliveryPreviewTimeline(items: Array<{ ID: number; is_primary?: boolean; status?: string }>) {
  return items.slice().sort((a, b) => previewTimelineRank(a) - previewTimelineRank(b) || a.ID - b.ID)[0]
}

function previewTimelineRank(item: { is_primary?: boolean; status?: string }) {
  const status = String(item.status ?? '').toLowerCase()
  if (item.is_primary) return 0
  if (status === 'confirmed') return 1
  if (status === 'playable') return 2
  if (status === 'draft') return 3
  return 4
}

export function deliveryKindFromPreviewItem(kind?: string) {
  const value = String(kind ?? '').toLowerCase()
  if (value === 'subtitle') return 'caption'
  return deliveryKindFromContentUnit(value)
}

export function deliveryKindFromContentUnit(kind?: string) {
  const value = String(kind ?? '').toLowerCase()
  if (['video', 'image', 'audio', 'caption', 'gap', 'note'].includes(value)) return value
  if (value.includes('audio') || value.includes('voice') || value.includes('sound')) return 'audio'
  if (value.includes('subtitle') || value.includes('caption')) return 'caption'
  if (value.includes('image') || value.includes('still') || value.includes('keyframe')) return 'image'
  if (value.includes('transition')) return 'gap'
  return 'video'
}

export function deliveryStatusFromPreviewItem(item: PreviewTimelineItem) {
  const status = String(item.status ?? '').toLowerCase()
  if (['missing', 'needs_asset', 'locked', 'approved'].includes(status)) return status
  const kind = deliveryKindFromPreviewItem(item.kind)
  if (kind === 'caption' || kind === 'gap' || kind === 'note') return 'confirmed'
  return status === 'accepted' || status === 'confirmed' || status === 'playable' ? 'confirmed' : 'needs_asset'
}

export function deliveryResourceTypeForTimelineKind(kind: string): RawResource['type'] {
  if (kind === 'image') return 'image'
  if (kind === 'audio') return 'audio'
  if (kind === 'caption' || kind === 'note') return 'text'
  return 'video'
}

export function selectDeliveryResource(resources: RawResource[], selectedItem: DeliveryTimelineItem | null) {
  if (!selectedItem?.resource_id) return null
  return resources.find((item) => item.ID === selectedItem.resource_id)
    ?? resourceFromId(
      selectedItem.resource_id,
      deliveryResourceTypeForTimelineKind(selectedItem.kind),
      selectedItem.label || `Resource #${selectedItem.resource_id}`,
    )
}

export function deliveryResourcePageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function parsePositiveDeliveryNumber(value: string | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function nullableDeliveryNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function deliveryVersionFilterLabel(value: DeliveryVersionFilter) {
  if (value === 'all') return '全部'
  return deliveryStatusLabel(value)
}

export function deliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    checking: '检查中',
    approved: '已批准',
    exported: '已导出',
    archived: '已归档',
    confirmed: '已确认',
    needs_asset: '缺素材资源',
    missing: '缺失',
    locked: '已锁定',
    pending: '待导出',
    running: '导出中',
    succeeded: '成功',
    failed: '失败',
  }
  return labels[status] ?? status
}
