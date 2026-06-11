import {
  CANVAS_NODE_TYPE_DRAG_TYPE,
  CANVAS_WORKFLOW_DRAG_TYPE,
  hasCanvasDragPayload,
  readCanvasNodeTypeDragPayload as readCoreCanvasNodeTypeDragPayload,
  readCanvasWorkflowDragPayload as readCoreCanvasWorkflowDragPayload,
  writeCanvasNodeTypeDragPayload as writeCoreCanvasNodeTypeDragPayload,
  writeCanvasWorkflowDragPayload as writeCoreCanvasWorkflowDragPayload,
  type CanvasDragDataTransfer,
} from '@movscript/core/canvas'
import type { Canvas, NodeType } from '@/types'

export {
  CANVAS_NODE_TYPE_DRAG_TYPE,
  CANVAS_WORKFLOW_DRAG_TYPE,
  hasCanvasDragPayload,
  type CanvasDragDataTransfer,
}

export function writeCanvasNodeTypeDragPayload(dataTransfer: CanvasDragDataTransfer, nodeType: NodeType) {
  writeCoreCanvasNodeTypeDragPayload(dataTransfer, nodeType)
}

export function readCanvasNodeTypeDragPayload(dataTransfer: Pick<CanvasDragDataTransfer, 'getData'>): NodeType | null {
  return readCoreCanvasNodeTypeDragPayload<NodeType>(dataTransfer)
}

export function writeCanvasWorkflowDragPayload(dataTransfer: CanvasDragDataTransfer, canvas: Canvas) {
  writeCoreCanvasWorkflowDragPayload(dataTransfer, canvas)
}

export function readCanvasWorkflowDragPayload(dataTransfer: Pick<CanvasDragDataTransfer, 'getData'>): Canvas | null {
  return readCoreCanvasWorkflowDragPayload<Canvas>(dataTransfer)
}
