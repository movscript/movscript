import type { Node } from '@xyflow/react'
import type { CanvasNodeData, CanvasPortDef, NodeType } from '@movscript/shared'
import { CANVAS_NODE_DEFINITION_MAP } from './nodeDefinitions'
import {
  arePortTypesCompatible,
  edgeConnectionKey,
  fromUiHandleId,
  normalizeCanvasHandle,
  semanticHandlePrefix,
  toUiHandleId,
  uniqueEdgesByConnection,
} from '@movscript/core/canvas'
export {
  arePortTypesCompatible,
  edgeConnectionKey,
  fromUiHandleId,
  normalizeCanvasHandle,
  semanticHandlePrefix,
  toUiHandleId,
  uniqueEdgesByConnection,
} from '@movscript/core/canvas'

const MEDIA_NODE_TYPES = new Set<string>(['text', 'image', 'video'])

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
    const outputType = data.paramType === 'text' || data.paramType === 'image' || data.paramType === 'video' || data.paramType === 'audio'
      ? data.paramType
      : 'image'
    return side === 'target'
      ? [{ id: 'value', label: data.paramName || (data as any).label || node.id, type: outputType, required: true }]
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

export function portLabel(port?: CanvasPortDef) {
  if (!port) return 'unknown'
  return `${port.label ?? port.id} (${port.type})`
}
