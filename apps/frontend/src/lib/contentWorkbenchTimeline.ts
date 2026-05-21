export type ContentWorkbenchDropPosition = 'before' | 'after'

export interface ContentWorkbenchTimelineRecord {
  ID: number
  order?: unknown
  status?: unknown
  content_unit_id?: unknown
  start_sec?: unknown
}

export function formatTrackTimeRange(startSec: number, endSec: number, durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return '未设'
  return `${formatTrackClock(startSec)}-${formatTrackClock(endSec)}`
}

export function formatTrackClock(seconds: number) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function buildTrackTimeTicks(durationSec: number, pxPerSec: number) {
  const duration = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const targetLabelGapPx = 72
  const interval = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => step * pxPerSec >= targetLabelGapPx) ?? 900
  const tickCount = Math.ceil(duration / interval)
  return Array.from({ length: tickCount + 1 }, (_, index) => {
    const seconds = index * interval
    return { seconds, label: formatTrackClock(seconds) }
  })
}

export function contentWorkbenchTimelinePxPerSec(zoom: number) {
  return Math.max(1.8, 36 * Math.max(0.05, Number(zoom) || 1))
}

export function contentWorkbenchTimelineRulerWidth(items: Array<{ endSec: number; durationSec: number }>, originSec: number, pxPerSec: number) {
  const maxEndSec = items.reduce((max, item) => Math.max(max, contentWorkbenchLocalTimelineSec(item.endSec, originSec)), 0)
  const longestItemSec = items.reduce((max, item) => Math.max(max, Number(item.durationSec) || 0), 0)
  const visibleSeconds = Math.max(30, maxEndSec + Math.max(20, longestItemSec * 2))
  return Math.max(1200, Math.round(visibleSeconds * pxPerSec))
}

export function trackTimelinePx(seconds: number, pxPerSec: number) {
  return Math.round(Math.max(0, Number(seconds) || 0) * pxPerSec)
}

export function trackTimelineWidthPx(durationSec: number, pxPerSec: number) {
  return Math.max(18, Math.round(Math.max(0.1, Number(durationSec) || 0.1) * pxPerSec))
}

export function buildContentWorkbenchTimelineBoundaries(
  items: Array<{ id: string; startSec: number; sceneMomentTitle: string; segmentTitle: string }>,
  originSec: number,
  pxPerSec: number,
) {
  return items
    .map((item, index) => {
      if (index === 0) return null
      const previous = items[index - 1]
      const segmentChanged = Boolean(item.segmentTitle && item.segmentTitle !== previous.segmentTitle)
      const sceneChanged = Boolean(item.sceneMomentTitle && item.sceneMomentTitle !== previous.sceneMomentTitle)
      if (!segmentChanged && !sceneChanged) return null
      return {
        key: `${item.id}-${segmentChanged ? 'segment' : 'scene'}`,
        label: segmentChanged ? `情绪段：${item.segmentTitle}` : `情节：${item.sceneMomentTitle}`,
        leftPx: trackTimelinePx(contentWorkbenchLocalTimelineSec(item.startSec, originSec), pxPerSec),
      }
    })
    .filter((item): item is { key: string; label: string; leftPx: number } => Boolean(item))
}

export function contentWorkbenchTimelineOriginSec(items: Array<{ startSec: number }>) {
  const starts = items
    .map((item) => Number(item.startSec))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (starts.length === 0) return 0
  return Math.round(Math.min(...starts) * 10) / 10
}

export function contentWorkbenchLocalTimelineSec(seconds: number, originSec: number) {
  return Math.max(0, Math.round(((Number(seconds) || 0) - originSec) * 10) / 10)
}

export function snapContentWorkbenchTimelineStartSec(rawStartSec: number, pxPerSec: number, items: Array<{ id: string; startSec: number; endSec: number }>, sourceUnitId: number) {
  const raw = Math.max(0, Number(rawStartSec) || 0)
  const gridStep = contentWorkbenchTimelineSnapStep(pxPerSec)
  const gridTarget = Math.round(raw / gridStep) * gridStep
  const targets = [
    0,
    gridTarget,
    ...items
      .filter((item) => Number(item.id) !== sourceUnitId)
      .flatMap((item) => [item.startSec, item.endSec]),
  ]
    .map((value) => Math.max(0, Number(value) || 0))
  const threshold = Math.max(gridStep / 2, 12 / Math.max(1, pxPerSec))
  const nearest = targets.reduce((best, value) => {
    const bestDistance = Math.abs(raw - best)
    const distance = Math.abs(raw - value)
    return distance < bestDistance ? value : best
  }, targets[0] ?? raw)
  const snapped = Math.abs(raw - nearest) <= threshold ? nearest : raw
  return Math.round(Math.max(0, snapped) * 10) / 10
}

export function contentWorkbenchTimelineSnapStep(pxPerSec: number) {
  if (pxPerSec >= 48) return 0.5
  if (pxPerSec >= 18) return 1
  if (pxPerSec >= 4) return 5
  return 10
}

export function contentUnitTimelineKindRank(kind: string) {
  switch (kind) {
    case 'shot':
      return 0
    case 'voiceover':
      return 1
    case 'dialogue_audio':
      return 2
    case 'sound':
      return 3
    case 'music_beat':
      return 4
    case 'subtitle':
      return 5
    case 'caption_card':
      return 6
    case 'transition':
      return 7
    default:
      return 20
  }
}

export function pickPreviewTimelineItemForUnit<T extends ContentWorkbenchTimelineRecord>(items: T[], unitId: number) {
  const unitItems = items
    .filter((item) => Number(item.content_unit_id) === unitId)
    .slice()
    .sort((a, b) => previewTimelineItemRank(a) - previewTimelineItemRank(b) || numberOf(a.start_sec) - numberOf(b.start_sec) || byOrder(a, b))
  return unitItems[0] ?? null
}

export function reorderContentWorkbenchUnits<T extends ContentWorkbenchTimelineRecord>(units: T[], draggedUnitId: number, targetUnitId: number, position: ContentWorkbenchDropPosition) {
  const orderedUnits = units.slice().sort(byOrder)
  const draggedUnit = orderedUnits.find((unit) => unit.ID === draggedUnitId)
  if (!draggedUnit || draggedUnitId === targetUnitId) return orderedUnits
  const withoutDragged = orderedUnits.filter((unit) => unit.ID !== draggedUnitId)
  const targetIndex = withoutDragged.findIndex((unit) => unit.ID === targetUnitId)
  if (targetIndex < 0) return orderedUnits
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  return [
    ...withoutDragged.slice(0, insertIndex),
    draggedUnit,
    ...withoutDragged.slice(insertIndex),
  ]
}

export function previewTimelineItemRank(item: ContentWorkbenchTimelineRecord) {
  const status = String(item.status ?? '').toLowerCase()
  if (status === 'locked' || status === 'approved' || status === 'confirmed') return 0
  if (status === 'draft') return 1
  return 2
}

function byOrder<T extends { order?: unknown; ID: number }>(a: T, b: T) {
  return numberOf(a.order) - numberOf(b.order) || a.ID - b.ID
}

function numberOf(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
