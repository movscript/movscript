import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Node } from '@xyflow/react'
import { api } from '@/shared/infrastructure/api'
import type { Canvas, CanvasNodeData, CanvasParamType, CanvasPortDef, CanvasPortValue } from '@/types'

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

function normalizeWorkflowOutputPortType(type?: CanvasParamType): CanvasPortDef['type'] {
  return type === 'text' || type === 'image' || type === 'video' || type === 'audio' ? type : 'image'
}

function workflowNodeOrder(
  nodeData: Partial<CanvasNodeData>,
) {
  const order = Number(nodeData.paramOrder)
  return Number.isInteger(order) && order > 0 ? order : undefined
}

function compareWorkflowParamNodes(
  a: NonNullable<Canvas['nodes']>[number],
  b: NonNullable<Canvas['nodes']>[number],
) {
  const aData = parseCanvasNodeData(a.data)
  const bData = parseCanvasNodeData(b.data)
  const aOrder = Number(aData.paramOrder)
  const bOrder = Number(bData.paramOrder)
  const normalizedAOrder = Number.isInteger(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER
  const normalizedBOrder = Number.isInteger(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER
  if (normalizedAOrder !== normalizedBOrder) return normalizedAOrder - normalizedBOrder
  if (a.pos_y !== b.pos_y) return a.pos_y - b.pos_y
  if (a.pos_x !== b.pos_x) return a.pos_x - b.pos_x
  return a.node_id.localeCompare(b.node_id)
}

export function deriveCanvasReferencePorts(canvas: Canvas): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
  if ((canvas.canvas_type ?? 'inspiration') !== 'workflow') return { inputs: [], outputs: [] }

  const inputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'input').sort(compareWorkflowParamNodes)
  const outputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'output').sort(compareWorkflowParamNodes)

  const mapParamNodes = (
    nodes: NonNullable<Canvas['nodes']>,
    fallbackName: 'input' | 'output',
    required: boolean,
  ) => {
    let nextOrder = 1
    const usedOrders = new Set(nodes
      .map((node) => workflowNodeOrder(parseCanvasNodeData(node.data)))
      .filter((order): order is number => order !== undefined))
    return nodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      const order = workflowNodeOrder(nodeData) ?? (() => {
        while (usedOrders.has(nextOrder)) nextOrder += 1
        const assigned = nextOrder
        usedOrders.add(assigned)
        nextOrder += 1
        return assigned
      })()
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || `${fallbackName}_${order}`,
        type: fallbackName === 'output'
          ? normalizeWorkflowOutputPortType(nodeData.paramType)
          : normalizePortType(nodeData.paramType ?? 'text'),
        order,
        ...(required ? { required: true } : {}),
      }
    })
  }

  return {
    inputs: mapParamNodes(inputNodes, 'input', true),
    outputs: mapParamNodes(outputNodes, 'output', false),
  }
}

export function workflowInputValuesForReferenceNode({
  referencedCanvas,
  inputs,
}: {
  referencedCanvas: Canvas
  inputs: Record<string, CanvasPortValue[]>
}): Record<string, CanvasPortValue> {
  const values: Record<string, CanvasPortValue> = {}
  if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') return values

  const inputNodes = (referencedCanvas.nodes ?? []).filter((node) => node.type === 'input').sort(compareWorkflowParamNodes)
  for (const node of inputNodes) {
    const data = parseCanvasNodeData(node.data)
    const candidates = [
      node.node_id,
      data.paramName,
      `value:${node.node_id}`,
      `value:${data.paramName ?? ''}`,
      'value',
      'input',
    ].filter((candidate): candidate is string => Boolean(candidate))
    const value = candidates
      .map((candidate) => inputs[candidate]?.find(Boolean))
      .find((candidate): candidate is CanvasPortValue => Boolean(candidate))
    if (!value) continue
    values[node.node_id] = value
    if (data.paramName) values[data.paramName] = value
  }
  return values
}

export function workflowReferenceOutputsForNode({
  referenceNode,
  referencedCanvas,
  workflowOutputs,
}: {
  referenceNode: Node
  referencedCanvas: Canvas
  workflowOutputs: Record<string, CanvasPortValue>
}): Record<string, CanvasPortValue> {
  const outputs: Record<string, CanvasPortValue> = {}
  const ports = deriveCanvasReferencePorts(referencedCanvas).outputs
  for (const port of ports) {
    const value = workflowOutputs[port.id] ?? workflowOutputs[port.label ?? '']
    if (!value) continue
    outputs[port.id] = value
  }

  const data = referenceNode.data as Partial<CanvasNodeData>
  for (const port of data.outputPorts ?? []) {
    if (outputs[port.id]) continue
    const value = workflowOutputs[port.id] ?? workflowOutputs[port.label ?? '']
    if (value) outputs[port.id] = value
  }

  const first = Object.values(outputs)[0] ?? Object.values(workflowOutputs)[0]
  if (first) {
    outputs.result = outputs.result ?? first
    outputs.value = outputs.value ?? first
  }
  return outputs
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
