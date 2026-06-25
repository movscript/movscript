import { resourceIdsFromMentions } from '@movscript/workspace'
import { fromUiHandleId } from './ports.js'

export type CoreCanvasPortType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'number' | 'boolean' | 'resource'

export interface CoreCanvasPortDef {
  id: string
  type: CoreCanvasPortType
}

export interface CoreCanvasPortValue {
  type: CoreCanvasPortType
  resource_id?: number
  resource?: unknown
  text?: string
  json?: unknown
  number?: number
  boolean?: boolean
}

export interface CoreCanvasRuntimeNodeLike {
  id: string
  type?: string
  data?: Record<string, unknown> | null
}

export interface CoreCanvasRuntimeEdgeLike {
  source: string
  target: string
  targetHandle?: string | null
}

export type CoreCanvasRuntimeOutputValues<TValue extends CoreCanvasPortValue = CoreCanvasPortValue> = Record<string, TValue>
export type CoreCanvasRuntimeOutputCache<TValue extends CoreCanvasPortValue = CoreCanvasPortValue> = Record<string, CoreCanvasRuntimeOutputValues<TValue>>

export function topoSortCanvasNodes<
  TNode extends { id: string },
  TEdge extends CoreCanvasRuntimeEdgeLike,
>(nodes: TNode[], edges: TEdge[]): TNode[] {
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
  const ordered: TNode[] = []
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    if (!node) continue
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

export function valuesHaveRuntimeValue<TValue extends Partial<CoreCanvasPortValue>>(
  values: Array<TValue | null | undefined> | undefined,
) {
  return (values ?? []).some((value) => {
    if (!value) return false
    return value.resource_id !== undefined
      || value.text !== undefined
      || value.json !== undefined
      || value.number !== undefined
      || value.boolean !== undefined
  })
}

export function firstRuntimeValue<TValue extends Partial<CoreCanvasPortValue>>(
  inputs: Record<string, TValue[]>,
  handles: string[],
): TValue | undefined {
  for (const handle of handles) {
    const value = inputs[handle]?.find((item) => valuesHaveRuntimeValue([item]))
    if (value) return value
  }
  return Object.values(inputs).flat().find((item) => valuesHaveRuntimeValue([item]))
}

export function runtimePromptForNode<TValue extends Pick<CoreCanvasPortValue, 'text'>>(
  node: CoreCanvasRuntimeNodeLike,
  inputs: Record<string, TValue[]>,
) {
  const prompt = typeof node.data?.prompt === 'string' ? node.data.prompt : undefined
  const promptParts = [prompt?.trim()].filter(Boolean) as string[]
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
  return resourceIdsFromMentions(prompt)
}

export function inputResourceIdsFromValues<TValue extends Pick<CoreCanvasPortValue, 'resource_id'>>(
  inputs: Record<string, TValue[]>,
) {
  return [...new Set(Object.values(inputs)
    .flat()
    .map((value) => value.resource_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0))]
}

export function runtimeResourceIdsForNode<TValue extends Pick<CoreCanvasPortValue, 'resource_id'>>(
  node: CoreCanvasRuntimeNodeLike,
  inputs: Record<string, TValue[]>,
) {
  const inputResourceIds = Array.isArray(node.data?.inputResourceIds) ? node.data.inputResourceIds : []
  const prompt = typeof node.data?.prompt === 'string' ? node.data.prompt : undefined
  const ordered = [
    ...resourceIdsFromCanvasPrompt(prompt),
    ...inputResourceIds,
    ...inputResourceIdsFromValues(inputs),
  ]
  const seen = new Set<number>()
  return ordered.filter((id): id is number => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

export function connectedInputPortIds<TEdge extends Pick<CoreCanvasRuntimeEdgeLike, 'target' | 'targetHandle'>>(
  nodeId: string,
  edges: TEdge[],
) {
  const ids = new Set<string>()
  edges.forEach((edge) => {
    if (edge.target !== nodeId) return
    ids.add(fromUiHandleId(edge.targetHandle) || 'input')
  })
  return ids
}

export function defaultRuntimeValueForPort(port: Pick<CoreCanvasPortDef, 'type'>) {
  switch (port.type) {
    case 'json':
      return '{}'
    case 'boolean':
      return 'false'
    default:
      return ''
  }
}

export function encodeRuntimePortValue(
  port: Pick<CoreCanvasPortDef, 'type'>,
  raw: string,
): CoreCanvasPortValue | null {
  switch (port.type) {
    case 'number': {
      const value = Number(raw)
      return Number.isFinite(value) ? { type: 'number', number: value } : null
    }
    case 'boolean':
      return { type: 'boolean', boolean: raw === 'true' }
    case 'json': {
      try {
        return { type: 'json', json: raw.trim() ? JSON.parse(raw) : null }
      } catch {
        return null
      }
    }
    case 'image':
    case 'video':
    case 'audio':
    case 'resource': {
      const id = Number(raw)
      return Number.isInteger(id) && id > 0 ? { type: port.type, resource_id: id } : null
    }
    case 'text':
    default:
      return { type: 'text', text: raw }
  }
}

export function buildRuntimeWorkflowOutputs<TValue extends CoreCanvasPortValue>(
  nodes: CoreCanvasRuntimeNodeLike[],
  outputCache: CoreCanvasRuntimeOutputCache<TValue>,
): Record<string, TValue> {
  const outputs: Record<string, TValue> = {}
  for (const node of nodes) {
    const nodeOutputs = outputCache[node.id]
    if (!nodeOutputs) continue
    if (node.type === 'output') {
      const value = nodeOutputs.value ?? nodeOutputs[node.id] ?? nodeOutputs.result ?? Object.values(nodeOutputs)[0]
      if (value) outputs[node.id] = value
      const name = typeof node.data?.paramName === 'string' ? node.data.paramName : undefined
      if (name && value) outputs[name] = value
      continue
    }
    if (node.type === 'resource_sink') {
      const value = nodeOutputs.result ?? nodeOutputs.value ?? Object.values(nodeOutputs)[0]
      if (value) outputs[node.id] = value
    }
  }
  if (Object.keys(outputs).length === 0) {
    for (const node of nodes) {
      const nodeOutputs = outputCache[node.id]
      const value = nodeOutputs?.result ?? nodeOutputs?.value ?? Object.values(nodeOutputs ?? {})[0]
      if (value) outputs[node.id] = value
    }
  }
  return outputs
}
