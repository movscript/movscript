export type ContentWorkbenchDropPosition = 'before' | 'after'

export interface ContentWorkbenchTimelineRecord {
  ID: number
  order?: unknown
  status?: unknown
  content_unit_id?: unknown
  start_sec?: unknown
  production_id?: unknown
  target_kind?: unknown
  target_ref?: unknown
  scope_kind?: unknown
  scope_ref?: unknown
  scope_path?: unknown
  is_primary?: unknown
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
    .sort((a, b) => previewTimelineItemRank(a) - previewTimelineItemRank(b) || numberOf(a.start_sec) - numberOf(b.start_sec) || byTimelineOrder(a, b))
  return unitItems[0] ?? null
}

export function reorderContentWorkbenchUnits<T extends ContentWorkbenchTimelineRecord>(
  units: T[],
  draggedUnitId: number,
  targetUnitId: number,
  position: ContentWorkbenchDropPosition,
) {
  const orderedUnits = units.slice().sort(byTimelineOrder)
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
  if (status === 'workspace') return 1
  return 2
}

export function previewTimelineRank(item: ContentWorkbenchTimelineRecord) {
  const status = String(item.status ?? '').toLowerCase()
  if (Boolean(item.is_primary)) return 0
  if (status === 'confirmed') return 1
  if (status === 'playable') return 2
  if (status === 'workspace') return 3
  return 4
}

function byTimelineOrder<T extends { order?: unknown; ID: number }>(a: T, b: T) {
  return numberOf(a.order) - numberOf(b.order) || a.ID - b.ID
}

function numberOf(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
