import type { Edge, Node } from '@xyflow/react'
import type { CanvasNodeData, CanvasPortDef, CanvasPortType, CanvasPortValue, RawResource } from '@movscript/shared'
import { defaultHandleForNode, normalizeCanvasHandle, portsForNode } from '../domain/ports'
import {
  firstRuntimeValue,
  inputResourceIdsFromValues,
  resourceIdsFromCanvasPrompt,
  runtimePromptForNode,
  runtimeResourceIdsForNode,
  topoSortCanvasNodes,
  valuesHaveRuntimeValue,
} from '@movscript/core/canvas'

export {
  firstRuntimeValue,
  inputResourceIdsFromValues,
  resourceIdsFromCanvasPrompt,
  runtimePromptForNode,
  runtimeResourceIdsForNode,
  topoSortCanvasNodes,
  valuesHaveRuntimeValue,
} from '@movscript/core/canvas'

export type CanvasRuntimeInputValues = Record<string, CanvasPortValue | CanvasPortValue[]>
export type CanvasRuntimeOutputValues = Record<string, CanvasPortValue>
export type CanvasRuntimeOutputCache = Record<string, CanvasRuntimeOutputValues>

export interface CanvasRuntimeGraphInput {
  nodes: Node[]
  edges: Edge[]
  resourceById?: Map<number, RawResource>
  outputCache?: CanvasRuntimeOutputCache
  runtimeInputs?: CanvasRuntimeInputValues
}

export interface CanvasRuntimeCollectedInputs {
  values: Record<string, CanvasPortValue[]>
  upstreamNodeIds: string[]
}

const MEDIA_PORT_TYPES = new Set<CanvasPortType>(['image', 'video', 'audio', 'text', 'resource'])

export function collectCanvasNodeInputs(input: CanvasRuntimeGraphInput & { nodeId: string }): CanvasRuntimeCollectedInputs {
  const target = input.nodes.find((node) => node.id === input.nodeId)
  const values: Record<string, CanvasPortValue[]> = {}
  const upstreamNodeIds: string[] = []

  for (const [handle, value] of Object.entries(input.runtimeInputs ?? {})) {
    appendValues(values, handle, normalizePortValueList(value))
  }

  for (const edge of input.edges) {
    if (edge.target !== input.nodeId) continue
    const source = input.nodes.find((node) => node.id === edge.source)
    if (!source) continue
    const targetHandle = normalizeCanvasHandle(edge.targetHandle) || defaultHandleForNode(target, 'target') || 'input'
    const sourceHandle = normalizeCanvasHandle(edge.sourceHandle) || defaultHandleForNode(source, 'source') || 'result'
    const value = canvasNodeOutputValue(source, sourceHandle, input)
    if (!value) continue
    appendValues(values, targetHandle, [applyTargetPortResourceMetadata(value, target, targetHandle)])
    upstreamNodeIds.push(source.id)
  }

  return { values, upstreamNodeIds: [...new Set(upstreamNodeIds)] }
}

export function canvasRuntimeOrderForNode(nodeId: string, nodes: Node[], edges: Edge[]) {
  const upstream = new Set<string>()
  const visit = (id: string) => {
    for (const edge of edges) {
      if (edge.target !== id) continue
      if (upstream.has(edge.source)) continue
      upstream.add(edge.source)
      visit(edge.source)
    }
  }
  visit(nodeId)
  return topoSortCanvasNodes(nodes.filter((node) => upstream.has(node.id) || node.id === nodeId), edges)
}

