import type { CSSProperties } from 'react'
import type { ContentCanvasEdge, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export const CONTENT_CANVAS_FILTERS: Array<{ kind: ContentCanvasNodeKind | 'all'; label: string }> = [
  { kind: 'all', label: '全部' },
  { kind: 'production', label: '制作' },
  { kind: 'segment', label: '段落' },
  { kind: 'scene_moment', label: '情节' },
  { kind: 'storyboard', label: '分镜' },
  { kind: 'expression_unit', label: '表达' },
  { kind: 'content_unit', label: '制作项' },
  { kind: 'candidate', label: '候选' },
  { kind: 'selection', label: '选择' },
  { kind: 'resource', label: '资源' },
  { kind: 'keyframe', label: '关键帧' },
  { kind: 'asset', label: '素材' },
  { kind: 'setting', label: '设定' },
  { kind: 'state', label: '状态' },
  { kind: 'audio_cue', label: '声音' },
  { kind: 'work_item', label: '工作项' },
  { kind: 'actor', label: '处理者' },
  { kind: 'group', label: '分组' },
]

export function editPromptText(node: ContentCanvasNode): string {
  const prompt = node.record.edit_prompt ?? node.record.editPrompt ?? node.record.prompt
  if (typeof prompt === 'string') return prompt
  if (isRecord(prompt) && typeof prompt.text === 'string') return prompt.text
  return node.kind === 'content_unit' ? node.summary : ''
}

export function countByKind(nodes: ContentCanvasNode[]) {
  return nodes.reduce<Record<ContentCanvasNodeKind, number>>((acc, node) => {
    acc[node.kind] += 1
    return acc
  }, {
    project: 0,
    production: 0,
    segment: 0,
    scene_moment: 0,
    storyboard: 0,
    expression_unit: 0,
    content_unit: 0,
    candidate: 0,
    selection: 0,
    resource: 0,
    keyframe: 0,
    asset: 0,
    setting: 0,
    state: 0,
    audio_cue: 0,
    work_item: 0,
    actor: 0,
    group: 0,
  })
}

export function kindLabel(kind: ContentCanvasNodeKind) {
  if (kind === 'project') return '项目'
  if (kind === 'production') return '制作'
  if (kind === 'segment') return '段落'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'storyboard') return '分镜图'
  if (kind === 'expression_unit') return '表达单元'
  if (kind === 'content_unit') return '制作项'
  if (kind === 'candidate') return '候选'
  if (kind === 'selection') return '选择'
  if (kind === 'resource') return '资源'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'asset') return '素材'
  if (kind === 'setting') return '设定'
  if (kind === 'state') return '状态'
  if (kind === 'audio_cue') return '声音'
  if (kind === 'work_item') return '工作项'
  if (kind === 'actor') return '处理者'
  if (kind === 'group') return '分组'
  return '设定'
}

export function kindShortCode(kind: ContentCanvasNodeKind) {
  if (kind === 'project') return 'PRJ'
  if (kind === 'production') return 'PROD'
  if (kind === 'segment') return 'SEG'
  if (kind === 'scene_moment') return 'SCN'
  if (kind === 'storyboard') return 'STB'
  if (kind === 'expression_unit') return 'EXP'
  if (kind === 'content_unit') return 'UNIT'
  if (kind === 'candidate') return 'CAND'
  if (kind === 'selection') return 'SEL'
  if (kind === 'resource') return 'RES'
  if (kind === 'keyframe') return 'KEY'
  if (kind === 'asset') return 'AST'
  if (kind === 'setting') return 'SET'
  if (kind === 'state') return 'STATE'
  if (kind === 'audio_cue') return 'AUD'
  if (kind === 'work_item') return 'WORK'
  if (kind === 'actor') return 'ACT'
  if (kind === 'group') return 'GRP'
  return 'NODE'
}

export function statusLabel(status: ContentCanvasNode['status']) {
  if (status === 'ready') return '稳定'
  if (status === 'active') return '推进中'
  if (status === 'missing') return '待补齐'
  return '记录'
}

export type ContentCanvasEdgeVisualLayer =
  | 'structure'
  | 'sequence'
  | 'input'
  | 'product'
  | 'selection'
  | 'issue'
  | 'default'

export interface ContentCanvasEdgeVisualState {
  layer: ContentCanvasEdgeVisualLayer
  color: string
  classNames: string[]
  style: CSSProperties
  markerColor: string
}

export interface ContentCanvasVisualEdgeEndpoints {
  source: string
  target: string
  reversed: boolean
}

export interface ContentCanvasVisualEdgeBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ContentCanvasVisualEdgeHandles {
  sourceHandle: string
  targetHandle: string
}

