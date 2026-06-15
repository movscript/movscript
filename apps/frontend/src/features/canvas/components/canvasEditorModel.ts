import type { Node, NodeTypes } from '@xyflow/react'

import type { CanvasNodeData, NodeType } from '@/types'
import { CANVAS_NODE_CATEGORIES } from '@/features/canvas/presentation/nodeCatalog'
import {
  CANVAS_WORKFLOW_PANE_MAX_WIDTH,
  CANVAS_WORKFLOW_PANE_MIN_WIDTH,
} from '@/routes/routeLayoutRegistry'
import { TextNode, ImageNode, VideoNode, ToolNode, InputNode, OutputNode, ResourceSinkNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode } from '@/features/canvas/ui/CanvasNodes'

export const canvasEditorNodeTypes: NodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  canvas: ToolNode,
  ref_image_gen: ToolNode,
  ref_video_gen: ToolNode,
  multi_angle: ToolNode,
  style_transfer: ToolNode,
  motion_imitation: ToolNode,
  input: InputNode,
  output: OutputNode,
  resource_sink: ResourceSinkNode,
  approval: ApprovalNode,
  text_gen: TextGenNode,
  ai_gen: AIGenNode,
  group: GroupNode,
}

export const SIDEBAR_NODE_CATEGORIES = CANVAS_NODE_CATEGORIES.filter((category) => category.id !== 'media')
export const SIDEBAR_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval', 'resource_sink', 'canvas'])
export const CANVAS_GRID_MIN_ZOOM = 0.65
export const CANVAS_OVERVIEW_MIN_ZOOM = 0.45
export const CANVAS_BUSY_OVERVIEW_MIN_ZOOM = 0.8
export const CANVAS_OVERVIEW_NODE_LIMIT = 80
export const CANVAS_MINIMAP_NODE_LIMIT = 60

export function clampCanvasWorkflowPaneWidth(width: number) {
  return Math.min(
    CANVAS_WORKFLOW_PANE_MAX_WIDTH,
    Math.max(CANVAS_WORKFLOW_PANE_MIN_WIDTH, Math.round(Number(width) || 0)),
  )
}

export function shouldUseCanvasOverviewMode(zoom: number, nodeCount: number) {
  return zoom < CANVAS_OVERVIEW_MIN_ZOOM || (nodeCount > CANVAS_OVERVIEW_NODE_LIMIT && zoom < CANVAS_BUSY_OVERVIEW_MIN_ZOOM)
}

export function canvasNodeIsRunning(node: Node) {
  const data = node.data as unknown as CanvasNodeData
  return data.status === 'running' || data.status === 'pending'
}

export function canvasNodeIsDone(node: Node) {
  return (node.data as unknown as CanvasNodeData).status === 'done'
}

export function canvasNodeIsAiProcessor(node: Node) {
  return (node.data as unknown as CanvasNodeData).source === 'ai'
}
