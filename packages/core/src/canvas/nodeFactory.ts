import { edgeConnectionKey, type CanvasEdgeConnectionLike } from './ports.js'

export interface CoreCanvasNodeFactoryNodeLike {
  id: string
  type?: string
  data?: Record<string, unknown> | null
}

export function createCanvasEdgeId(edge: CanvasEdgeConnectionLike, suffix: string) {
  return `${edgeConnectionKey(edge)}::${suffix}`
}

export function readOnlyMediaPortPatch(source: unknown): { inputPorts?: [] } {
  return source === 'ai' ? { inputPorts: undefined } : { inputPorts: [] }
}

export function nextWorkflowParamOrder(
  nodes: CoreCanvasNodeFactoryNodeLike[],
  type: 'input' | 'output',
) {
  const usedOrders = nodes
    .filter((node) => node.type === type)
    .map((node) => Number(node.data?.paramOrder))
    .filter((value) => Number.isInteger(value) && value > 0)
  return usedOrders.length > 0 ? Math.max(...usedOrders) + 1 : 1
}

export function workflowIoDataPatch({
  type,
  existingNodes,
  label,
}: {
  type: string
  existingNodes?: CoreCanvasNodeFactoryNodeLike[]
  label: string
}): Record<string, unknown> {
  if (type !== 'input' && type !== 'output') return {}
  const ioType = type === 'input' ? 'input' : 'output'
  const order = nextWorkflowParamOrder(existingNodes ?? [], ioType)
  return {
    label: `${label} ${order}`,
    paramName: `${ioType}_${order}`,
    paramOrder: order,
  }
}
