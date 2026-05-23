import type { Node } from '@xyflow/react'

export const FINAL_OUTPUT_NODE_ID = 'final-output'
export const GROUP_SELECTION_PADDING = 64

const TOOL_CARD_NODE_TYPES = new Set<string>([
  'canvas',
  'ref_image_gen',
  'ref_video_gen',
  'multi_angle',
  'style_transfer',
  'motion_imitation',
  'plugin_card',
  'text_gen',
  'ai_gen',
])

const IO_CARD_NODE_TYPES = new Set<string>(['input', 'output', 'resource_sink'])

export function numericStyleValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function defaultCanvasNodeWidth(type?: string) {
  if (type && TOOL_CARD_NODE_TYPES.has(type)) return 320
  if (type && IO_CARD_NODE_TYPES.has(type)) return 260
  if (type === 'text' || type === 'approval') return 220
  return 200
}

export function defaultCanvasNodeHeight(type?: string) {
  if (type && TOOL_CARD_NODE_TYPES.has(type)) return 220
  if (type && IO_CARD_NODE_TYPES.has(type)) return 150
  if (type === 'approval') return 120
  return 100
}

export function normalizedCanvasNodeStyle(type?: string, style?: Node['style']): Node['style'] {
  if (type === 'group') return style ?? { width: 320, height: 240 }
  const width = Math.max(numericStyleValue(style?.width) ?? 0, defaultCanvasNodeWidth(type))
  return { ...style, width }
}

export function canvasNodeDimensions(node: Node) {
  return {
    width: node.measured?.width
      ?? numericStyleValue(node.style?.width)
      ?? defaultCanvasNodeWidth(node.type),
    height: node.measured?.height
      ?? numericStyleValue(node.style?.height)
      ?? defaultCanvasNodeHeight(node.type),
  }
}

export function canvasNodeAbsolutePosition(node: Node, nodeById: Map<string, Node>) {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = nodeById.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

function hasSelectedAncestor(node: Node, selectedIds: Set<string>, nodeById: Map<string, Node>) {
  let parentId = node.parentId
  while (parentId) {
    if (selectedIds.has(parentId)) return true
    parentId = nodeById.get(parentId)?.parentId
  }
  return false
}

export function topLevelSelectedCanvasNodes(nodes: Node[], selected: Node[]) {
  const selectedIds = new Set(selected.map((node) => node.id))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return selected.filter((node) => !hasSelectedAncestor(node, selectedIds, nodeById))
}

export function commonParentId(nodes: Node[]) {
  if (nodes.length === 0) return undefined
  const firstParentId = nodes[0].parentId
  return nodes.every((node) => node.parentId === firstParentId) ? firstParentId : undefined
}

export function canvasGroupSelectionBounds(
  nodes: Node[],
  selected: Node[],
  padding = GROUP_SELECTION_PADDING,
  minCount = 2,
) {
  if (selected.length < minCount) return null
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const selectedBounds = selected.map((node) => {
    const position = canvasNodeAbsolutePosition(node, nodeById)
    const dimensions = canvasNodeDimensions(node)
    return {
      node,
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height,
    }
  })
  const minX = Math.min(...selectedBounds.map((bounds) => bounds.x)) - padding
  const minY = Math.min(...selectedBounds.map((bounds) => bounds.y)) - padding
  const maxX = Math.max(...selectedBounds.map((bounds) => bounds.x + bounds.width)) + padding
  const maxY = Math.max(...selectedBounds.map((bounds) => bounds.y + bounds.height)) + padding
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    count: selected.length,
    absolutePositionByNodeId: new Map(selectedBounds.map((bounds) => [bounds.node.id, { x: bounds.x, y: bounds.y }])),
  }
}
