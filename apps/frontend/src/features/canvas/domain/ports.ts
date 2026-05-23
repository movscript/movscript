import type { Edge, Node } from '@xyflow/react'
import type { CanvasNodeData, CanvasPortDef, NodeType } from '@/types'
import { CANVAS_NODE_DEFINITION_MAP } from './nodeDefinitions'

const MEDIA_NODE_TYPES = new Set<string>(['text', 'image', 'video'])

export function normalizeCanvasHandle(handle: string | null | undefined) {
  if (!handle) return ''
  if (handle.startsWith('in:')) return handle.slice(3).replace(/^:+/, '')
  if (handle.startsWith('out:')) return handle.slice(4).replace(/^:+/, '')
  return handle.replace(/^:+/, '')
}

export function semanticHandlePrefix(side: 'source' | 'target') {
  return side === 'source' ? 'out:' : 'in:'
}

export function toUiHandleId(handle: string | null | undefined, side: 'source' | 'target') {
  if (!handle) return handle
  if (handle.startsWith('in:') || handle.startsWith('out:')) {
    const portId = normalizeCanvasHandle(handle)
    return portId ? `${semanticHandlePrefix(side)}${portId}` : handle
  }
  return `${semanticHandlePrefix(side)}${handle.replace(/^:+/, '')}`
}

export const fromUiHandleId = normalizeCanvasHandle

export function defaultHandleForType(type: NodeType | string | undefined, side: 'source' | 'target') {
  if (!type) return undefined
  const meta = CANVAS_NODE_DEFINITION_MAP[type as NodeType]
  const ports = side === 'source' ? meta?.outputs : meta?.inputs
  return ports?.[0]?.id ?? (!meta ? (side === 'source' ? 'result' : 'input') : undefined)
}

export function defaultHandleForNode(node: Node | undefined, side: 'source' | 'target') {
  const data = node?.data as Partial<CanvasNodeData> | undefined
  const customPorts = side === 'source' ? data?.outputPorts : data?.inputPorts
  if (customPorts?.[0]) return customPorts[0].id
  return defaultHandleForType(node?.type, side)
}

export function portsForNode(node: Node | undefined, side: 'source' | 'target'): CanvasPortDef[] {
  if (!node) return []
  const data = node.data as Partial<CanvasNodeData>
  if (side === 'target' && MEDIA_NODE_TYPES.has(String(node.type)) && data.source !== 'ai') {
    return []
  }
  if (node.type === 'input') {
    return side === 'source'
      ? [{ id: 'value', label: data.paramName || (data as any).label || node.id, type: data.paramType ?? 'text', required: true }]
      : []
  }
  if (node.type === 'output') {
    return side === 'target'
      ? [{ id: 'value', label: data.paramName || (data as any).label || node.id, type: data.paramType ?? 'resource', required: true }]
      : []
  }
  if (node.type === 'resource_sink') {
    return side === 'target'
      ? [{ id: 'input', label: 'resource', type: 'resource', required: true }]
      : []
  }
  const customPorts = side === 'source' ? data.outputPorts : data.inputPorts
  if (customPorts) return customPorts
  const meta = CANVAS_NODE_DEFINITION_MAP[node.type as NodeType]
  const metaPorts = side === 'source' ? meta?.outputs : meta?.inputs
  if (metaPorts) return metaPorts
  return [{ id: side === 'source' ? 'result' : 'input', label: side === 'source' ? 'Result' : 'Input', type: 'resource' }]
}

export function portForHandle(node: Node | undefined, side: 'source' | 'target', handle?: string | null) {
  const ports = portsForNode(node, side)
  if (ports.length === 0) return undefined
  const portId = normalizeCanvasHandle(handle)
  return ports.find((port) => port.id === portId) ?? ports[0]
}

export function arePortTypesCompatible(sourceType?: string, targetType?: string) {
  if (!sourceType || !targetType) return true
  if (sourceType === targetType) return true
  if (sourceType === 'resource' || targetType === 'resource') return true
  return false
}

export function portLabel(port?: CanvasPortDef) {
  if (!port) return 'unknown'
  return `${port.label ?? port.id} (${port.type})`
}

export function edgeConnectionKey(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return [
    edge.source,
    normalizeCanvasHandle(edge.sourceHandle) ?? '',
    edge.target,
    normalizeCanvasHandle(edge.targetHandle) ?? '',
  ].join('::')
}

export function uniqueEdgesByConnection<T extends Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>>(edgeList: T[]) {
  const seen = new Set<string>()
  return edgeList.filter((edge) => {
    const key = edgeConnectionKey(edge)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
