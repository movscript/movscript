import type { Edge, Node } from '@xyflow/react'
import type { CanvasNodeData, CanvasPortDef, RawResource } from '@/types'

export interface CanvasPluginArgsInput {
  targetNodeId: string
  baseArgs: Record<string, unknown>
  inputPorts?: CanvasPortDef[]
  schemaProperties?: Record<string, { type?: string }>
  nodes: Node[]
  edges: Edge[]
  resourceById?: Map<number, RawResource>
}

export function buildCanvasPluginArgsWithInputs(input: CanvasPluginArgsInput): Record<string, unknown> {
  const args = { ...input.baseArgs }
  const targetNode = input.nodes.find((node) => node.id === input.targetNodeId)
  const targetData = targetNode?.data as Partial<CanvasNodeData> | undefined
  const resourceInputs = new Map<string, number[]>()
  const textInputs = new Map<string, string[]>()

  for (const edge of input.edges) {
    if (edge.target !== input.targetNodeId) continue
    const handle = normalizedHandle(edge.targetHandle) || 'input'
    const source = input.nodes.find((node) => node.id === edge.source)
    if (!source) continue
    const value = readableNodeOutput(source, input.resourceById)
    if (value.resourceId) {
      appendMapValue(resourceInputs, handle, value.resourceId)
      continue
    }
    if (value.text) {
      appendMapValue(textInputs, handle, value.text)
    }
  }

  if (targetData?.inputResourceIds?.length) {
    const referencePort = input.inputPorts?.find((port) => isReferencePort(port)) ?? input.inputPorts?.find((port) => isResourcePort(port))
    appendMapValues(resourceInputs, referencePort?.id ?? 'references', targetData.inputResourceIds)
  }

  for (const port of input.inputPorts ?? []) {
    const resourceIds = uniqueNumbers(resourceInputs.get(port.id) ?? [])
    if (resourceIds.length > 0 && isResourcePort(port)) {
      setResourceArg(args, input.schemaProperties, port.id, resourceIds)
    }

    const texts = (textInputs.get(port.id) ?? []).map((text) => text.trim()).filter(Boolean)
    if (texts.length > 0 && isTextPort(port)) {
      setTextArg(args, input.schemaProperties, port.id, texts.join('\n\n'))
    }
  }

  return args
}

function normalizedHandle(handle: string | null | undefined) {
  if (!handle) return ''
  if (handle.startsWith('in:')) return handle.slice(3).replace(/^:+/, '')
  if (handle.startsWith('out:')) return handle.slice(4).replace(/^:+/, '')
  return handle.replace(/^:+/, '')
}

function readableNodeOutput(node: Node, resourceById?: Map<number, RawResource>) {
  const data = node.data as Partial<CanvasNodeData>
  const resourceId = data.resource?.ID ?? (data.resourceId ? resourceById?.get(data.resourceId)?.ID : undefined) ?? data.resourceId
  if (resourceId && Number.isInteger(resourceId) && resourceId > 0) {
    return { resourceId }
  }
  const text = data.textContent ?? data.inputValue ?? data.prompt
  return { text }
}

function appendMapValue<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

function appendMapValues<T>(map: Map<string, T[]>, key: string, values: T[]) {
  map.set(key, [...(map.get(key) ?? []), ...values])
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
}

function isResourcePort(port: CanvasPortDef) {
  return port.type === 'resource' || port.type === 'image' || port.type === 'video'
}

function isTextPort(port: CanvasPortDef) {
  return port.type === 'text' || port.id === 'prompt'
}

function isReferencePort(port: CanvasPortDef) {
  return /ref|reference/i.test(port.id) || /ref|reference/i.test(port.label ?? '')
}

function setResourceArg(
  args: Record<string, unknown>,
  schemaProperties: Record<string, { type?: string }> | undefined,
  portId: string,
  resourceIds: number[],
) {
  const key = firstExistingKey(schemaProperties, resourceArgCandidates(portId))
  if (!key) return
  args[key] = schemaProperties?.[key]?.type === 'array' ? resourceIds : resourceIds.join(',')
}

function setTextArg(
  args: Record<string, unknown>,
  schemaProperties: Record<string, { type?: string }> | undefined,
  portId: string,
  text: string,
) {
  const key = firstExistingKey(schemaProperties, textArgCandidates(portId))
  if (!key) return
  if (hasArgValue(args[key])) return
  args[key] = text
}

function firstExistingKey(schemaProperties: Record<string, { type?: string }> | undefined, candidates: string[]) {
  if (!schemaProperties) return candidates[0]
  return candidates.find((candidate) => Object.prototype.hasOwnProperty.call(schemaProperties, candidate))
}

function resourceArgCandidates(portId: string) {
  const safe = safeArgName(portId)
  const singular = safe.endsWith('s') ? safe.slice(0, -1) : safe
  return uniqueStrings([
    safe,
    `${safe}_resource_ids`,
    `${singular}_resource_ids`,
    'reference_resource_ids',
    'input_resource_ids',
  ])
}

function textArgCandidates(portId: string) {
  const safe = safeArgName(portId)
  return uniqueStrings([
    safe,
    safe === 'input' ? 'prompt' : '',
    `${safe}_text`,
  ])
}

function safeArgName(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'input'
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function hasArgValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}
