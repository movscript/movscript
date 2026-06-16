import type {
  ContentCanvasEdge,
  ContentCanvasNode,
  ContentCanvasNodeKind,
} from './contentCanvasTypes'

const COLUMN_GAP = 360
const ROW_GAP = 168
const FLOW_LANE_GAP = 260

const FLOW_SLOTS: Record<ContentCanvasNodeKind, { column: number; lane: number }> = {
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

const FLOW_KIND_ORDER: Record<ContentCanvasNodeKind, number> = {
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

export function appendSequenceEdges(edges: ContentCanvasEdge[], nodes: ContentCanvasNode[]) {
  const parentByNodeId = new Map(edges.filter((edge) => edge.kind === 'hierarchy').map((edge) => [edge.target, edge.source]))
  const sequenceKinds = new Set<ContentCanvasNodeKind>([
    'production',
    'segment',
    'scene_moment',
    'shot',
    'storyboard',
    'keyframe',
    'audio_cue',
    'expression_unit',
    'content_unit',
  ])
  const groups = new Map<string, ContentCanvasNode[]>()
  for (const node of nodes) {
    if (!sequenceKinds.has(node.kind)) continue
    const parentId = parentByNodeId.get(node.id)
    if (!parentId) continue
    const key = `${parentId}:${node.kind}`
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareSequenceNodes)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const next = sorted[index]
      edges.push({
        id: `${previous.id}->${next.id}:sequence`,
        source: previous.id,
        target: next.id,
        label: '顺序',
        kind: 'sequence',
      })
    }
  }
}

export function assignDeterministicPositions(nodes: ContentCanvasNode[]): ContentCanvasNode[] {
  const rowsBySlot = new Map<string, number>()
  return [...nodes]
    .sort(compareCanvasNodes)
    .map((node) => {
      const slot = flowSlotForKind(node.kind)
      const slotKey = `${slot.lane}:${slot.column}`
      const row = rowsBySlot.get(slotKey) ?? 0
      rowsBySlot.set(slotKey, row + 1)
      return {
        ...node,
        position: {
          x: slot.column * COLUMN_GAP,
          y: slot.lane * FLOW_LANE_GAP + row * ROW_GAP,
        },
      }
    })
}

function compareSequenceNodes(left: ContentCanvasNode, right: ContentCanvasNode) {
  const leftOrder = numberValue(left.record.order)
  const rightOrder = numberValue(right.record.order)
  if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? 0) - (rightOrder ?? 0)
  return left.title.localeCompare(right.title, 'zh-CN')
}

function compareCanvasNodes(left: ContentCanvasNode, right: ContentCanvasNode) {
  const leftSlot = flowSlotForKind(left.kind)
  const rightSlot = flowSlotForKind(right.kind)
  const laneDelta = leftSlot.lane - rightSlot.lane
  if (laneDelta !== 0) return laneDelta
  const columnDelta = leftSlot.column - rightSlot.column
  if (columnDelta !== 0) return columnDelta
  const orderDelta = FLOW_KIND_ORDER[left.kind] - FLOW_KIND_ORDER[right.kind]
  if (orderDelta !== 0) return orderDelta
  return left.title.localeCompare(right.title, 'zh-CN')
}

function flowSlotForKind(kind: ContentCanvasNodeKind): { column: number; lane: number } {
  return FLOW_SLOTS[kind] ?? { column: 0, lane: 0 }
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}
