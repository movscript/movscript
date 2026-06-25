import type { Canvas, NodeType, RawResource } from '@movscript/shared'
import type { CanvasClientPoint } from './layout'
import {
  hasCanvasDragPayload,
  readCanvasNodeTypeDragPayload,
  readCanvasWorkflowDragPayload,
  type CanvasDragDataTransfer,
  writeCanvasNodeTypeDragPayload,
  writeCanvasWorkflowDragPayload,
} from './canvasDragPayload'
import {
  hasResourceDragPayload,
  readResourceFromDragPayload,
  type ResourceDragDataTransfer,
} from '@movscript/resource-surface/resource-interaction'

export type CanvasDropPayload =
  | { kind: 'files'; files: File[] }
  | { kind: 'resource'; resource: RawResource }
  | { kind: 'workflow-canvas'; canvas: Canvas }
  | { kind: 'canvas-node-template'; nodeType: NodeType }

export type CanvasDropInteractionBoxRole = 'content' | 'overlay' | 'pane-surface' | 'resize-edge'

export interface CanvasDropInteractionBox {
  id: string
  role: CanvasDropInteractionBoxRole
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>
  zIndex: number
  accepts(payload: CanvasDropPayload | null): boolean
}

export interface CanvasDropLayoutHitMap {
  boxes(): CanvasDropInteractionBox[]
  boxFromClient(point: CanvasClientPoint, payload?: CanvasDropPayload | null): CanvasDropInteractionBox | null
}

export interface CanvasDropDataTransfer extends Pick<CanvasDragDataTransfer, 'getData'>, Pick<ResourceDragDataTransfer, 'getData'> {
  types?: readonly string[]
  files?: ArrayLike<File>
  dropEffect?: string
}

export interface ReadCanvasDropPayloadOptions {
  isNodeTypeAllowed?: (nodeType: NodeType) => boolean
}

export interface CreateCanvasViewportDropHitMapInput {
  viewportRect?: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'> | null
}

export function canvasDropHasAcceptedPayload(dataTransfer: Pick<CanvasDropDataTransfer, 'types' | 'files'>) {
  const files = Array.from(dataTransfer.files ?? [])
  if (files.length > 0) return true
  const types = canvasDropDataTransferTypes(dataTransfer)
  return types.includes('Files') || hasCanvasDragPayload(types) || hasResourceDragPayload(types)
}

export function startCanvasNodeTemplateDrag(dataTransfer: CanvasDragDataTransfer, nodeType: NodeType) {
  writeCanvasNodeTypeDragPayload(dataTransfer, nodeType)
  return { kind: 'canvas-node-template', nodeType } satisfies CanvasDropPayload
}

export function startCanvasWorkflowDrag(dataTransfer: CanvasDragDataTransfer, canvas: Canvas) {
  writeCanvasWorkflowDragPayload(dataTransfer, canvas)
  return { kind: 'workflow-canvas', canvas } satisfies CanvasDropPayload
}

export function acceptCanvasDropDragOver({
  dataTransfer,
  hitBox,
}: {
  dataTransfer: CanvasDropDataTransfer
  hitBox: CanvasDropInteractionBox | null
}): boolean {
  if (!hitBox || !canvasDropHasAcceptedPayload(dataTransfer)) return false
  dataTransfer.dropEffect = 'copy'
  return true
}

export function readCanvasDropPayload(
  dataTransfer: CanvasDropDataTransfer,
  options: ReadCanvasDropPayloadOptions = {},
): CanvasDropPayload | null {
  const files = Array.from(dataTransfer.files ?? [])
  if (files.length > 0) return { kind: 'files', files }

  const types = canvasDropDataTransferTypes(dataTransfer)
  if (hasResourceDragPayload(types)) {
    const resource = readResourceFromDragPayload<RawResource>(dataTransfer)
    return resource ? { kind: 'resource', resource } : null
  }

  const workflowCanvas = readCanvasWorkflowDragPayload(dataTransfer)
  if (workflowCanvas) return { kind: 'workflow-canvas', canvas: workflowCanvas }

  const nodeType = readCanvasNodeTypeDragPayload(dataTransfer)
  if (!nodeType) return null
  if (options.isNodeTypeAllowed && !options.isNodeTypeAllowed(nodeType)) return null
  return { kind: 'canvas-node-template', nodeType }
}

export function createCanvasDropLayoutHitMap(boxes: CanvasDropInteractionBox[]): CanvasDropLayoutHitMap {
  const sortedBoxes = boxes
    .slice()
    .sort((a, b) => b.zIndex - a.zIndex)
  return {
    boxes: () => sortedBoxes.slice(),
    boxFromClient: (point, payload) => sortedBoxes.find((box) => (
      canvasClientPointInRect(point, box.rect) && (payload === undefined || box.accepts(payload))
    )) ?? null,
  }
}

export function createCanvasViewportDropHitMap({
  viewportRect,
}: CreateCanvasViewportDropHitMapInput): CanvasDropLayoutHitMap {
  return createCanvasDropLayoutHitMap(viewportRect ? [createCanvasViewportDropInteractionBox(viewportRect)] : [])
}

export function createCanvasViewportDropInteractionBox(
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>,
): CanvasDropInteractionBox {
  return {
    id: 'canvas.flow-viewport',
    role: 'content',
    rect,
    zIndex: 0,
    accepts: (payload) => payload !== null,
  }
}

export function canvasClientPointInRect(
  point: CanvasClientPoint,
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>,
) {
  return (
    point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom
  )
}

function canvasDropDataTransferTypes(dataTransfer: Pick<CanvasDropDataTransfer, 'types'>) {
  return Array.from(dataTransfer.types ?? [])
}
