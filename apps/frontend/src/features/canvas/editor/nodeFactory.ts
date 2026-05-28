import type { Edge, Node } from '@xyflow/react'

import type { Canvas, CanvasNodeData, CanvasType, NodeType, RawResource } from '@/types'
import type { ClientPluginManifest } from '@/features/plugins/application/clientPlugins'
import { createCanvasNodeData } from '@/features/canvas/domain/graph'
import { normalizedCanvasNodeStyle } from '@/features/canvas/domain/layout'
import { edgeConnectionKey } from '@/features/canvas/domain/ports'
import { deriveCanvasReferencePorts } from '@/features/canvas/integrations/workflowReferences'

export function createCanvasNodeId() {
  return Math.random().toString(36).slice(2, 10)
}

export function createCanvasEdgeId(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return `${edgeConnectionKey(edge)}::${createCanvasNodeId()}`
}

export function readOnlyMediaPortPatch(source: CanvasNodeData['source']): Partial<CanvasNodeData> {
  return source === 'ai' ? { inputPorts: undefined } : { inputPorts: [] }
}

export function canvasTextNodeEditState(data: Partial<CanvasNodeData>) {
  const resourceBacked = Boolean(data.resourceId || data.resource)
  return {
    resourceBacked,
    editable: data.source === 'manual' && !resourceBacked,
  }
}

export function nextWorkflowParamOrder(nodes: Node[], type: 'input' | 'output') {
  const usedOrders = nodes
    .filter((node) => node.type === type)
    .map((node) => Number((node.data as Partial<CanvasNodeData>).paramOrder))
    .filter((value) => Number.isInteger(value) && value > 0)
  return usedOrders.length > 0 ? Math.max(...usedOrders) + 1 : 1
}

export function isPaletteNodeTypeAvailable(type: NodeType, canvasType: CanvasType) {
  if (type === 'resource_sink') return false
  if ((type === 'input' || type === 'output') && canvasType !== 'workflow') return false
  return true
}

function workflowIoDataPatch({
  type,
  existingNodes,
  t,
}: {
  type: NodeType
  existingNodes?: Node[]
  t: (key: string, options?: any) => string
}): Partial<CanvasNodeData> & { label?: string } {
  if (type !== 'input' && type !== 'output') return {}
  const ioType = type === 'input' ? 'input' : 'output'
  const order = nextWorkflowParamOrder(existingNodes ?? [], ioType)
  const baseName = ioType
  const label = `${t(`canvas.nodeLabels.${type}`)} ${order}`
  return {
    label,
    paramName: `${baseName}_${order}`,
    paramOrder: order,
  }
}

export function createPaletteCanvasNode({
  type,
  position,
  t,
  existingNodes,
}: {
  type: NodeType
  position: { x: number; y: number }
  t: (key: string, options?: any) => string
  existingNodes?: Node[]
}): Node {
  const baseData = createCanvasNodeData(type, t)
  return {
    id: createCanvasNodeId(),
    type,
    position,
    data: { ...baseData, ...workflowIoDataPatch({ type, existingNodes, t }) },
    ...(type === 'group'
      ? { style: { width: 320, height: 240 }, zIndex: -1 }
      : { style: normalizedCanvasNodeStyle(type) }),
  }
}

export function createResourceCanvasNode({
  resource,
  type,
  position,
  t,
}: {
  resource: RawResource
  type: NodeType
  position: { x: number; y: number }
  t: (key: string, options?: any) => string
}): Node {
  const baseData = createCanvasNodeData(type, t)
  return {
    id: createCanvasNodeId(),
    type,
    position,
    data: {
      ...baseData,
      label: resource.name,
      ...readOnlyMediaPortPatch('upload'),
      source: 'upload',
      resourceId: resource.ID,
      resource,
      status: 'done',
    },
    style: normalizedCanvasNodeStyle(type),
  }
}

export function createWorkflowReferenceCanvasNode({
  workflowCanvas,
  position,
  t,
}: {
  workflowCanvas: Canvas
  position: { x: number; y: number }
  t: (key: string, options?: any) => string
}): Node {
  const ports = deriveCanvasReferencePorts(workflowCanvas)
  const baseData = createCanvasNodeData('canvas', t)
  return {
    id: createCanvasNodeId(),
    type: 'canvas',
    position,
    data: {
      ...baseData,
      label: workflowCanvas.name,
      source: 'ai',
      referencedCanvasId: workflowCanvas.ID,
      referencedCanvasName: workflowCanvas.name,
      inputPorts: ports.inputs,
      outputPorts: ports.outputs,
    },
    style: normalizedCanvasNodeStyle('canvas'),
  }
}

export function createPluginCanvasNode({
  plugin,
  position,
}: {
  plugin: ClientPluginManifest
  position: { x: number; y: number }
}): Node {
  const contribution = plugin.contributes?.canvasNodes?.[0]
  return {
    id: createCanvasNodeId(),
    type: 'plugin_card',
    position,
    data: {
      source: 'manual',
      ...(contribution?.defaultData ?? {}),
      label: contribution?.title ?? plugin.name,
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      pluginRuntime: 'trusted_local',
      pluginArgs: {},
      inputPorts: contribution?.inputs,
      outputPorts: contribution?.outputs,
    },
    style: normalizedCanvasNodeStyle('plugin_card'),
  }
}
