import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Node } from '@xyflow/react'
import { api } from '@/shared/infrastructure/api'
import type { Canvas, CanvasNodeData } from '@/types'
import {
  deriveCanvasReferencePorts,
  workflowInputValuesForReferenceNode,
  workflowReferenceOutputsForNode,
} from '@movscript/core/canvas'

export {
  deriveCanvasReferencePorts,
  workflowInputValuesForReferenceNode,
  workflowReferenceOutputsForNode,
} from '@movscript/core/canvas'

export function useCanvasWorkflowReferencePorts({
  nodes,
  setNodes,
}: {
  nodes: Node[]
  setNodes: Dispatch<SetStateAction<Node[]>>
}) {
  const referencedWorkflowCanvasIds = useMemo(() => {
    const ids = new Set<number>()
    nodes.forEach((node) => {
      if (node.type !== 'canvas') return
      const data = node.data as Partial<CanvasNodeData>
      if (data.referencedCanvasId) ids.add(data.referencedCanvasId)
    })
    return [...ids].sort((a, b) => a - b)
  }, [nodes])

  const referencedWorkflowCanvasQueries = useQueries({
    queries: referencedWorkflowCanvasIds.map((canvasId) => ({
      queryKey: ['canvas', canvasId],
      queryFn: () => api.get(`/canvases/${canvasId}`).then((response) => response.data as Canvas),
      enabled: !!canvasId,
    })),
  })

  const referencedWorkflowCanvasById = useMemo(() => {
    const map = new Map<number, Canvas>()
    referencedWorkflowCanvasQueries.forEach((query) => {
      if (query.data?.ID) map.set(query.data.ID, query.data)
    })
    return map
  }, [referencedWorkflowCanvasQueries])

  useEffect(() => {
    if (referencedWorkflowCanvasById.size === 0) return
    setNodes((prev) => {
      let changed = false
      const next = prev.map((node) => {
        if (node.type !== 'canvas') return node
        const data = node.data as unknown as CanvasNodeData
        if (!data.referencedCanvasId) return node
        const referencedCanvas = referencedWorkflowCanvasById.get(data.referencedCanvasId)
        if (!referencedCanvas) return node
        const nextPorts = deriveCanvasReferencePorts(referencedCanvas)
        const currentSig = JSON.stringify({ inputs: data.inputPorts ?? [], outputs: data.outputPorts ?? [] })
        const nextSig = JSON.stringify(nextPorts)
        if (currentSig === nextSig) return node
        changed = true
        return {
          ...node,
          data: {
            ...data,
            inputPorts: nextPorts.inputs,
            outputPorts: nextPorts.outputs,
          },
        }
      })
      return changed ? next : prev
    })
  }, [referencedWorkflowCanvasById, setNodes])
}
