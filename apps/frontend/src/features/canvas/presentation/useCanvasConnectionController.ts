import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { addEdge, type Connection, type Edge, type Node } from '@xyflow/react'
import type { TFunction } from 'i18next'

import {
  arePortTypesCompatible,
  defaultHandleForNode,
  edgeConnectionKey,
  fromUiHandleId,
  portForHandle,
  portLabel,
  toUiHandleId,
} from '@/features/canvas/domain/ports'
import { createCanvasEdgeId } from '@/features/canvas/editor/nodeFactory'
import { toast } from '@/shared/ui/toastStore'

export function useCanvasConnectionController({
  edges,
  nodes,
  setEdges,
  t,
}: {
  edges: Edge[]
  nodes: Node[]
  setEdges: Dispatch<SetStateAction<Edge[]>>
  t: TFunction
}) {
  return useCallback((params: Connection) => {
    const sourceNode = nodes.find((node) => node.id === params.source)
    const targetNode = nodes.find((node) => node.id === params.target)
    const sourceHandle = params.sourceHandle ?? toUiHandleId(defaultHandleForNode(sourceNode, 'source'), 'source') ?? null
    const targetHandle = params.targetHandle ?? toUiHandleId(defaultHandleForNode(targetNode, 'target'), 'target') ?? null
    const sourcePort = portForHandle(sourceNode, 'source', sourceHandle)
    const targetPort = portForHandle(targetNode, 'target', targetHandle)

    if (!sourcePort || !targetPort) {
      toast.error(
        t('canvas.editor.invalidConnection', { defaultValue: 'Invalid connection' }),
        t('canvas.editor.missingPortConnection', { defaultValue: 'This node does not accept that connection.' }),
      )
      return
    }

    if (!arePortTypesCompatible(sourcePort.type, targetPort.type)) {
      toast.error(
        t('canvas.editor.invalidConnection', { defaultValue: 'Invalid connection' }),
        `${portLabel(sourcePort)} -> ${portLabel(targetPort)}`,
      )
      return
    }

    if (targetPort?.maxCount && targetNode) {
      const targetPortId = fromUiHandleId(targetHandle)
      const existingCount = edges.filter((edge) => (
        edge.target === targetNode.id
        && (fromUiHandleId(edge.targetHandle) ?? defaultHandleForNode(targetNode, 'target') ?? null) === targetPortId
      )).length
      if (existingCount >= targetPort.maxCount) {
        toast.error(
          t('canvas.editor.portLimitReached', { defaultValue: 'Input port limit reached' }),
          `${targetPort.label ?? targetPort.id}: ${targetPort.maxCount}`,
        )
        return
      }
    }

    const nextEdge: Edge = {
      ...params,
      id: createCanvasEdgeId({ source: params.source, target: params.target, sourceHandle, targetHandle }),
      sourceHandle,
      targetHandle,
    }
    setEdges((currentEdges) => currentEdges.some((edge) => edgeConnectionKey(edge) === edgeConnectionKey(nextEdge))
      ? currentEdges
      : addEdge(nextEdge, currentEdges))
  }, [edges, nodes, setEdges, t])
}
