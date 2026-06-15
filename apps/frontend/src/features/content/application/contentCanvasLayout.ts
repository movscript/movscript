import type { ContentCanvasGraph, ContentCanvasNode } from '../domain/contentCanvasTypes'

export type ContentCanvasLayoutSource = 'initial' | 'manual' | 'suggested' | 'imported'

export interface ContentCanvasNodeLayout {
  x: number
  y: number
  width: number
  height: number
  z?: number
  collapsed?: boolean
  pinned?: boolean
  manual?: boolean
  source?: ContentCanvasLayoutSource
  updatedAt?: string
}

export interface ContentCanvasLayoutDocument {
  schema: 'movscript.content_canvas_layout.v1'
  projectId: string | number
  graphScope?: {
    productionId?: string
    mode?: 'structure' | 'dependency' | 'issues'
  }
  updatedAt: string
  nodes: Record<string, ContentCanvasNodeLayout>
  preferences?: {
    hiddenKinds?: string[]
    edgeFilters?: string[]
  }
}

export const CONTENT_CANVAS_DEFAULT_NODE_SIZE = {
  width: 260,
  height: 118,
} as const

const CONTENT_CANVAS_MEDIA_NODE_HEIGHT = 210
const CONTENT_CANVAS_CANDIDATE_ROW_HEIGHT = 66

const CONTENT_CANVAS_ARRANGE_COLUMN_GAP = 360
const CONTENT_CANVAS_ARRANGE_ROW_GAP = 168
const CONTENT_CANVAS_ARRANGE_LANE_GAP = 260

const CONTENT_CANVAS_ARRANGE_FLOW_SLOTS: Record<ContentCanvasNode['kind'], { column: number; lane: number }> = {
  setting: { column: 0, lane: -1 },
  state: { column: 1, lane: -1 },
  asset: { column: 2, lane: -1 },
  expression_unit: { column: 3, lane: -1 },
  audio_cue: { column: 4, lane: -1 },
  project: { column: 0, lane: 0 },
  production: { column: 1, lane: 0 },
  segment: { column: 2, lane: 0 },
  scene_moment: { column: 3, lane: 0 },
  shot: { column: 4, lane: 0 },
  content_unit: { column: 5, lane: 0 },
  keyframe: { column: 4, lane: 1 },
  storyboard: { column: 4, lane: 1 },
  candidate: { column: 6, lane: 1 },
  selection: { column: 6, lane: 1 },
  resource: { column: 7, lane: 1 },
  actor: { column: 6, lane: 2 },
  work_item: { column: 7, lane: 2 },
  group: { column: 0, lane: 2 },
}

const CONTENT_CANVAS_ARRANGE_KIND_ORDER: Record<ContentCanvasNode['kind'], number> = {
  setting: 0,
  state: 0,
  asset: 0,
  expression_unit: 0,
  audio_cue: 0,
  project: 0,
  production: 0,
  segment: 0,
  scene_moment: 0,
  shot: 0,
  content_unit: 0,
  keyframe: 0,
  storyboard: 1,
  candidate: 0,
  selection: 1,
  resource: 0,
  actor: 0,
  work_item: 0,
  group: 0,
}

export function createContentCanvasLayoutFromGraph(
  graph: ContentCanvasGraph,
  previousLayouts: Record<string, ContentCanvasNodeLayout> = {},
): Record<string, ContentCanvasNodeLayout> {
  const nextLayouts: Record<string, ContentCanvasNodeLayout> = { ...previousLayouts }
  for (const node of graph.nodes) {
    nextLayouts[node.id] = mergeContentCanvasNodeLayout(node, previousLayouts[node.id])
  }
  return nextLayouts
}

export function mergeContentCanvasNodeLayout(
  node: ContentCanvasNode,
  previous: ContentCanvasNodeLayout | undefined,
): ContentCanvasNodeLayout {
  if (previous?.manual || previous?.pinned) return previous
  if (previous) {
    return {
      ...previous,
      width: finiteNumber(previous.width) ?? CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
      height: finiteNumber(previous.height) ?? contentCanvasDefaultNodeHeight(node),
    }
  }
  return {
    x: node.position.x,
    y: node.position.y,
    width: CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
    height: contentCanvasDefaultNodeHeight(node),
    source: 'initial',
  }
}

function contentCanvasDefaultNodeHeight(node: ContentCanvasNode): number {
  if (node.kind === 'content_unit' && node.candidates.length > 0) {
    return CONTENT_CANVAS_DEFAULT_NODE_SIZE.height + Math.min(node.candidates.length, 4) * CONTENT_CANVAS_CANDIDATE_ROW_HEIGHT
  }
  if ((node.kind === 'candidate' || node.kind === 'resource') && typeof node.record.resourceId === 'number') {
    return CONTENT_CANVAS_MEDIA_NODE_HEIGHT
  }
  return CONTENT_CANVAS_DEFAULT_NODE_SIZE.height
}

