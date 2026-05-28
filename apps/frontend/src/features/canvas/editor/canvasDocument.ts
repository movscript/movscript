import type { Edge, Node } from '@xyflow/react'
import { api } from '@/shared/infrastructure/api'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { Canvas, CanvasNodeData, CanvasType, PublicModel } from '@/types'
import { ensureFinalOutputNode, normalizeWorkflowIoNodeOrders } from '@/features/canvas/domain/graph'
import { canvasNodeAbsolutePosition, normalizedCanvasNodeStyle } from '@/features/canvas/domain/layout'
import { canvasGraphSignature, serializableCanvasNodeData } from '@/features/canvas/domain/serialization'
import {
  defaultHandleForNode,
  fromUiHandleId,
  toUiHandleId,
  uniqueEdgesByConnection,
} from '@/features/canvas/domain/ports'

export interface HydratedCanvasDocument {
  nodes: Node[]
  edges: Edge[]
  signature: string
}

export function hydrateCanvasDocument(
  canvas: Canvas,
  t: (key: string, options?: any) => string,
): HydratedCanvasDocument {
  const loadedNodes: Node[] = (canvas.nodes ?? []).map((n) => {
    const data: CanvasNodeData = n.data ? JSON.parse(n.data) : { source: 'upload' }
    const { _parentId, _style, ...cleanData } = data as any
    const node: Node = {
      id: n.node_id,
      type: n.type,
      position: { x: n.pos_x, y: n.pos_y },
      data: { ...cleanData, label: n.label },
      ...(n.type === 'group'
        ? { zIndex: -1, style: _style ?? { width: 320, height: 240 } }
        : { style: normalizedCanvasNodeStyle(n.type, _style) }),
      ...(_parentId && { parentId: _parentId }),
    }
    return node
  })
  const nodeById = new Map(loadedNodes.map((node) => [node.id, node]))
  const flattenedNodes = loadedNodes.map((node) => {
    if (!node.parentId) return node
    return {
      ...node,
      parentId: undefined,
      position: canvasNodeAbsolutePosition(node, nodeById),
      data: {
        ...node.data,
        groupId: (node.data as Partial<CanvasNodeData>).groupId ?? node.parentId,
      },
    }
  })
  const groupNodes = flattenedNodes.filter((node) => node.type === 'group')
  const childNodes = flattenedNodes.filter((node) => node.type !== 'group')
  const loadedNodeById = new Map(flattenedNodes.map((node) => [node.id, node]))
  const edges: Edge[] = uniqueEdgesByConnection((canvas.edges ?? []).map((edge) => ({
    id: edge.edge_id,
    source: edge.source,
    target: edge.target,
    sourceHandle: toUiHandleId(edge.source_handle ?? defaultHandleForNode(loadedNodeById.get(edge.source), 'source'), 'source'),
    targetHandle: toUiHandleId(edge.target_handle ?? defaultHandleForNode(loadedNodeById.get(edge.target), 'target'), 'target'),
  })))
  const nodes = (canvas.canvas_type ?? 'inspiration') === 'workflow'
    ? normalizeWorkflowIoNodeOrders(ensureFinalOutputNode([...groupNodes, ...childNodes], t))
    : [...groupNodes, ...childNodes]
  return {
    nodes,
    edges,
    signature: canvasGraphSignature({
      canvasType: canvas.canvas_type ?? 'inspiration',
      nodes,
      edges,
      t,
    }),
  }
}

export async function buildCanvasSavePayload({
  canvasType,
  nodes,
  edges,
  t,
}: {
  canvasType: CanvasType
  nodes: Node[]
  edges: Edge[]
  t: (key: string, options?: any) => string
}) {
  const nodesToSave = canvasType === 'workflow'
    ? normalizeWorkflowIoNodeOrders(ensureFinalOutputNode(nodes, t))
    : nodes
  const defaultModels = await defaultModelsForCanvasSave(nodesToSave)
  return {
    nodes: nodesToSave.map((node) => {
      const { label, data: rest } = serializableCanvasNodeData(node.data)
      const request = modelFeatureForCanvasNode(node.type, rest)
      const defaultModel = request ? defaultModels.get(request.feature) : undefined
      const dataToSave = {
        ...rest,
        ...(defaultModel && !rest.modelId && !rest.modelDbId ? {
          modelId: publicModelId(defaultModel),
          modelDbId: defaultModel.id,
        } : {}),
      }
      return {
        node_id: node.id,
        type: node.type,
        label: label ?? '',
        pos_x: node.position.x,
        pos_y: node.position.y,
        data: JSON.stringify({
          ...dataToSave,
          _style: node.style,
        }),
      }
    }),
    edges: uniqueEdgesByConnection(edges).map((edge) => ({
      edge_id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: fromUiHandleId(edge.sourceHandle),
      target_handle: fromUiHandleId(edge.targetHandle),
    })),
  }
}

function modelFeatureForCanvasNode(nodeType?: string, data?: Partial<CanvasNodeData>) {
  if (nodeType === 'text' && data?.source === 'ai') return { capability: 'text', feature: 'canvas_text' }
  if (nodeType === 'text_gen') return { capability: 'text', feature: 'canvas_text' }
  if (nodeType === 'ai_gen' && (data?.outputType ?? 'image') === 'text') return { capability: 'text', feature: 'canvas_text' }
  if (nodeType === 'ai_gen' && data?.outputType === 'video') return { capability: 'video', feature: 'canvas_video' }
  if (nodeType === 'ai_gen') return { capability: 'image', feature: 'canvas_image' }
  if (nodeType === 'image' && data?.source === 'ai') return { capability: 'image', feature: 'canvas_image' }
  if (['ref_image_gen', 'multi_angle', 'style_transfer'].includes(String(nodeType))) return { capability: 'image', feature: 'canvas_image' }
  if (nodeType === 'video' && data?.source === 'ai') return { capability: 'video', feature: 'canvas_video' }
  if (['ref_video_gen', 'motion_imitation'].includes(String(nodeType))) return { capability: 'video', feature: 'canvas_video' }
  return null
}

async function defaultModelsForCanvasSave(nodes: Node[]) {
  const featureRequests = new Map<string, { capability: string; feature: string }>()
  for (const node of nodes) {
    const data = node.data as Partial<CanvasNodeData>
    if (data.modelId || data.modelDbId) continue
    const request = modelFeatureForCanvasNode(node.type, data)
    if (request) featureRequests.set(request.feature, request)
  }

  const defaults = new Map<string, PublicModel>()
  await Promise.all(Array.from(featureRequests.values()).map(async ({ capability, feature }) => {
    const models = await api.get('/models', { params: { capability, feature } }).then((response) => response.data as PublicModel[])
    const model = models.find((item) => item.is_default) ?? models[0]
    if (model) defaults.set(feature, model)
  }))
  return defaults
}
