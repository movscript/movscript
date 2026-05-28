import type { Edge, Node } from '@xyflow/react'
import type { CanvasType } from '@/types'
import { fromUiHandleId, uniqueEdgesByConnection } from './ports'
import { ensureFinalOutputNode, normalizeWorkflowIoNodeOrders } from './graph'

export function serializableCanvasNodeData(data: Node['data']) {
  const {
    label,
    cardMode: _cardMode,
    pluginInputProperties: _pluginInputProperties,
    availableResources: _availableResources,
    referenceResources: _referenceResources,
    runDiagnostics: _runDiagnostics,
    onRun,
    onUpdateContent,
    onUpdatePrompt,
    onUpdateOutputType,
    onUpdateModelId,
    onUpdateAttachments,
    onUpdateParams,
    onApprove,
    onReject,
    canvasId: _canvasId,
    rfNodeId: _rfNodeId,
    pendingRuntimeInputs: _pendingRuntimeInputs,
    ...rest
  } = data as any
  return { label, data: rest }
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
  return JSON.stringify({
    canvasType,
    nodes: nodesToSave.map((node) => {
      const { label, data } = serializableCanvasNodeData(node.data)
      return {
        id: node.id,
        type: node.type,
        label: label ?? '',
        x: node.position.x,
        y: node.position.y,
        parentId: node.parentId ?? null,
        style: node.style ?? null,
        data,
      }
    }),
    edges: uniqueEdgesByConnection(edges).map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: fromUiHandleId(edge.sourceHandle) ?? null,
      targetHandle: fromUiHandleId(edge.targetHandle) ?? null,
    })),
  })
}
