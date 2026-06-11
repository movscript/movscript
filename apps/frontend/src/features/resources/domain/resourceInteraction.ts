import {
  resourceDropAcceptsPayload as coreResourceDropAcceptsPayload,
  resolveResourceDropResource as resolveCoreResourceDropResource,
  type ResourceDragDataTransfer,
  writeResourceDragPayload,
} from '@/features/resources/domain/resourceDragPayload'
import type { RawResource } from '@/types'

export interface ResourceClientPoint {
  x: number
  y: number
}

export interface ResourceClientPointEvent {
  clientX: number
  clientY: number
}

export interface ResourceViewportBoundary {
  width: number
  height: number
}

export interface ResourceContextMenuSize {
  width: number
  height: number
}

export interface ResourceDropDataTransfer extends Pick<ResourceDragDataTransfer, 'getData'> {
  types?: ArrayLike<string> | Iterable<string>
  dropEffect?: string
}

export interface ResourceDragSourceDataTransfer extends ResourceDragDataTransfer {}

export const RESOURCE_CONTEXT_MENU_SAFE_INSET = 8
export const RESOURCE_CONTEXT_MENU_DEFAULT_SIZE: ResourceContextMenuSize = {
  width: 220,
  height: 180,
}
export const RESOURCE_INTERACTIVE_TARGET_SELECTOR = '[data-resource-interactive="true"]'

export function resourceContextMenuPositionFromClient(
  point: ResourceClientPoint,
  boundary: ResourceViewportBoundary,
  menuSize: ResourceContextMenuSize = RESOURCE_CONTEXT_MENU_DEFAULT_SIZE,
): ResourceClientPoint {
  const inset = RESOURCE_CONTEXT_MENU_SAFE_INSET
  return {
    x: clampResourceContextMenuAxis(point.x, boundary.width, menuSize.width, inset),
    y: clampResourceContextMenuAxis(point.y, boundary.height, menuSize.height, inset),
  }
}

export function resourceContextMenuPositionFromEvent(
  event: ResourceClientPointEvent,
  boundary: ResourceViewportBoundary,
  menuSize: ResourceContextMenuSize = RESOURCE_CONTEXT_MENU_DEFAULT_SIZE,
): ResourceClientPoint {
  return resourceContextMenuPositionFromClient(
    { x: event.clientX, y: event.clientY },
    boundary,
    menuSize,
  )
}

export function resourceViewportBoundaryFromWindow(viewport: Pick<Window, 'innerWidth' | 'innerHeight'>): ResourceViewportBoundary {
  return {
    width: Math.max(0, Number(viewport.innerWidth) || 0),
    height: Math.max(0, Number(viewport.innerHeight) || 0),
  }
}

export function isResourceInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!target) return false
  if (typeof Element !== 'undefined' && target instanceof Element) {
    return Boolean(target.closest(RESOURCE_INTERACTIVE_TARGET_SELECTOR))
  }
  if (hasClosest(target)) return Boolean(target.closest(RESOURCE_INTERACTIVE_TARGET_SELECTOR))
  return false
}

export function startResourceDragSource<TResource extends RawResource>({
  dataTransfer,
  resource,
  target,
  preventDefault,
}: {
  dataTransfer: ResourceDragSourceDataTransfer
  resource: TResource
  target?: EventTarget | null
  preventDefault?: () => void
}): boolean {
  if (isResourceInteractiveDragTarget(target ?? null)) {
    preventDefault?.()
    return false
  }
  writeResourceDragPayload(dataTransfer, resource)
  return true
}

export function resourceDropAcceptsPayload(dataTransfer: Pick<ResourceDropDataTransfer, 'types'>): boolean {
  return coreResourceDropAcceptsPayload(dataTransfer)
}

export function acceptResourceDropDragOver(dataTransfer: ResourceDropDataTransfer): boolean {
  if (!resourceDropAcceptsPayload(dataTransfer)) return false
  dataTransfer.dropEffect = 'copy'
  return true
}

export function resolveResourceDropResource<TResource extends { ID: number }>({
  dataTransfer,
  resources,
}: {
  dataTransfer: Pick<ResourceDropDataTransfer, 'getData'>
  resources: TResource[]
}): TResource | null {
  return resolveCoreResourceDropResource({ dataTransfer, resources })
}

function clampResourceContextMenuAxis(value: number, boundarySize: number, menuSize: number, inset: number) {
  const min = inset
  const max = Math.max(min, Math.max(0, boundarySize) - Math.max(0, menuSize) - inset)
  return Math.min(max, Math.max(min, Number(value) || 0))
}

function hasClosest(target: EventTarget): target is EventTarget & { closest(selector: string): unknown } {
  return typeof (target as { closest?: unknown }).closest === 'function'
}
