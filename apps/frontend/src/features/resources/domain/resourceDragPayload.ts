import {
  CANVAS_RESOURCE_DRAG_TYPE,
  RESOURCE_ID_DRAG_TYPE,
  hasResourceDragPayload,
  readResourceDragPayload as readCoreResourceDragPayload,
  readResourceFromDragPayload as readCoreResourceFromDragPayload,
  readResourceIdDragPayload,
  resourceDropAcceptsPayload as coreResourceDropAcceptsPayload,
  resolveResourceDropResource as resolveCoreResourceDropResource,
  writeResourceDragPayload as writeCoreResourceDragPayload,
  type ResourceDragDataTransfer,
  type ResourceDropDataTransfer as CoreResourceDropDataTransfer,
} from '@movscript/core/resources'
import type { RawResource } from '@/types'

export {
  CANVAS_RESOURCE_DRAG_TYPE,
  RESOURCE_ID_DRAG_TYPE,
  hasResourceDragPayload,
  readResourceIdDragPayload,
  type ResourceDragDataTransfer,
}

export interface ResourceDragPayload {
  resourceId: number
  resource: RawResource | null
}

export function writeResourceDragPayload(dataTransfer: ResourceDragDataTransfer, resource: RawResource) {
  writeCoreResourceDragPayload(dataTransfer, resource)
}

export function readResourceDragPayload(dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>): ResourceDragPayload | null {
  return readCoreResourceDragPayload<RawResource>(dataTransfer)
}

export function readResourceFromDragPayload(dataTransfer: Pick<ResourceDragDataTransfer, 'getData'>): RawResource | null {
  return readCoreResourceFromDragPayload<RawResource>(dataTransfer)
}

export function resourceDropAcceptsPayload(dataTransfer: Pick<CoreResourceDropDataTransfer, 'types'>): boolean {
  return coreResourceDropAcceptsPayload(dataTransfer)
}

export function resolveResourceDropResource<TResource extends { ID: number }>(input: {
  dataTransfer: Pick<CoreResourceDropDataTransfer, 'getData'>
  resources: TResource[]
}): TResource | null {
  return resolveCoreResourceDropResource(input)
}
