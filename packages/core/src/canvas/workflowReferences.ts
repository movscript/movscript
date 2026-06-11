import type { CoreCanvasPortType, CoreCanvasPortValue } from './runtime.js'

export interface CoreCanvasReferencePortDef {
  id: string
  label: string
  type: CoreCanvasPortType
  order: number
  required?: boolean
}

export interface CoreCanvasReferenceNodeLike {
  node_id: string
  type?: string
  label?: string | null
  pos_x: number
  pos_y: number
  data?: string | null
}

export interface CoreCanvasReferenceCanvasLike {
  canvas_type?: string | null
  nodes?: CoreCanvasReferenceNodeLike[] | null
}

export interface CoreCanvasReferenceRuntimeNodeLike {
  data?: Record<string, unknown> | null
}

const CANVAS_PORT_TYPES = new Set<CoreCanvasPortType>([
  'text',
  'image',
  'video',
  'audio',
  'json',
  'number',
  'boolean',
  'resource',
])

function parseCanvasNodeData(raw?: string | null): Record<string, unknown> {
  if (!raw) return { source: 'manual' }
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : { source: 'manual' }
  } catch {
    return { source: 'manual' }
  }
}

function normalizePortType(type: unknown, fallback: CoreCanvasPortType): CoreCanvasPortType {
  return typeof type === 'string' && CANVAS_PORT_TYPES.has(type as CoreCanvasPortType)
    ? type as CoreCanvasPortType
    : fallback
}

function normalizeWorkflowOutputPortType(type: unknown): CoreCanvasPortType {
  return type === 'text' || type === 'image' || type === 'video' || type === 'audio' ? type : 'image'
}

function workflowNodeOrder(nodeData: Record<string, unknown>) {
  const order = Number(nodeData.paramOrder)
  return Number.isInteger(order) && order > 0 ? order : undefined
}

function compareWorkflowParamNodes(
  a: CoreCanvasReferenceNodeLike,
  b: CoreCanvasReferenceNodeLike,
) {
  const aData = parseCanvasNodeData(a.data)
  const bData = parseCanvasNodeData(b.data)
  const normalizedAOrder = workflowNodeOrder(aData) ?? Number.MAX_SAFE_INTEGER
  const normalizedBOrder = workflowNodeOrder(bData) ?? Number.MAX_SAFE_INTEGER
  if (normalizedAOrder !== normalizedBOrder) return normalizedAOrder - normalizedBOrder
  if (a.pos_y !== b.pos_y) return a.pos_y - b.pos_y
  if (a.pos_x !== b.pos_x) return a.pos_x - b.pos_x
  return a.node_id.localeCompare(b.node_id)
}

export function deriveCanvasReferencePorts(
  canvas: CoreCanvasReferenceCanvasLike,
): { inputs: CoreCanvasReferencePortDef[]; outputs: CoreCanvasReferencePortDef[] } {
  if ((canvas.canvas_type ?? 'inspiration') !== 'workflow') return { inputs: [], outputs: [] }

  const inputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'input').sort(compareWorkflowParamNodes)
  const outputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'output').sort(compareWorkflowParamNodes)

  const mapParamNodes = (
    nodes: CoreCanvasReferenceNodeLike[],
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
      const paramName = typeof nodeData.paramName === 'string' ? nodeData.paramName : undefined
      return {
        id: node.node_id,
        label: paramName || node.label || `${fallbackName}_${order}`,
        type: fallbackName === 'output'
          ? normalizeWorkflowOutputPortType(nodeData.paramType)
          : normalizePortType(nodeData.paramType, 'text'),
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

export function workflowInputValuesForReferenceNode<TValue extends CoreCanvasPortValue>({
  referencedCanvas,
  inputs,
}: {
  referencedCanvas: CoreCanvasReferenceCanvasLike
  inputs: Record<string, TValue[]>
}): Record<string, TValue> {
  const values: Record<string, TValue> = {}
  if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') return values

  const inputNodes = (referencedCanvas.nodes ?? []).filter((node) => node.type === 'input').sort(compareWorkflowParamNodes)
  for (const node of inputNodes) {
    const data = parseCanvasNodeData(node.data)
    const paramName = typeof data.paramName === 'string' ? data.paramName : undefined
    const candidates = [
      node.node_id,
      paramName,
      `value:${node.node_id}`,
      `value:${paramName ?? ''}`,
      'value',
      'input',
    ].filter((candidate): candidate is string => Boolean(candidate))
    const value = candidates
      .map((candidate) => inputs[candidate]?.find(Boolean))
      .find((candidate): candidate is TValue => Boolean(candidate))
    if (!value) continue
    values[node.node_id] = value
    if (paramName) values[paramName] = value
  }
  return values
}

export function workflowReferenceOutputsForNode<TValue extends CoreCanvasPortValue>({
  referenceNode,
  referencedCanvas,
  workflowOutputs,
}: {
  referenceNode: CoreCanvasReferenceRuntimeNodeLike
  referencedCanvas: CoreCanvasReferenceCanvasLike
  workflowOutputs: Record<string, TValue>
}): Record<string, TValue> {
  const outputs: Record<string, TValue> = {}
  const ports = deriveCanvasReferencePorts(referencedCanvas).outputs
  for (const port of ports) {
    const value = workflowOutputs[port.id] ?? workflowOutputs[port.label]
    if (!value) continue
    outputs[port.id] = value
  }

  const outputPorts = Array.isArray(referenceNode.data?.outputPorts)
    ? referenceNode.data.outputPorts
    : []
  for (const port of outputPorts) {
    if (!port || typeof port !== 'object') continue
    const { id, label } = port as { id?: unknown; label?: unknown }
    if (typeof id !== 'string' || outputs[id]) continue
    const value = workflowOutputs[id] ?? (typeof label === 'string' ? workflowOutputs[label] : undefined)
    if (value) outputs[id] = value
  }

  const first = Object.values(outputs)[0] ?? Object.values(workflowOutputs)[0]
  if (first) {
    outputs.result = outputs.result ?? first
    outputs.value = outputs.value ?? first
  }
  return outputs
}
