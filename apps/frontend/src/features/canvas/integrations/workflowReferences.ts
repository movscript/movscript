import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Node } from '@xyflow/react'
import { api } from '@/lib/api'
import type { Canvas, CanvasNodeData, CanvasParamType, CanvasPortDef } from '@/types'

function parseCanvasNodeData(raw?: string): CanvasNodeData {
  if (!raw) return { source: 'manual' }
  try {
    return JSON.parse(raw) as CanvasNodeData
  } catch {
    return { source: 'manual' }
  }
}

function normalizePortType(type?: CanvasParamType): CanvasPortDef['type'] {
  return type ?? 'resource'
}

export function deriveCanvasReferencePorts(canvas: Canvas): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
  const inputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'input')
  const outputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'output')

  return {
    inputs: inputNodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || node.node_id,
        type: normalizePortType(nodeData.paramType ?? 'text'),
        required: true,
      }
    }),
    outputs: outputNodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || node.node_id,
        type: normalizePortType(nodeData.paramType),
      }
    }),
  }
}

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
