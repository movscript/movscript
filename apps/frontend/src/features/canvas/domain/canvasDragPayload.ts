import type { Canvas, NodeType } from '@/types'

export const CANVAS_NODE_TYPE_DRAG_TYPE = 'application/canvas-node-type'
export const CANVAS_WORKFLOW_DRAG_TYPE = 'application/canvas-workflow'

export interface CanvasDragDataTransfer {
  types?: readonly string[]
  setData(type: string, data: string): void
  getData(type: string): string
  effectAllowed?: string
}

export function writeCanvasNodeTypeDragPayload(dataTransfer: CanvasDragDataTransfer, nodeType: NodeType) {
  dataTransfer.setData(CANVAS_NODE_TYPE_DRAG_TYPE, nodeType)
  dataTransfer.effectAllowed = 'copy'
}

export function readCanvasNodeTypeDragPayload(dataTransfer: Pick<CanvasDragDataTransfer, 'getData'>): NodeType | null {
  const nodeType = dataTransfer.getData(CANVAS_NODE_TYPE_DRAG_TYPE).trim()
  return nodeType ? (nodeType as NodeType) : null
}

export function writeCanvasWorkflowDragPayload(dataTransfer: CanvasDragDataTransfer, canvas: Canvas) {
  dataTransfer.setData(CANVAS_WORKFLOW_DRAG_TYPE, JSON.stringify(canvas))
  dataTransfer.effectAllowed = 'copy'
}

export function readCanvasWorkflowDragPayload(dataTransfer: Pick<CanvasDragDataTransfer, 'getData'>): Canvas | null {
  const rawCanvas = dataTransfer.getData(CANVAS_WORKFLOW_DRAG_TYPE)
  if (!rawCanvas) return null
  try {
    const parsed = JSON.parse(rawCanvas) as Canvas
    if (parsed && Number.isInteger(parsed.ID) && parsed.ID > 0) return parsed
  } catch {
    return null
  }
  return null
}

export function hasCanvasDragPayload(types: readonly string[]) {
  return types.includes(CANVAS_NODE_TYPE_DRAG_TYPE) || types.includes(CANVAS_WORKFLOW_DRAG_TYPE)
}
