import type { Edge, Node } from '@xyflow/react'

import type { CanvasNodeData, CanvasPortDef, CanvasPortValue, RawResource } from '@/types'
import { fromUiHandleId, portsForNode } from '@/features/canvas/domain/ports'
import type { CanvasRuntimeOutputCache } from '@/features/canvas/runtime/canvasRuntimeGraph'
import type { CanvasRuntimeRun } from './runHistoryStore'

export interface WorkflowRunOutputItem {
  key: string
  label: string
  value: CanvasPortValue
  resource?: RawResource
}

export function canvasPortValueSummary(value: CanvasPortValue) {
  if (value.resource_id) return `resource #${value.resource_id}`
  if (value.text !== undefined) return value.text
  if (value.json !== undefined) {
    try { return JSON.stringify(value.json) } catch { return String(value.json) }
  }
  if (value.number !== undefined) return String(value.number)
  if (value.boolean !== undefined) return value.boolean ? 'true' : 'false'
  return ''
}

export function canvasPortValuePreviewText(value: CanvasPortValue) {
  if (value.text !== undefined) return value.text
  if (value.json !== undefined) {
    try { return JSON.stringify(value.json, null, 2) } catch { return String(value.json) }
  }
  if (value.number !== undefined) return String(value.number)
  if (value.boolean !== undefined) return value.boolean ? 'true' : 'false'
  if (value.resource_id) return `resource #${value.resource_id}`
  return ''
}

export function textContentFromOutputs(outputs: Record<string, CanvasPortValue>) {
  const preferredKeys = ['text', 'result', 'value', 'output']
  for (const key of preferredKeys) {
    const value = outputs[key]
    if (!value) continue
    const text = canvasPortValuePreviewText(value)
    if (text) return text
  }
  for (const value of Object.values(outputs)) {
    const text = canvasPortValuePreviewText(value)
    if (text) return text
  }
  return undefined
}

export function resourceTypeForPortValue(value: CanvasPortValue): RawResource['type'] {
  if (value.type === 'image' || value.type === 'video') return value.type
  return 'text'
}

export function resourceNameForOutput(label: string, value: CanvasPortValue) {
  const safeLabel = label.trim() || 'workflow-output'
  const ext = value.type === 'json' ? 'json' : value.type === 'image' ? 'png' : value.type === 'video' ? 'mp4' : 'txt'
  return `${safeLabel}.${ext}`
}

export function resourceFromOutputValue(label: string, value: CanvasPortValue): RawResource | undefined {
  if (!value.resource_id) return undefined
  return {
    ID: value.resource_id,
    owner_id: 0,
    type: resourceTypeForPortValue(value),
    name: resourceNameForOutput(label, value),
    url: `/api/v1/resources/${value.resource_id}/file`,
    size: 0,
    mime_type: '',
  }
}

export function workflowRunOutputItems(run: CanvasRuntimeRun | undefined, nodes: Node[], fallbackOutputLabel: string): WorkflowRunOutputItem[] {
  const outputs = run?.outputValues ?? {}
  const usedKeys = new Set<string>()
  const seen = new Set<string>()
  const items: WorkflowRunOutputItem[] = []
  const addItem = (key: string, label: string, value: CanvasPortValue | undefined, dedupe = true) => {
    if (!value) return
    const identity = dedupe ? (value.resource_id ? `resource:${value.resource_id}` : `${value.type}:${canvasPortValueSummary(value)}`) : `key:${key}`
    if (seen.has(identity)) {
      usedKeys.add(key)
      return
    }
    seen.add(identity)
    usedKeys.add(key)
    items.push({ key, label, value, resource: resourceFromOutputValue(label, value) })
  }

  nodes.filter((node) => node.type === 'output').forEach((node) => {
    const data = node.data as Partial<CanvasNodeData>
    const label = data.paramName || (data as any).label || node.id
    const candidateKeys = [node.id, data.paramName, ...(data.outputPorts ?? []).map((port) => port.id)].filter(Boolean) as string[]
    const key = candidateKeys.find((candidate) => outputs[candidate])
    if (key) {
      candidateKeys.forEach((candidate) => usedKeys.add(candidate))
      addItem(key, label, outputs[key])
    }
  })

  Object.entries(outputs).forEach(([key, value]) => {
    if (!usedKeys.has(key)) {
      addItem(key, key || fallbackOutputLabel, value)
    }
  })
  return items
}

export function buildRuntimeWorkflowOutputs(nodes: Node[], outputCache: CanvasRuntimeOutputCache): Record<string, CanvasPortValue> {
  const outputs: Record<string, CanvasPortValue> = {}
  for (const node of nodes) {
    const nodeOutputs = outputCache[node.id]
    if (!nodeOutputs) continue
    if (node.type === 'output') {
      const value = nodeOutputs.value ?? nodeOutputs[node.id] ?? nodeOutputs.result ?? Object.values(nodeOutputs)[0]
      if (value) outputs[node.id] = value
      const name = (node.data as Partial<CanvasNodeData>).paramName
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
      const value = outputCache[node.id]?.result ?? outputCache[node.id]?.value ?? Object.values(outputCache[node.id] ?? {})[0]
      if (value) outputs[node.id] = value
    }
  }
  return outputs
}

export function hasValueForPort(values: CanvasPortValue[] | undefined) {
  return (values ?? []).some((value) => {
    if (!value) return false
    return value.resource_id !== undefined
      || value.text !== undefined
      || value.json !== undefined
      || value.number !== undefined
      || value.boolean !== undefined
  })
}

export function connectedInputPortIds(nodeId: string, edges: Edge[]) {
  const ids = new Set<string>()
  edges.forEach((edge) => {
    if (edge.target !== nodeId) return
    ids.add(fromUiHandleId(edge.targetHandle) || 'input')
  })
  return ids
}

export function runtimeInputPortsForNode(node: Node | undefined, edges: Edge[]) {
  if (!node) return []
  const connected = connectedInputPortIds(node.id, edges)
  return portsForNode(node, 'target').filter((port) => port.required && !connected.has(port.id))
}

export function defaultRuntimeValueForPort(port: CanvasPortDef) {
  switch (port.type) {
    case 'json':
      return '{}'
    case 'boolean':
      return 'false'
    default:
      return ''
  }
}

export function encodeRuntimePortValue(port: CanvasPortDef, raw: string): CanvasPortValue | null {
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
    case 'resource': {
      const id = Number(raw)
      return Number.isInteger(id) && id > 0 ? { type: port.type, resource_id: id } : null
    }
    case 'text':
    default:
      return { type: 'text', text: raw }
  }
}

export function portForWorkflowInputNode(node: Node): CanvasPortDef {
  const data = node.data as Partial<CanvasNodeData> & { label?: string }
  return {
    id: 'value',
    label: data.paramName || data.label || node.id,
    type: data.paramType ?? 'text',
    required: true,
  }
}
