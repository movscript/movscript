import type { Edge, Node } from '@xyflow/react'
import type { CanvasNodeData, CanvasPortDef, CanvasPortType, CanvasPortValue, NodeType, RawResource } from '@/types'

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

const MEDIA_NODE_TYPES = new Set<string>(['text', 'image', 'video'])
const RESOURCE_MENTION_RE = /@\[resource:(\d+)\]/g

export function normalizeCanvasHandle(handle: string | null | undefined) {
  if (!handle) return ''
  if (handle.startsWith('in:')) return handle.slice(3).replace(/^:+/, '')
  if (handle.startsWith('out:')) return handle.slice(4).replace(/^:+/, '')
  return handle.replace(/^:+/, '')
}

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
    appendValues(values, targetHandle, [value])
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

export function topoSortCanvasNodes(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((node) => node.id))
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (const node of nodes) indegree.set(node.id, 0)
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0)
  const ordered: Node[] = []
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    ordered.push(node)
    for (const next of outgoing.get(node.id) ?? []) {
      const count = (indegree.get(next) ?? 0) - 1
      indegree.set(next, count)
      if (count === 0) {
        const nextNode = nodes.find((item) => item.id === next)
        if (nextNode) queue.push(nextNode)
      }
    }
  }
  if (ordered.length !== nodes.length) {
    const orderedIds = new Set(ordered.map((node) => node.id))
    return [...ordered, ...nodes.filter((node) => !orderedIds.has(node.id))]
  }
  return ordered
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
    const type = (resource?.type === 'image' || resource?.type === 'video' || resource?.type === 'text')
      ? resource.type
      : mediaTypeForNode(node.type)
    return { type, resource_id: resourceId, resource }
  }

  const text = data.textContent ?? data.inputValue
  if (text !== undefined) return { type: 'text', text }
  return undefined
}

export function valuesHaveRuntimeValue(values: CanvasPortValue[] | undefined) {
  return (values ?? []).some((value) => (
    value.resource_id !== undefined
    || value.text !== undefined
    || value.json !== undefined
    || value.number !== undefined
    || value.boolean !== undefined
  ))
}

export function firstRuntimeValue(inputs: Record<string, CanvasPortValue[]>, handles: string[]) {
  for (const handle of handles) {
    const value = inputs[handle]?.find((item) => valuesHaveRuntimeValue([item]))
    if (value) return value
  }
  return Object.values(inputs).flat().find((item) => valuesHaveRuntimeValue([item]))
}

export function runtimePromptForNode(node: Node, inputs: Record<string, CanvasPortValue[]>) {
  const data = node.data as Partial<CanvasNodeData>
  const promptParts = [data.prompt?.trim()].filter(Boolean) as string[]
  const upstreamText = Object.values(inputs)
    .flat()
    .map((value) => value.text)
    .filter((value): value is string => Boolean(value?.trim()))
  if (upstreamText.length > 0) {
    promptParts.push(upstreamText.join('\n\n'))
  }
  return promptParts.join('\n\n').trim()
}

export function resourceIdsFromCanvasPrompt(prompt: string | undefined) {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const match of (prompt ?? '').matchAll(RESOURCE_MENTION_RE)) {
    const id = Number(match[1])
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function inputResourceIdsFromValues(inputs: Record<string, CanvasPortValue[]>) {
  return [...new Set(Object.values(inputs)
    .flat()
    .map((value) => value.resource_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0))]
}

export function runtimeResourceIdsForNode(node: Node, inputs: Record<string, CanvasPortValue[]>) {
  const data = node.data as Partial<CanvasNodeData>
  const ordered = [
    ...resourceIdsFromCanvasPrompt(data.prompt),
    ...(data.inputResourceIds ?? []),
    ...inputResourceIdsFromValues(inputs),
  ]
  const seen = new Set<number>()
  return ordered.filter((id) => {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function normalizePortValueList(value: CanvasPortValue | CanvasPortValue[]) {
  return (Array.isArray(value) ? value : [value]).filter(Boolean)
}

function appendValues(target: Record<string, CanvasPortValue[]>, handle: string, values: CanvasPortValue[]) {
  if (values.length === 0) return
  target[handle] = [...(target[handle] ?? []), ...values]
}

function defaultHandleForNode(node: Node | undefined, side: 'source' | 'target') {
  const data = node?.data as Partial<CanvasNodeData> | undefined
  const customPorts = side === 'source' ? data?.outputPorts : data?.inputPorts
  if (customPorts?.[0]) return customPorts[0].id
  return defaultHandleForType(node?.type as NodeType | undefined, side)
}

function defaultHandleForType(type: NodeType | undefined, side: 'source' | 'target') {
  if (!type) return undefined
  if (type === 'input') return side === 'source' ? 'value' : undefined
  if (type === 'output') return side === 'target' ? 'value' : undefined
  if (type === 'resource_sink') return side === 'target' ? 'input' : undefined
  if (type === 'text') return side === 'source' ? 'text' : (side === 'target' ? 'prompt' : undefined)
  if (type === 'image') return side === 'source' ? 'image' : (side === 'target' ? 'prompt' : undefined)
  if (type === 'video') return side === 'source' ? 'video' : (side === 'target' ? 'prompt' : undefined)
  if (type === 'text_gen') return side === 'source' ? 'text' : 'prompt'
  if (type === 'ai_gen') return side === 'source' ? 'result' : 'prompt'
  if (MEDIA_NODE_TYPES.has(String(type))) return side === 'source' ? 'result' : 'input'
  return side === 'source' ? 'result' : 'input'
}

function mediaTypeForNode(type: string | undefined): CanvasPortType {
  if (type === 'image' || type === 'ref_image_gen' || type === 'multi_angle' || type === 'style_transfer') return 'image'
  if (type === 'video' || type === 'ref_video_gen' || type === 'motion_imitation') return 'video'
  if (type === 'text' || type === 'text_gen') return 'text'
  return 'resource'
}