export function contentCanvasEdgeVisualState(
  edge: ContentCanvasEdge,
  options: {
    selectedNodeId?: string | null
    selectedEdgeId?: string | null
    impactedNodeIds?: ReadonlySet<string>
  } = {},
): ContentCanvasEdgeVisualState {
  const layer = contentCanvasEdgeVisualLayer(edge)
  const color = contentCanvasEdgeStrokeColor(edge)
  const selected = options.selectedEdgeId === edge.id
  const focused = Boolean(options.selectedNodeId && (edge.source === options.selectedNodeId || edge.target === options.selectedNodeId))
  const impacted = Boolean(options.impactedNodeIds?.has(edge.source) || options.impactedNodeIds?.has(edge.target))
  const stateful = edge.state === 'needs_candidate' || edge.state === 'missing' || edge.state === 'stale'
  const dimmed = Boolean(options.selectedNodeId && !focused && !impacted && !stateful && !selected)
  const style: CSSProperties = {
    stroke: color,
    strokeWidth: contentCanvasEdgeStrokeWidth(edge, layer, { selected, impacted }),
    opacity: dimmed ? 0.18 : contentCanvasEdgeOpacity(edge, layer),
  }
  const dashArray = contentCanvasEdgeDashArray(edge, layer)
  if (dashArray) style.strokeDasharray = dashArray
  return {
    layer,
    color,
    markerColor: dimmed ? '#cbd5e1' : color,
    style,
    classNames: [
      'content-canvas-edge',
      `content-canvas-edge--${edge.kind}`,
      `content-canvas-edge-layer--${layer}`,
      edge.type ? `content-canvas-edge-type--${edge.type}` : '',
      edge.relation ? `content-canvas-edge--${edge.relation}` : '',
      edge.state ? `content-canvas-edge--state-${edge.state}` : '',
      focused ? 'content-canvas-edge--focused' : '',
      impacted ? 'content-canvas-edge--impact' : '',
      dimmed ? 'content-canvas-edge--dimmed' : '',
      selected ? 'content-canvas-edge--selected' : '',
    ].filter(Boolean),
  }
}

export function contentCanvasVisualEdgeEndpoints(edge: ContentCanvasEdge): ContentCanvasVisualEdgeEndpoints {
  if (contentCanvasEdgeShouldReverseForFlow(edge)) {
    return {
      source: edge.target,
      target: edge.source,
      reversed: true,
    }
  }
  return {
    source: edge.source,
    target: edge.target,
    reversed: false,
  }
}

export function contentCanvasVisualEdgeHandles(
  edge: ContentCanvasEdge,
  source: ContentCanvasVisualEdgeBounds | undefined,
  target: ContentCanvasVisualEdgeBounds | undefined,
): ContentCanvasVisualEdgeHandles {
  if (!source || !target) return { sourceHandle: 'source-right', targetHandle: 'target-left' }
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  }
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  }
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y
  const layer = contentCanvasEdgeVisualLayer(edge)
  if ((layer === 'input' || layer === 'issue') && Math.abs(dy) > Math.max(Math.abs(dx) * 0.72, 96)) {
    return dy >= 0
      ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
      : { sourceHandle: 'source-top', targetHandle: 'target-bottom' }
  }
  return dx >= 0
    ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
    : { sourceHandle: 'source-left', targetHandle: 'target-right' }
}

export function contentCanvasEdgeVisualLayer(edge: ContentCanvasEdge): ContentCanvasEdgeVisualLayer {
  if (edge.state === 'needs_candidate' || edge.state === 'missing' || edge.state === 'stale') return 'issue'
  if (edge.relation === 'work_item_target' || edge.relation === 'actor_work_item' || edge.type === 'work_item_targets') return 'issue'
  if (edge.kind === 'hierarchy' || edge.type === 'contains') return 'structure'
  if (edge.kind === 'sequence' || edge.type === 'sequence') return 'sequence'
  if (edge.relation === 'content_unit_candidate' || edge.relation === 'candidate_resource' || edge.type === 'generates') return 'product'
  if (edge.relation === 'selection_candidate' || edge.type === 'selected_from') return 'selection'
  if (
    edge.relation === 'content_unit_asset'
    || edge.relation === 'content_unit_keyframe'
    || edge.relation === 'content_unit_storyboard'
    || edge.relation === 'content_unit_scene'
    || edge.relation === 'setting_state_reference'
    || edge.relation === 'expression_unit_storyboard'
    || edge.relation === 'expression_unit_content_unit'
    || edge.relation === 'audio_cue_storyboard'
    || edge.relation === 'audio_cue_asset'
    || edge.relation === 'asset_downstream'
    || edge.type === 'constrains'
    || edge.type === 'depends_on'
    || edge.type === 'invalidates'
  ) return 'input'
  return 'default'
}

