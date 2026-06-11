import { fromUiHandleId, uniqueEdgesByConnection } from './ports.js'

export interface CoreCanvasSerializableNodeLike {
  id: string
  type?: string
  position: {
    x: number
    y: number
  }
  parentId?: string | null
  style?: unknown
  data?: Record<string, unknown> | null
}

export interface CoreCanvasSerializableEdgeLike {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface CoreCanvasGraphSignatureInput<
  TNode extends CoreCanvasSerializableNodeLike,
  TEdge extends CoreCanvasSerializableEdgeLike,
> {
  canvasType: string
  nodes: TNode[]
  edges: TEdge[]
}

export function serializableCanvasNodeData(data: Record<string, unknown> | null | undefined) {
  const {
    label,
    cardMode: _cardMode,
    pluginInputProperties: _pluginInputProperties,
    availableResources: _availableResources,
    referenceResources: _referenceResources,
    runDiagnostics: _runDiagnostics,
    onRun: _onRun,
    onUpdateContent: _onUpdateContent,
    onUpdatePrompt: _onUpdatePrompt,
    onUpdateOutputType: _onUpdateOutputType,
    onUpdateModelId: _onUpdateModelId,
    onUpdateAttachments: _onUpdateAttachments,
    onUpdateParams: _onUpdateParams,
    onApprove: _onApprove,
    onReject: _onReject,
    canvasId: _canvasId,
    rfNodeId: _rfNodeId,
    pendingRuntimeInputs: _pendingRuntimeInputs,
    ...rest
  } = data ?? {}
  return { label, data: rest }
}

export function canvasGraphSignature<
  TNode extends CoreCanvasSerializableNodeLike,
  TEdge extends CoreCanvasSerializableEdgeLike,
>({
  canvasType,
  nodes,
  edges,
}: CoreCanvasGraphSignatureInput<TNode, TEdge>) {
  return JSON.stringify({
    canvasType,
    nodes: nodes.map((node) => {
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