export function patchContentCanvasNodeLayout(
  layouts: Record<string, ContentCanvasNodeLayout>,
  nodeId: string,
  patch: Partial<ContentCanvasNodeLayout>,
  options: { markManual?: boolean; updatedAt?: string } = {},
): Record<string, ContentCanvasNodeLayout> {
  const current = layouts[nodeId] ?? {
    x: 0,
    y: 0,
    width: CONTENT_CANVAS_DEFAULT_NODE_SIZE.width,
    height: CONTENT_CANVAS_DEFAULT_NODE_SIZE.height,
    source: 'suggested' as const,
  }
  return {
    ...layouts,
    [nodeId]: {
      ...current,
      ...patch,
      manual: options.markManual ? true : patch.manual ?? current.manual,
      source: options.markManual ? 'manual' : patch.source ?? current.source,
      updatedAt: options.updatedAt ?? patch.updatedAt ?? current.updatedAt,
    },
  }
}

export function patchContentCanvasNodeLayouts(
  layouts: Record<string, ContentCanvasNodeLayout>,
  patches: Record<string, Partial<ContentCanvasNodeLayout>>,
  options: { markManual?: boolean; updatedAt?: string } = {},
): Record<string, ContentCanvasNodeLayout> {
  let next = layouts
  for (const [nodeId, patch] of Object.entries(patches)) {
    next = patchContentCanvasNodeLayout(next, nodeId, patch, options)
  }
  return next
}

export function contentCanvasLayoutPatchFromPositions(
  positions: Record<string, { x: number; y: number }>,
): Record<string, Partial<ContentCanvasNodeLayout>> {
  return Object.fromEntries(
    Object.entries(positions).map(([nodeId, position]) => [nodeId, { x: position.x, y: position.y }]),
  )
}

export function contentCanvasChangedPositionPatches(
  layouts: Record<string, ContentCanvasNodeLayout>,
  positions: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const patches: Record<string, { x: number; y: number }> = {}
  for (const [nodeId, position] of Object.entries(positions)) {
    const current = layouts[nodeId]
    if (!current || current.x !== position.x || current.y !== position.y) {
      patches[nodeId] = position
    }
  }
  return patches
}

export function arrangeContentCanvasNodeLayouts(
  graph: ContentCanvasGraph,
  layouts: Record<string, ContentCanvasNodeLayout>,
  nodeIds: string[],
  options: { origin?: { x: number; y: number }; updatedAt?: string } = {},
): Record<string, ContentCanvasNodeLayout> {
  const targetIds = new Set(nodeIds)
  const arrangedNodes = graph.nodes
    .filter((node) => targetIds.has(node.id) && !layouts[node.id]?.pinned)
    .sort((left, right) => {
      const leftSlot = arrangeSlotForKind(left.kind)
      const rightSlot = arrangeSlotForKind(right.kind)
      const laneDelta = leftSlot.lane - rightSlot.lane
      if (laneDelta !== 0) return laneDelta
      const columnDelta = leftSlot.column - rightSlot.column
      if (columnDelta !== 0) return columnDelta
      const orderDelta = CONTENT_CANVAS_ARRANGE_KIND_ORDER[left.kind] - CONTENT_CANVAS_ARRANGE_KIND_ORDER[right.kind]
      if (orderDelta !== 0) return orderDelta
      return left.title.localeCompare(right.title, 'zh-CN')
    })
  if (!arrangedNodes.length) return layouts
  const origin = options.origin ?? arrangementOriginForNodes(arrangedNodes, layouts)
  const rowsBySlot = new Map<string, number>()
  let next = layouts
  for (const node of arrangedNodes) {
    const slot = arrangeSlotForKind(node.kind)
    const slotKey = `${slot.lane}:${slot.column}`
    const row = rowsBySlot.get(slotKey) ?? 0
    rowsBySlot.set(slotKey, row + 1)
    next = patchContentCanvasNodeLayout(next, node.id, {
      x: origin.x + slot.column * CONTENT_CANVAS_ARRANGE_COLUMN_GAP,
      y: origin.y + slot.lane * CONTENT_CANVAS_ARRANGE_LANE_GAP + row * CONTENT_CANVAS_ARRANGE_ROW_GAP,
      source: 'suggested',
      updatedAt: options.updatedAt,
    })
  }
  return next
}

export function contentCanvasLayoutPatchesBetween(
  before: Record<string, ContentCanvasNodeLayout>,
  after: Record<string, ContentCanvasNodeLayout>,
  nodeIds: string[],
): Record<string, ContentCanvasNodeLayout> {
  const patches: Record<string, ContentCanvasNodeLayout> = {}
  for (const nodeId of nodeIds) {
    const current = before[nodeId]
    const next = after[nodeId]
    if (!next) continue
    if (!current || current.x !== next.x || current.y !== next.y || current.collapsed !== next.collapsed || current.pinned !== next.pinned) {
      patches[nodeId] = next
    }
  }
  return patches
}

function arrangementOriginForNodes(
  nodes: ContentCanvasNode[],
  layouts: Record<string, ContentCanvasNodeLayout>,
): { x: number; y: number } {
  const positions = nodes
    .map((node) => layouts[node.id] ?? { x: node.position.x, y: node.position.y })
  return {
    x: Math.min(...positions.map((position) => position.x), 0),
    y: Math.min(...positions.map((position) => position.y), 0),
  }
}

function arrangeSlotForKind(kind: ContentCanvasNode['kind']): { column: number; lane: number } {
  return CONTENT_CANVAS_ARRANGE_FLOW_SLOTS[kind] ?? { column: 0, lane: 0 }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
