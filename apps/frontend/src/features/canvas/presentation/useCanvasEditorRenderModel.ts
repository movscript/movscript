import { useMemo } from 'react'
import { MarkerType, type Edge, type Node } from '@xyflow/react'

import type { CanvasDebugOptions } from '@/features/canvas/presentation/canvasDebugOptions'
import {
  defaultHandleForNode,
  fromUiHandleId,
  portForHandle,
} from '@/features/canvas/domain/ports'
import type { CanvasNodeData, CanvasParamType, RawResource } from '@/types'

export function useCanvasEditorRenderModel({
  canvasDebug,
  canvasId,
  canvasMediaLightweightMode,
  canvasNodeResourceById,
  canvasNodeResources,
  canvasOverviewMode,
  edges,
  nodes,
  runNode,
  updateNodeData,
}: {
  canvasDebug: CanvasDebugOptions
  canvasId: string
  canvasMediaLightweightMode: boolean
  canvasNodeResourceById: Map<number, RawResource>
  canvasNodeResources: RawResource[]
  canvasOverviewMode: boolean
  edges: Edge[]
  nodes: Node[]
  runNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => void
}) {
  const nodesWithHandlers = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const incomingEdgesByTarget = new Map<string, Edge[]>()
    for (const edge of edges) {
      const incoming = incomingEdgesByTarget.get(edge.target)
      if (incoming) incoming.push(edge)
      else incomingEdgesByTarget.set(edge.target, [edge])
    }
    return nodes.map((node) => {
      const referenceResources: RawResource[] = []
      const seenReferenceResourceIds = new Set<number>()
      for (const edge of incomingEdgesByTarget.get(node.id) ?? []) {
        const targetPort = portForHandle(node, 'target', edge.targetHandle)
        if (!targetPort || !['resource', 'image', 'video', 'audio'].includes(targetPort.type)) continue
        const sourceNode = nodeById.get(edge.source)
        const sourceData = sourceNode?.data as Partial<CanvasNodeData> | undefined
        const resource = sourceData?.resource ?? (sourceData?.resourceId ? canvasNodeResourceById.get(sourceData.resourceId) : undefined)
        if (!resource || seenReferenceResourceIds.has(resource.ID)) continue
        seenReferenceResourceIds.add(resource.ID)
        referenceResources.push(resource)
      }
      return {
        ...node,
        data: {
          ...node.data,
          canvasId,
          rfNodeId: node.id,
          availableResources: canvasNodeResources,
          referenceResources,
          canvasDebug,
          canvasOverviewMode,
          canvasMediaLightweightMode,
          onRun: node.type !== 'group' && node.type !== 'plugin_card' ? () => runNode(node.id) : undefined,
          onUpdateContent: (content: string) => {
            const currentData = node.data as Partial<CanvasNodeData>
            if (node.type === 'text' && (currentData.resourceId || currentData.resource)) {
              updateNodeData(node.id, {
                textContent: content,
                resourceId: undefined,
                resource: undefined,
                source: 'manual',
                status: content.trim() ? 'done' : 'idle',
              })
              return
            }
            updateNodeData(node.id, { textContent: content })
          },
          onUpdatePrompt: (prompt: string) => updateNodeData(node.id, { prompt }),
          onUpdateOutputType: (outputType: string) => updateNodeData(node.id, { outputType } as Partial<CanvasNodeData>),
          onUpdateModelId: (modelId: string, modelDbId?: number) => updateNodeData(node.id, { modelId, modelDbId }),
          onUpdateAttachments: (ids: number[]) => updateNodeData(node.id, { inputResourceIds: ids }),
          onUpdateParams: (params: Record<string, unknown>) => updateNodeData(node.id, { params }),
          onUpdateParamName: (paramName: string) => updateNodeData(node.id, { paramName }),
          onUpdateParamOrder: (paramOrder: number) => updateNodeData(node.id, { paramOrder }),
          onUpdateParamType: (paramType: CanvasParamType) => updateNodeData(node.id, { paramType }),
          onApprove: () => updateNodeData(node.id, { approvalStatus: 'approved' }),
          onReject: () => updateNodeData(node.id, { approvalStatus: 'rejected' }),
        },
      }
    })
  }, [
    canvasDebug,
    canvasId,
    canvasMediaLightweightMode,
    canvasNodeResourceById,
    canvasNodeResources,
    canvasOverviewMode,
    edges,
    nodes,
    runNode,
    updateNodeData,
  ])

  const renderedNodes = useMemo(() => canvasDebug.nodes ? nodesWithHandlers : [], [canvasDebug.nodes, nodesWithHandlers])
  const visibleEdges = useMemo(() => {
    if (!canvasDebug.nodes || !canvasDebug.edges) return []
    return edges.map((edge) => ({
      ...edge,
      markerEnd: canvasOverviewMode ? undefined : (edge.markerEnd ?? { type: MarkerType.ArrowClosed, width: 14, height: 14 }),
      style: {
        ...edge.style,
        strokeWidth: canvasOverviewMode ? 1 : (edge.style?.strokeWidth ?? 1.6),
      },
    }))
  }, [canvasDebug.edges, canvasDebug.nodes, canvasOverviewMode, edges])

  return { renderedNodes, visibleEdges }
}
