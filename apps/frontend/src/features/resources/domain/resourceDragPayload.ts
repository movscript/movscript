import type { RawResource } from '@/types'

export const RESOURCE_ID_DRAG_TYPE = 'application/resource-id'
export const CANVAS_RESOURCE_DRAG_TYPE = 'application/canvas-resource'

export interface ResourceDragDataTransfer {
  types?: readonly string[]
  setData(type: string, data: string): void
  getData(type: string): string
  effectAllowed?: string
}

export interface ResourceDragPayload {
  resourceId: number
  resource: RawResource | null
}

export function writeResourceDragPayload(dataTransfer: ResourceDragDataTransfer, resource: RawResource) {
  dataTransfer.setData(RESOURCE_ID_DRAG_TYPE, String(resource.ID))
  dataTransfer.setData(CANVAS_RESOURCE_DRAG_TYPE, JSON.stringify(resource))
  dataTransfer.effectAllowed = 'copy'
}

export function hasResourceDragPayload(types: readonly string[]) {
  return types.includes(CANVAS_RESOURCE_DRAG_TYPE) || types.includes(RESOURCE_ID_DRAG_TYPE)
}

export function readResourceDragPayload(dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>): ResourceDragPayload | null {
  const resource = readResourceFromDragPayload(dataTransfer)
  const resourceId = resource?.ID ?? readResourceIdDragPayload(dataTransfer)
  if (!isPositiveInteger(resourceId)) return null
  return { resourceId, resource }
}

export function readResourceIdDragPayload(dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>) {
  return positiveIntegerFromString(dataTransfer.getData(RESOURCE_ID_DRAG_TYPE))
}

export function readResourceFromDragPayload(dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>): RawResource | null {
  const rawResource = dataTransfer.getData(CANVAS_RESOURCE_DRAG_TYPE)
  if (!rawResource) return null
  try {
    const parsed = JSON.parse(rawResource) as RawResource
    if (parsed && isPositiveInteger(parsed.ID)) return parsed
  } catch {
    return null
  }
  return null
}

function positiveIntegerFromString(value: string) {
  const parsed = Number(value)
  return isPositiveInteger(parsed) ? parsed : null
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}
