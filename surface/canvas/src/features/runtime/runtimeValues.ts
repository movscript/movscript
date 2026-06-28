import type { Edge, Node } from '@xyflow/react'
import {
  buildRuntimeWorkflowOutputs,
  connectedInputPortIds,
  defaultRuntimeValueForPort,
  encodeRuntimePortValue as encodeCoreRuntimePortValue,
} from '@movscript/core/canvas'
import { resourceFileUrl } from '@movscript/core/resources'

import type { CanvasNodeData, CanvasPortDef, CanvasPortValue, RawResource } from '@movscript/shared'
import { compareWorkflowIoNodes, workflowIoOrder } from '../domain/graph'
import { portsForNode } from '../domain/ports'
import type { CanvasRuntimeRun } from './runHistoryStore'

export {
  buildRuntimeWorkflowOutputs,
  connectedInputPortIds,
  defaultRuntimeValueForPort,
}
export { valuesHaveRuntimeValue as hasValueForPort } from '@movscript/core/canvas'

const TOOL_CARD_NODE_TYPES = new Set([
  'text_gen',
  'ai_gen',
  'ref_image_gen',
  'ref_video_gen',
	'multi_angle',
	'style_transfer',
	'motion_imitation',
])

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

export function encodeRuntimePortValue(port: CanvasPortDef, raw: string): CanvasPortValue | null {
  return encodeCoreRuntimePortValue(port, raw) as CanvasPortValue | null
}

export function resourceTypeForPortValue(value: CanvasPortValue): RawResource['type'] {
  if (value.type === 'image' || value.type === 'video' || value.type === 'audio') return value.type
  return 'text'
}

export function resourceNameForOutput(label: string, value: CanvasPortValue) {
  const safeLabel = label.trim() || 'workflow-output'
  const ext = value.type === 'json' ? 'json' : value.type === 'image' ? 'png' : value.type === 'video' ? 'mp4' : value.type === 'audio' ? 'mp3' : 'txt'
  return `${safeLabel}.${ext}`
}

export function resourceFromOutputValue(label: string, value: CanvasPortValue): RawResource | undefined {
  if (!value.resource_id) return undefined
  return {
    ID: value.resource_id,
    owner_id: 0,
    type: resourceTypeForPortValue(value),
    name: resourceNameForOutput(label, value),
    url: resourceFileUrl(value.resource_id) ?? '',
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

  nodes.filter((node) => node.type === 'output').sort(compareWorkflowIoNodes).forEach((node) => {
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

export function runtimeInputPortsForNode(node: Node | undefined, edges: Edge[]) {
  if (!node) return []
  const connected = connectedInputPortIds(node.id, edges)
  return portsForNode(node, 'target').filter((port) => (
    port.required
    && !connected.has(port.id)
    && !isToolCardResourceInput(node, port)
  ))
}

function isToolCardResourceInput(node: Node, port: CanvasPortDef) {
  if (port.type !== 'image' && port.type !== 'video' && port.type !== 'audio' && port.type !== 'resource') return false
  const data = node.data as Partial<CanvasNodeData>
  if (TOOL_CARD_NODE_TYPES.has(String(node.type))) return true
  return data.source === 'ai' && node.type !== 'input' && node.type !== 'output' && node.type !== 'resource_sink'
}

export function portForWorkflowInputNode(node: Node): CanvasPortDef {
  const data = node.data as Partial<CanvasNodeData> & { label?: string }
  return {
    id: 'value',
    label: data.paramName || data.label || node.id,
    type: data.paramType ?? 'text',
    order: workflowIoOrder(node),
    required: true,
  }
}
