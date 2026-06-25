import type { Edge, Node } from '@xyflow/react'
import type { CanvasType } from '@movscript/shared'
import { ensureFinalOutputNode, normalizeWorkflowIoNodeOrders } from './graph'
import {
  canvasGraphSignature as coreCanvasGraphSignature,
  serializableCanvasNodeData as coreSerializableCanvasNodeData,
} from '@movscript/core/canvas'

export function serializableCanvasNodeData(data: Node['data']) {
  return coreSerializableCanvasNodeData(data as Record<string, unknown>)
}

export function canvasGraphSignature({
  canvasType,
  nodes,
  edges,
  t,
}: {
  canvasType: CanvasType
  nodes: Node[]
  edges: Edge[]
  t: (key: string, options?: any) => string
}) {
  const nodesToSave = canvasType === 'workflow'
    ? normalizeWorkflowIoNodeOrders(ensureFinalOutputNode(nodes, t))
    : nodes
  return coreCanvasGraphSignature({
    canvasType,
    nodes: nodesToSave,
    edges,
  })
}
