export const CONTENT_WORKBENCH_TIMELINE_UNIT_DRAG_TYPE = 'application/x-movscript-content-unit-id'
export const CONTENT_WORKBENCH_TIMELINE_OFFSET_DRAG_TYPE = 'application/x-movscript-timeline-drag-offset-sec'

export interface ContentWorkbenchTimelineDragDataTransfer {
  setData(type: string, data: string): void
  getData(type: string): string
  effectAllowed?: string
}

export interface ContentWorkbenchTimelineDragPayload {
  unitId: number
  dragOffsetSec: number
}

export function writeContentWorkbenchTimelineDragPayload(
  dataTransfer: ContentWorkbenchTimelineDragDataTransfer,
  payload: ContentWorkbenchTimelineDragPayload,
) {
  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData(CONTENT_WORKBENCH_TIMELINE_UNIT_DRAG_TYPE, String(payload.unitId))
  dataTransfer.setData(CONTENT_WORKBENCH_TIMELINE_OFFSET_DRAG_TYPE, String(normalizeDragOffsetSec(payload.dragOffsetSec)))
}

export function readContentWorkbenchTimelineDragPayload(
  dataTransfer: Pick<ContentWorkbenchTimelineDragDataTransfer, 'getData'>,
  options: { fallbackUnitId?: number | null } = {},
): ContentWorkbenchTimelineDragPayload | null {
  const unitId = positiveIntegerFromString(dataTransfer.getData(CONTENT_WORKBENCH_TIMELINE_UNIT_DRAG_TYPE))
    ?? (isPositiveInteger(options.fallbackUnitId) ? options.fallbackUnitId : null)
  if (!unitId) return null
  return {
    unitId,
    dragOffsetSec: normalizeDragOffsetSec(Number(dataTransfer.getData(CONTENT_WORKBENCH_TIMELINE_OFFSET_DRAG_TYPE))),
  }
}

function positiveIntegerFromString(value: string) {
  const parsed = Number(value)
  return isPositiveInteger(parsed) ? parsed : null
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function normalizeDragOffsetSec(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}
