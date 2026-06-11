export const RESOURCE_ID_DRAG_TYPE = 'application/resource-id'
export const CANVAS_RESOURCE_DRAG_TYPE = 'application/canvas-resource'

export interface ResourceDragDataTransfer {
  types?: readonly string[]
  setData(type: string, data: string): void
  getData(type: string): string
  effectAllowed?: string
}

export interface ResourceDragPayloadResource {
  ID: number
}

export interface ResourceDragPayload<TResource extends ResourceDragPayloadResource = ResourceDragPayloadResource> {
  resourceId: number
  resource: TResource | null
}

export interface ResourceDropDataTransfer {
  types?: ArrayLike<string> | Iterable<string>
  getData(type: string): string
}

export function writeResourceDragPayload<TResource extends ResourceDragPayloadResource>(
  dataTransfer: ResourceDragDataTransfer,
  resource: TResource,
): void {
  dataTransfer.setData(RESOURCE_ID_DRAG_TYPE, String(resource.ID))
  dataTransfer.setData(CANVAS_RESOURCE_DRAG_TYPE, JSON.stringify(resource))
  dataTransfer.effectAllowed = 'copy'
}

export function hasResourceDragPayload(types: readonly string[]): boolean {
  return types.includes(CANVAS_RESOURCE_DRAG_TYPE) || types.includes(RESOURCE_ID_DRAG_TYPE)
}

export function resourceDropAcceptsPayload(dataTransfer: Pick<ResourceDropDataTransfer, 'types'>): boolean {
  return hasResourceDragPayload(resourceDataTransferTypes(dataTransfer))
}

export function resolveResourceDropResource<TResource extends ResourceDragPayloadResource>({
  dataTransfer,
  resources,
}: {
  dataTransfer: Pick<ResourceDropDataTransfer, 'getData'>
  resources: TResource[]
}): TResource | null {
  const resourceId = readResourceIdDragPayload(dataTransfer)
  if (!resourceId) return null
  return resources.find((resource) => resource.ID === resourceId) ?? null
}

export function readResourceDragPayload<TResource extends ResourceDragPayloadResource = ResourceDragPayloadResource>(
  dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>,
): ResourceDragPayload<TResource> | null {
  const resource = readResourceFromDragPayload<TResource>(dataTransfer)
  const resourceId = resource?.ID ?? readResourceIdDragPayload(dataTransfer)
  if (!isPositiveInteger(resourceId)) return null
  return { resourceId, resource }
}

export function readResourceIdDragPayload(dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>): number | null {
  return positiveIntegerFromString(dataTransfer.getData(RESOURCE_ID_DRAG_TYPE))
}

export function readResourceFromDragPayload<TResource extends ResourceDragPayloadResource = ResourceDragPayloadResource>(
  dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>,
): TResource | null {
  const rawResource = dataTransfer.getData(CANVAS_RESOURCE_DRAG_TYPE)
  if (!rawResource) return null
  try {
    const parsed = JSON.parse(rawResource) as TResource
    if (parsed && isPositiveInteger(parsed.ID)) return parsed
  } catch {
    return null
  }
  return null
}

function positiveIntegerFromString(value: string): number | null {
  const parsed = Number(value)
  return isPositiveInteger(parsed) ? parsed : null
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function resourceDataTransferTypes(dataTransfer: Pick<ResourceDropDataTransfer, 'types'>) {
  return Array.from(dataTransfer.types ?? [])
}
