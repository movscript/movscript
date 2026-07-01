import type { Node } from '@xyflow/react'

export { FINAL_OUTPUT_NODE_ID } from '@movscript/core/canvas'
export const GROUP_SELECTION_PADDING = 64

export interface CanvasClientPoint {
  x: number
  y: number
}

export interface CanvasFlowPoint {
  x: number
  y: number
}

export interface CanvasFlowCoordinateSpace {
  fromClient(point: CanvasClientPoint): CanvasFlowPoint
  defaultClientPoint(): CanvasClientPoint
}

export function canvasDefaultClientPoint({
  containerRect,
  viewportWidth,
  viewportHeight,
}: {
  containerRect?: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'> | null
  viewportWidth: number
  viewportHeight: number
}): CanvasClientPoint {
  if (containerRect) {
    return {
      x: containerRect.left + containerRect.width / 2,
      y: containerRect.top + containerRect.height / 2,
    }
  }
  return {
    x: Math.max(0, viewportWidth) / 2,
    y: Math.max(0, viewportHeight) / 2,
  }
}

function roundedCanvasLayoutValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.round(number) : 0
}

export function compactCanvasLayoutRect(
  rect?: Pick<DOMRectReadOnly, 'width' | 'height' | 'left' | 'top'> | null,
) {
  if (!rect) return 'none'
  return [
    `${roundedCanvasLayoutValue(rect.width)}x${roundedCanvasLayoutValue(rect.height)}`,
    `${roundedCanvasLayoutValue(rect.left)}`,
    `${roundedCanvasLayoutValue(rect.top)}`,
  ].join('+')
}

const MEDIA_PREVIEW_VISIBLE_NODE_BUDGET = 32
const MEDIA_PREVIEW_SCREEN_PIXEL_BUDGET = 2_400_000
const MEDIA_PREVIEW_ALWAYS_ON_NODE_BUDGET = 8