function contentCanvasEdgeShouldReverseForFlow(edge: ContentCanvasEdge): boolean {
  return edge.relation === 'content_unit_asset'
    || edge.relation === 'content_unit_keyframe'
    || edge.relation === 'content_unit_storyboard'
    || edge.relation === 'setting_state_reference'
    || edge.relation === 'audio_cue_asset'
}

export function contentCanvasEdgeStrokeColor(edge: ContentCanvasEdge): string {
  if (edge.state === 'needs_candidate' || edge.state === 'missing') return '#dc2626'
  if (edge.state === 'stale') return '#d97706'
  if (edge.relation) return CONTENT_CANVAS_EDGE_RELATION_COLORS[edge.relation] ?? CONTENT_CANVAS_EDGE_TYPE_COLORS[edge.type ?? 'affects']
  if (edge.kind === 'hierarchy') return CONTENT_CANVAS_EDGE_TYPE_COLORS.contains
  if (edge.kind === 'sequence') return CONTENT_CANVAS_EDGE_TYPE_COLORS.sequence
  return CONTENT_CANVAS_EDGE_TYPE_COLORS[edge.type ?? 'affects']
}

export function contentCanvasBackgroundEdgeColor(edge: ContentCanvasEdge): string {
  const layer = contentCanvasEdgeVisualLayer(edge)
  return hexToRgba(contentCanvasEdgeStrokeColor(edge), layer === 'structure' || layer === 'sequence' ? 0.2 : 0.34)
}

function contentCanvasEdgeStrokeWidth(
  edge: ContentCanvasEdge,
  layer: ContentCanvasEdgeVisualLayer,
  state: { selected: boolean; impacted: boolean },
): number {
  if (state.selected) return 3
  if (edge.state === 'needs_candidate' || edge.state === 'missing' || edge.state === 'stale') return 3
  if (state.impacted) return 2.5
  if (layer === 'selection') return 2.5
  if (layer === 'product' || layer === 'input' || layer === 'issue') return 2
  return 1.35
}

function contentCanvasEdgeOpacity(edge: ContentCanvasEdge, layer: ContentCanvasEdgeVisualLayer): number {
  if (edge.state === 'needs_candidate' || edge.state === 'missing' || edge.state === 'stale') return 0.95
  if (layer === 'structure') return 0.46
  if (layer === 'sequence') return 0.34
  if (layer === 'default') return 0.62
  return 0.84
}

function contentCanvasEdgeDashArray(edge: ContentCanvasEdge, layer: ContentCanvasEdgeVisualLayer): string | undefined {
  if (edge.kind === 'sequence' || layer === 'sequence') return '2 7'
  if (edge.relation === 'selection_candidate') return undefined
  if (edge.relation === 'candidate_resource') return undefined
  if (layer === 'product') return '2 5'
  if (layer === 'input') return '5 6'
  if (layer === 'issue') return '4 5'
  if (edge.kind === 'reference') return '6 4'
  return undefined
}

const CONTENT_CANVAS_EDGE_RELATION_COLORS: Partial<Record<NonNullable<ContentCanvasEdge['relation']>, string>> = {
  content_unit_scene: '#16a34a',
  content_unit_asset: '#2563eb',
  content_unit_keyframe: '#d97706',
  content_unit_storyboard: '#db2777',
  content_unit_candidate: '#7c3aed',
  candidate_resource: '#0d9488',
  selection_candidate: '#22c55e',
  asset_downstream: '#ea580c',
  setting_state_reference: '#65a30d',
  expression_unit_storyboard: '#a3e635',
  expression_unit_content_unit: '#4d7c0f',
  audio_cue_storyboard: '#0ea5e9',
  audio_cue_asset: '#0369a1',
  work_item_target: '#dc2626',
  actor_work_item: '#f97316',
}

const CONTENT_CANVAS_EDGE_TYPE_COLORS: Record<NonNullable<ContentCanvasEdge['type']>, string> = {
  contains: '#64748b',
  sequence: '#94a3b8',
  constrains: '#65a30d',
  depends_on: '#2563eb',
  generates: '#7c3aed',
  selected_from: '#22c55e',
  invalidates: '#d97706',
  affects: '#475569',
  work_item_targets: '#dc2626',
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  if (!Number.isFinite(value)) return `rgba(100, 116, 139, ${alpha})`
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