export function canvasNodeOutputValue(
  node: Node,
  handle: string | undefined,
  input: Pick<CanvasRuntimeGraphInput, 'resourceById' | 'outputCache'> = {},
): CanvasPortValue | undefined {
  const port = normalizeCanvasHandle(handle) || defaultHandleForNode(node, 'source') || 'result'
  const cached = input.outputCache?.[node.id]
  if (cached) {
    return cached[port] ?? cached.result ?? cached.value ?? cached[node.id] ?? Object.values(cached)[0]
  }

  const data = node.data as Partial<CanvasNodeData>
  const resourceId = data.resource?.ID
    ?? (data.resourceId ? input.resourceById?.get(data.resourceId)?.ID : undefined)
    ?? data.resourceId
  if (resourceId && Number.isInteger(resourceId) && resourceId > 0) {
    const resource = data.resource ?? input.resourceById?.get(resourceId)
    const type = canvasOutputValueType(node, port, resource)
    return {
      type,
      resource_id: resourceId,
      media_type: canvasResourceValueMediaType(type, data.outputPorts?.find((item) => item.id === port), resource),
      ...(data.outputPorts?.find((item) => item.id === port)?.role ? { role: data.outputPorts.find((item) => item.id === port)?.role } : {}),
      resource,
    }
  }

  const text = data.textContent ?? data.inputValue
  if (text !== undefined) return { type: 'text', text }
  return undefined
}

export function reusableCanvasNodeOutputValues(
  node: Node,
  input: Pick<CanvasRuntimeGraphInput, 'resourceById' | 'outputCache'> = {},
): CanvasRuntimeOutputValues | undefined {
  const primary = canvasNodeOutputValue(node, undefined, input)
  if (!primary || !isReusablePersistedCanvasOutput(node, primary)) return undefined

  const outputs: CanvasRuntimeOutputValues = {}
  for (const port of portsForNode(node, 'source')) {
    const value = canvasNodeOutputValue(node, port.id, input)
    if (value) outputs[port.id] = value
  }

  const defaultPort = defaultHandleForNode(node, 'source')
  if (defaultPort) outputs[defaultPort] = outputs[defaultPort] ?? primary
  outputs[primary.type] = outputs[primary.type] ?? primary
  outputs.result = outputs.result ?? primary
  outputs.value = outputs.value ?? primary
  outputs[node.id] = outputs[node.id] ?? primary
  return outputs
}

function normalizePortValueList(value: CanvasPortValue | CanvasPortValue[]) {
  return (Array.isArray(value) ? value : [value]).filter(Boolean)
}

function appendValues(target: Record<string, CanvasPortValue[]>, handle: string, values: CanvasPortValue[]) {
  if (values.length === 0) return
  target[handle] = [...(target[handle] ?? []), ...values]
}

function applyTargetPortResourceMetadata(value: CanvasPortValue, target: Node | undefined, targetHandle: string): CanvasPortValue {
  if (!value.resource_id) return value
  const data = target?.data as Partial<CanvasNodeData> | undefined
  const port = data?.inputPorts?.find((item) => item.id === targetHandle || item.aliases?.includes(targetHandle))
  if (!port) return value
  return {
    ...value,
    media_type: canvasResourceValueMediaType(value.type, port, value.resource),
    ...(port.role ? { role: port.role } : {}),
  }
}

function canvasResourceValueMediaType(type: CanvasPortType, port: Partial<CanvasPortDef> | undefined, resource: RawResource | undefined) {
  if (port?.mediaType && port.mediaType !== 'any') return port.mediaType
  if (resource?.type === 'image' || resource?.type === 'video' || resource?.type === 'audio' || resource?.type === 'text') return resource.type
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'text') return type
  return undefined
}

function mediaTypeForNode(type: string | undefined): CanvasPortType {
  if (type === 'image' || type === 'reference_to_image') return 'image'
  if (type === 'video' || type === 'reference_to_video') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'text' || type === 'text_gen') return 'text'
  return 'resource'
}

function canvasOutputValueType(node: Node, portId: string, resource: RawResource | undefined): CanvasPortType {
  if (resource?.type === 'image' || resource?.type === 'video' || resource?.type === 'audio' || resource?.type === 'text') return resource.type
  const data = node.data as Partial<CanvasNodeData>
  const portType = data.outputPorts?.find((port) => port.id === portId)?.type
  if (portType && MEDIA_PORT_TYPES.has(portType)) return portType
  return mediaTypeForNode(node.type)
}

function isReusablePersistedCanvasOutput(node: Node, value: CanvasPortValue) {
  const data = node.data as Partial<CanvasNodeData>
  if (data.source !== 'ai') return false
  return value.resource_id !== undefined || value.text !== undefined
}

function positiveInteger(value: unknown) {
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : NaN
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}