const TOOL_CARD_NODE_TYPES = new Set<string>([
  'canvas',
  'reference_to_image',
  'reference_to_video',
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

export function isCanvasNodeVisibleInViewport(
  node: Node,
  nodeById: Map<string, Node>,
  viewport: { x: number; y: number; width: number; height: number },
) {
  const position = canvasNodeAbsolutePosition(node, nodeById)
  const dimensions = canvasNodeDimensions(node)
  return (
    position.x + dimensions.width >= viewport.x
    && position.y + dimensions.height >= viewport.y
    && position.x <= viewport.x + viewport.width
    && position.y <= viewport.y + viewport.height
  )
}

export function shouldUseCanvasMediaLightweightMode({
  nodes,
  viewportX,
  viewportY,
  zoom,
  viewportWidth,
  viewportHeight,
}: {
  nodes: Node[]
  viewportX: number
  viewportY: number
  zoom: number
  viewportWidth: number
  viewportHeight: number
}) {
  if (zoom <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return false
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const viewport = {
    x: -viewportX / zoom,
    y: -viewportY / zoom,
    width: viewportWidth / zoom,
    height: viewportHeight / zoom,
  }
  let visibleMediaNodes = 0
  let estimatedScreenPixels = 0
  for (const node of nodes) {
    const data = node.data as { resource?: { type?: string } } | undefined
    const resourceType = data?.resource?.type
    if (resourceType !== 'image' && resourceType !== 'video') continue
    if (!isCanvasNodeVisibleInViewport(node, nodeById, viewport)) continue
    visibleMediaNodes += 1
    const dimensions = canvasNodeDimensions(node)
    estimatedScreenPixels += dimensions.width * dimensions.height * zoom * zoom
  }
  if (visibleMediaNodes <= MEDIA_PREVIEW_ALWAYS_ON_NODE_BUDGET) return false
  return visibleMediaNodes > MEDIA_PREVIEW_VISIBLE_NODE_BUDGET || estimatedScreenPixels > MEDIA_PREVIEW_SCREEN_PIXEL_BUDGET
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

export function canvasNodeGroupId(node: Node | undefined) {
  if (!node) return undefined
  const data = node.data as { groupId?: string } | undefined
  return data?.groupId ?? node.parentId
}

export function canvasNodeWithGroupId(node: Node, groupId: string | undefined): Node {
  const nextData = { ...(node.data as Record<string, unknown>) }
  if (groupId) nextData.groupId = groupId
  else delete nextData.groupId
  return {
    ...node,
    parentId: undefined,
    data: nextData,
  }
}

export function commonCanvasGroupId(nodes: Node[]) {
  if (nodes.length === 0) return undefined
  const firstGroupId = canvasNodeGroupId(nodes[0])
  return nodes.every((node) => canvasNodeGroupId(node) === firstGroupId) ? firstGroupId : undefined
}

export function isCanvasNodeOutsideGroupBounds(node: Node, group: Node) {
  const groupDimensions = canvasNodeDimensions(group)
  const nodeDimensions = canvasNodeDimensions(node)
  const centerX = node.position.x + nodeDimensions.width / 2
  const centerY = node.position.y + nodeDimensions.height / 2
  return (
    centerX < group.position.x
    || centerY < group.position.y
    || centerX > group.position.x + groupDimensions.width
    || centerY > group.position.y + groupDimensions.height
  )
}

export function isCanvasNodeInsideGroupBounds(node: Node, group: Node) {
  return !isCanvasNodeOutsideGroupBounds(node, group)
}

function hasSelectedAncestor(node: Node, selectedIds: Set<string>, nodeById: Map<string, Node>) {
  let parentId = node.parentId
  while (parentId) {
    if (selectedIds.has(parentId)) return true
    parentId = nodeById.get(parentId)?.parentId
  }
  let groupId = canvasNodeGroupId(node)
  const visitedGroupIds = new Set<string>()
  while (groupId) {
    if (visitedGroupIds.has(groupId)) break
    visitedGroupIds.add(groupId)
    if (selectedIds.has(groupId)) return true
    groupId = canvasNodeGroupId(nodeById.get(groupId))
  }
  return false
}

export function topLevelSelectedCanvasNodes(nodes: Node[], selected: Node[]) {
  const selectedIds = new Set(selected.map((node) => node.id))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return selected.filter((node) => !hasSelectedAncestor(node, selectedIds, nodeById))
}

export function canvasGroupDescendantIds(nodes: Node[], groupId: string) {
  const descendantGroupIds = new Set<string>([groupId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.id === groupId || node.type !== 'group' || descendantGroupIds.has(node.id)) continue
      const nodeGroupId = canvasNodeGroupId(node)
      if (!nodeGroupId || !descendantGroupIds.has(nodeGroupId)) continue
      descendantGroupIds.add(node.id)
      changed = true
    }
  }
  return new Set(nodes
    .filter((node) => node.id !== groupId && descendantGroupIds.has(canvasNodeGroupId(node) ?? ''))
    .map((node) => node.id))
}

export function canvasGroupAncestorIds(nodes: Node[], groupId: string) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const ancestorIds: string[] = []
  const visitedGroupIds = new Set<string>([groupId])
  let nextGroupId = canvasNodeGroupId(nodeById.get(groupId))
  while (nextGroupId && !visitedGroupIds.has(nextGroupId)) {
    visitedGroupIds.add(nextGroupId)
    ancestorIds.push(nextGroupId)
    nextGroupId = canvasNodeGroupId(nodeById.get(nextGroupId))
  }
  return ancestorIds
}

export function findCanvasGroupDropTarget(
  draggedNode: Node,
  nodes: Node[],
  options: { excludedGroupIds?: Iterable<string> } = {},
) {
  const currentGroupId = canvasNodeGroupId(draggedNode)
  const excludedGroupIds = new Set(options.excludedGroupIds ?? [])
  const draggedDescendantIds = draggedNode.type === 'group'
    ? canvasGroupDescendantIds(nodes, draggedNode.id)
    : new Set<string>()
  const candidates = nodes.filter((candidate) => (
    candidate.type === 'group'
    && candidate.id !== draggedNode.id
    && candidate.id !== currentGroupId
    && !excludedGroupIds.has(candidate.id)
    && !draggedDescendantIds.has(candidate.id)
    && isCanvasNodeInsideGroupBounds(draggedNode, candidate)
  ))
  if (candidates.length === 0) return undefined

  return candidates.sort((a, b) => {
    const aContainsB = canvasGroupDescendantIds(nodes, a.id).has(b.id)
    const bContainsA = canvasGroupDescendantIds(nodes, b.id).has(a.id)
    if (aContainsB !== bContainsA) return aContainsB ? 1 : -1

    const aDepth = canvasGroupDepth(nodes, a.id)
    const bDepth = canvasGroupDepth(nodes, b.id)
    if (aDepth !== bDepth) return bDepth - aDepth

    const aDimensions = canvasNodeDimensions(a)
    const bDimensions = canvasNodeDimensions(b)
    return (aDimensions.width * aDimensions.height) - (bDimensions.width * bDimensions.height)
  })[0]
}

export function resolveCanvasGroupPromotionId(
  groupId: string,
  groupParentById: Map<string, string | undefined>,
) {
  let nextGroupId = groupParentById.get(groupId)
  const visitedGroupIds = new Set<string>([groupId])
  while (nextGroupId && groupParentById.has(nextGroupId)) {
    if (visitedGroupIds.has(nextGroupId)) return undefined
    visitedGroupIds.add(nextGroupId)
    nextGroupId = groupParentById.get(nextGroupId)
  }
  return nextGroupId
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

function canvasGroupDepth(nodes: Node[], groupId: string) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const visitedGroupIds = new Set<string>([groupId])
  let depth = 0
  let nextGroupId = canvasNodeGroupId(nodeById.get(groupId))
  while (nextGroupId && !visitedGroupIds.has(nextGroupId)) {
    visitedGroupIds.add(nextGroupId)
    depth += 1
    nextGroupId = canvasNodeGroupId(nodeById.get(nextGroupId))
  }
  return depth
}

export function resizeCanvasGroupsToFitMembers(
  nodes: Node[],
  groupIds: Array<string | undefined>,
  padding = GROUP_SELECTION_PADDING,
) {
  const existingGroupIds = new Set(nodes.filter((node) => node.type === 'group').map((node) => node.id))
  const targetGroupIds = new Set<string>()
  for (const groupId of groupIds) {
    if (!groupId || !existingGroupIds.has(groupId)) continue
    targetGroupIds.add(groupId)
    for (const ancestorId of canvasGroupAncestorIds(nodes, groupId)) {
      if (existingGroupIds.has(ancestorId)) targetGroupIds.add(ancestorId)
    }
  }
  if (targetGroupIds.size === 0) return nodes

  const orderedGroupIds = [...targetGroupIds].sort((a, b) => canvasGroupDepth(nodes, b) - canvasGroupDepth(nodes, a))
  return orderedGroupIds.reduce((nextNodes, groupId) => {
    const members = nextNodes.filter((node) => node.id !== groupId && canvasNodeGroupId(node) === groupId)
    const bounds = canvasGroupSelectionBounds(nextNodes, members, padding, 1)
    if (!bounds) return nextNodes
    return nextNodes.map((node) => {
      if (node.id !== groupId) return node
      return {
        ...node,
        position: { x: bounds.x, y: bounds.y },
        style: {
          ...node.style,
          width: bounds.width,
          height: bounds.height,
        },
      }
    })
  }, nodes)
}
