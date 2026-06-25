import type { Edge, Node } from '@xyflow/react'

import type { Canvas, CanvasNodeData, CanvasType, NodeType, RawResource } from '@movscript/shared'
import { createCanvasNodeData } from '../domain/graph'
import { normalizedCanvasNodeStyle } from '../domain/layout'
import { deriveCanvasReferencePorts } from '../integrations/workflowReferences'
import {
  createCanvasEdgeId as createCoreCanvasEdgeId,
  nextWorkflowParamOrder,
  readOnlyMediaPortPatch,
  workflowIoDataPatch as coreWorkflowIoDataPatch,
} from '@movscript/core/canvas'

export {
  nextWorkflowParamOrder,
  readOnlyMediaPortPatch,
} from '@movscript/core/canvas'

export function createCanvasNodeId() {
  return Math.random().toString(36).slice(2, 10)
}

export function createCanvasEdgeId(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return createCoreCanvasEdgeId(edge, createCanvasNodeId())
}

export function canvasTextNodeEditState(data: Partial<CanvasNodeData>) {
  const resourceBacked = Boolean(data.resourceId || data.resource)
  return {
    resourceBacked,
    editable: data.source === 'manual' && !resourceBacked,
  }
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
  return coreWorkflowIoDataPatch({
    type,
    existingNodes,
    label: t(`canvas.nodeLabels.${type}`),
  }) as Partial<CanvasNodeData> & { label?: string }
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
