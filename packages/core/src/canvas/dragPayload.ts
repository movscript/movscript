export const CANVAS_NODE_TYPE_DRAG_TYPE = 'application/canvas-node-type'
export const CANVAS_WORKFLOW_DRAG_TYPE = 'application/canvas-workflow'

export interface CanvasDragDataTransfer {
  types?: readonly string[]
  setData(type: string, data: string): void
  getData(type: string): string
  effectAllowed?: string
}

export interface CanvasWorkflowDragPayload {
  ID: number
}

export function writeCanvasNodeTypeDragPayload<TNodeType extends string>(
  dataTransfer: CanvasDragDataTransfer,
  nodeType: TNodeType,
): void {
  dataTransfer.setData(CANVAS_NODE_TYPE_DRAG_TYPE, nodeType)
  dataTransfer.effectAllowed = 'copy'
}

export function readCanvasNodeTypeDragPayload<TNodeType extends string = string>(
  dataTransfer: Pick<CanvasDragDataTransfer, 'getData'>,
): TNodeType | null {
  const nodeType = dataTransfer.getData(CANVAS_NODE_TYPE_DRAG_TYPE).trim()
  return nodeType ? nodeType as TNodeType : null
}

export function writeCanvasWorkflowDragPayload<TCanvas extends CanvasWorkflowDragPayload>(
  dataTransfer: CanvasDragDataTransfer,
  canvas: TCanvas,
): void {
  dataTransfer.setData(CANVAS_WORKFLOW_DRAG_TYPE, JSON.stringify(canvas))
  dataTransfer.effectAllowed = 'copy'
}

export function readCanvasWorkflowDragPayload<TCanvas extends CanvasWorkflowDragPayload = CanvasWorkflowDragPayload>(
  dataTransfer: Pick<CanvasDragDataTransfer, 'getData'>,
): TCanvas | null {
  const rawCanvas = dataTransfer.getData(CANVAS_WORKFLOW_DRAG_TYPE)
  if (!rawCanvas) return null
  try {
    const parsed = JSON.parse(rawCanvas) as TCanvas
    if (parsed && Number.isInteger(parsed.ID) && parsed.ID > 0) return parsed
  } catch {
    return null
  }
  return null
}

export function hasCanvasDragPayload(types: readonly string[]): boolean {
  return types.includes(CANVAS_NODE_TYPE_DRAG_TYPE) || types.includes(CANVAS_WORKFLOW_DRAG_TYPE)
}
