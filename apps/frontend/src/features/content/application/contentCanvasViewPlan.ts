import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'

export type ContentCanvasViewMode = 'structure' | 'dependency' | 'issues'
export type ContentCanvasImpactKind = 'created' | 'selected' | 'affected'
export type ContentCanvasDensity = 'overview' | 'workband' | 'trace'
export type ContentCanvasLodTier = 'normal' | 'folded' | 'clustered' | 'focused'
export type ContentCanvasStatusFilter = 'all' | 'selected' | 'ready' | 'stale' | 'needs_candidate' | 'missing'
export type ContentCanvasIssueActorFilter = 'all' | 'human' | 'agent' | 'workflow'
export type ContentCanvasIssueSeverityFilter = 'all' | 'blocking' | 'warning' | 'suggestion'
export type ContentCanvasIssueTargetKindFilter = ContentCanvasNodeKind | 'all'
export type ContentCanvasEdgeFilter = ContentCanvasEdge['kind'] | NonNullable<ContentCanvasEdge['relation']>

export interface ContentCanvasViewPlanInput {
  graph: ContentCanvasGraph
  query: string
  kindFilter: ContentCanvasNodeKind | 'all'
  statusFilter?: ContentCanvasStatusFilter
  mode: ContentCanvasViewMode
  selectedNodeId: string | null
  impactByNodeId: Record<string, ContentCanvasImpactKind>
  issueActorFilter?: ContentCanvasIssueActorFilter
  issueSeverityFilter?: ContentCanvasIssueSeverityFilter
  issueTargetKindFilter?: ContentCanvasIssueTargetKindFilter
  layoutByNodeId?: Record<string, Pick<ContentCanvasNodeLayout, 'collapsed'>>
  hiddenKinds?: ContentCanvasNodeKind[]
  edgeFilters?: ContentCanvasEdgeFilter[]
  largeGraphNodeThreshold?: number
  clusterGraphNodeThreshold?: number
  focusedGraphNodeThreshold?: number
  edgeRenderLimit?: number
}

export interface ContentCanvasViewPlan {
  graph: ContentCanvasGraph
  density: ContentCanvasDensity
  lodTier: ContentCanvasLodTier
  hiddenNodeIds: Set<string>
  hiddenEdgeIds: Set<string>
  backgroundEdges: ContentCanvasEdge[]
  edgeLabelIds: Set<string>
  collapsedSummariesByNodeId: Record<string, ContentCanvasCollapsedRelationSummary[]>
  edgeSummariesByNodeId: Record<string, ContentCanvasHiddenEdgeSummary[]>
}

export interface ContentCanvasCollapsedRelationSummary {
  kind: ContentCanvasNodeKind
  count: number
  label: string
}

export interface ContentCanvasHiddenEdgeSummary {
  relation: ContentCanvasEdge['relation'] | 'hierarchy' | 'reference' | 'sequence'
  count: number
  label: string
}

const STRUCTURE_KINDS = new Set<ContentCanvasNodeKind>([
  'project',
  'production',
  'segment',
  'scene_moment',
  'shot',
  'group',
])

const WORKBAND_KINDS = new Set<ContentCanvasNodeKind>([
  'keyframe',
  'storyboard',
  'content_unit',
])

const TRACE_KINDS = new Set<ContentCanvasNodeKind>([
  'asset',
  'setting',
  'state',
  'audio_cue',
  'candidate',
  'selection',
  'resource',
  'keyframe',
  'storyboard',
  'content_unit',
])

export function buildContentCanvasViewPlan(input: ContentCanvasViewPlanInput): ContentCanvasViewPlan {
  const density = contentCanvasDensityFor(input)
  const lodTier = contentCanvasLodTierFor(input)
  const allowedNodeIds = contentCanvasModeNodeIds(input.graph, input.mode, input.selectedNodeId, input.impactByNodeId, density, lodTier)
  const needle = input.query.trim().toLowerCase()
  const traceNodeIdsToKeep = traceNodeIdsAllowedBySelection(input.graph, input.mode, input.selectedNodeId, needle, input.impactByNodeId)
  const issueNodeIds = issueNodeIdsForFilters(
    input.graph,
    input.issueActorFilter ?? 'all',
    input.issueSeverityFilter ?? 'all',
    input.issueTargetKindFilter ?? 'all',
  )
  const hiddenKinds = new Set(input.hiddenKinds ?? [])
  const edgeFilters = new Set(input.edgeFilters ?? [])
  const collapsedHiddenNodeIds = collapsedHiddenNodeIdsForGraph(input.graph, input.layoutByNodeId ?? {}, input.selectedNodeId)
  const hiddenNodeIds = new Set<string>()
  const nodes = input.graph.nodes.filter((node) => {
    if (hiddenKinds.has(node.kind)) {
      hiddenNodeIds.add(node.id)
      return false
    }
    if (collapsedHiddenNodeIds.has(node.id)) {
      hiddenNodeIds.add(node.id)
      return false
    }
    if (shouldHideDefaultWorkOverlayNode(node, input, needle, lodTier)) {
      hiddenNodeIds.add(node.id)
      return false
    }
    if (allowedNodeIds && !allowedNodeIds.has(node.id) && !traceNodeIdsToKeep.has(node.id)) {
      hiddenNodeIds.add(node.id)
      return false
    }
    if (input.mode === 'issues' && issueNodeIds && !issueNodeIds.has(node.id)) {
      hiddenNodeIds.add(node.id)
      return false
    }
    if (shouldFoldTraceOnlyNode(node, traceNodeIdsToKeep, input.selectedNodeId)) {
      hiddenNodeIds.add(node.id)
      return false
    }
    if (input.kindFilter !== 'all' && node.kind !== input.kindFilter) return false
    if (!contentCanvasNodeMatchesStatusFilter(node, input.statusFilter ?? 'all')) return false
    if (!needle) return true
    return contentCanvasNodeMatchesQuery(node, needle)
  })
  const visibleIds = new Set(nodes.map((node) => node.id))
  const hiddenEdgeIds = new Set<string>()
  const edgeLabelIds = contentCanvasEdgeLabelIds(input.graph, input.selectedNodeId, input.impactByNodeId, density)
  const filteredEdges: ContentCanvasEdge[] = []
  const candidateEdges = input.graph.edges.filter((edge) => {
    const filtered = contentCanvasEdgeMatchesFilter(edge, edgeFilters)
    if (filtered) filteredEdges.push(edge)
    const visible = visibleIds.has(edge.source)
      && visibleIds.has(edge.target)
      && contentCanvasModeAllowsEdge(edge, input.mode, density)
      && !filtered
    if (!visible) hiddenEdgeIds.add(edge.id)
    return visible
  })
  const edgeBudget = applyContentCanvasEdgeBudget(candidateEdges, input, density)
  for (const edgeId of edgeBudget.hiddenEdgeIds) hiddenEdgeIds.add(edgeId)
  return {
    graph: { nodes, edges: edgeBudget.edges },
    density,
    lodTier,
    hiddenNodeIds,
    hiddenEdgeIds,
    backgroundEdges: edgeBudget.hiddenEdges,
    edgeLabelIds,
    collapsedSummariesByNodeId: contentCanvasCollapsedSummaries(input.graph, visibleIds, hiddenNodeIds),
    edgeSummariesByNodeId: contentCanvasHiddenEdgeSummaries([...edgeBudget.hiddenEdges, ...filteredEdges], visibleIds),
  }
}

function shouldHideDefaultWorkOverlayNode(
  node: ContentCanvasNode,
  input: ContentCanvasViewPlanInput,
  needle: string,
  lodTier: ContentCanvasLodTier,
): boolean {
  if (node.kind !== 'work_item' && node.kind !== 'actor') return false
  if (input.mode === 'issues') return false
  if (lodTier === 'focused') return false
  if (input.selectedNodeId === node.id) return false
  if (input.impactByNodeId[node.id]) return false
  if (needle) return false
  return (input.statusFilter ?? 'all') === 'all'
}

function applyContentCanvasEdgeBudget(
  edges: ContentCanvasEdge[],
  input: ContentCanvasViewPlanInput,
  density: ContentCanvasDensity,
): { edges: ContentCanvasEdge[]; hiddenEdges: ContentCanvasEdge[]; hiddenEdgeIds: Set<string> } {
  const limit = input.edgeRenderLimit ?? defaultEdgeRenderLimitForDensity(density)
  if (edges.length <= limit) return { edges, hiddenEdges: [], hiddenEdgeIds: new Set() }
  const sorted = [...edges].sort((left, right) => edgeRenderRank(left, input) - edgeRenderRank(right, input))
  const kept = sorted.slice(0, limit)
  const keptIds = new Set(kept.map((edge) => edge.id))
  const hiddenEdges = edges.filter((edge) => !keptIds.has(edge.id))
  return {
    edges: edges.filter((edge) => keptIds.has(edge.id)),
    hiddenEdges,
    hiddenEdgeIds: new Set(hiddenEdges.map((edge) => edge.id)),
  }
}

function defaultEdgeRenderLimitForDensity(density: ContentCanvasDensity): number {
  if (density === 'trace') return 450
  if (density === 'workband') return 700
  return 320
}

function edgeRenderRank(edge: ContentCanvasEdge, input: ContentCanvasViewPlanInput): number {
  if (edge.source === input.selectedNodeId || edge.target === input.selectedNodeId) return 0
  if (input.impactByNodeId[edge.source] || input.impactByNodeId[edge.target]) return 1
  if (edge.state === 'stale' || edge.state === 'needs_candidate' || edge.state === 'missing') return 2
  if (edge.relation === 'actor_work_item') return 3
  if (edge.relation === 'work_item_target') return 3
  if (edge.kind === 'hierarchy') return 3
  if (edge.kind === 'sequence') return 4
  if (edge.relation === 'content_unit_candidate' || edge.relation === 'selection_candidate') return 5
  return 6
}

function contentCanvasEdgeMatchesFilter(edge: ContentCanvasEdge, filters: ReadonlySet<ContentCanvasEdgeFilter>): boolean {
  return filters.has(edge.kind) || (edge.relation ? filters.has(edge.relation) : false)
}

function contentCanvasHiddenEdgeSummaries(
  hiddenEdges: ContentCanvasEdge[],
  visibleIds: ReadonlySet<string>,
): Record<string, ContentCanvasHiddenEdgeSummary[]> {
  const countsByNodeId = new Map<string, Map<ContentCanvasHiddenEdgeSummary['relation'], number>>()
  for (const edge of hiddenEdges) {
    const anchorId = visibleIds.has(edge.source) ? edge.source : visibleIds.has(edge.target) ? edge.target : undefined
    if (!anchorId) continue
    const relation = edge.relation ?? edge.kind
    const counts = countsByNodeId.get(anchorId) ?? new Map<ContentCanvasHiddenEdgeSummary['relation'], number>()
    counts.set(relation, (counts.get(relation) ?? 0) + 1)
    countsByNodeId.set(anchorId, counts)
  }
  return Object.fromEntries(
    [...countsByNodeId.entries()].map(([nodeId, counts]) => [
      nodeId,
      [...counts.entries()]
        .sort(([left], [right]) => hiddenEdgeRelationRank(left) - hiddenEdgeRelationRank(right))
        .map(([relation, count]) => ({
          relation,
          count,
          label: hiddenEdgeRelationLabel(relation),
        })),
    ]),
  )
}

function hiddenEdgeRelationRank(relation: ContentCanvasHiddenEdgeSummary['relation']): number {
  if (relation === 'work_item_target') return 0
  if (relation === 'actor_work_item') return 1
  if (relation === 'hierarchy') return 2
  if (relation === 'sequence') return 3
  if (relation === 'content_unit_asset') return 4
  if (relation === 'content_unit_candidate') return 5
  if (relation === 'asset_downstream') return 6
  if (relation === 'setting_state_reference') return 7
  if (relation === 'expression_unit_shot' || relation === 'expression_unit_storyboard' || relation === 'expression_unit_content_unit') return 8
  if (relation === 'audio_cue_shot' || relation === 'audio_cue_storyboard' || relation === 'audio_cue_asset') return 9
  return 11
}

function hiddenEdgeRelationLabel(relation: ContentCanvasHiddenEdgeSummary['relation']): string {
  if (relation === 'work_item_target') return '处理边'
  if (relation === 'actor_work_item') return '处理者边'
  if (relation === 'hierarchy') return '结构边'
  if (relation === 'sequence') return '顺序边'
  if (relation === 'content_unit_asset') return '素材边'
  if (relation === 'content_unit_candidate') return '候选边'
  if (relation === 'asset_downstream') return '资产影响边'
  if (relation === 'setting_state_reference') return '设定状态边'
  if (relation === 'expression_unit_shot' || relation === 'expression_unit_storyboard' || relation === 'expression_unit_content_unit') return '表达约束边'
  if (relation === 'audio_cue_shot' || relation === 'audio_cue_storyboard') return '声音约束边'
  if (relation === 'audio_cue_asset') return '声音素材边'
  if (relation === 'content_unit_keyframe') return '关键帧边'
  if (relation === 'content_unit_storyboard') return '分镜边'
  if (relation === 'candidate_resource') return '资源边'
  if (relation === 'selection_candidate') return '选择边'
  return '关系边'
}

function collapsedHiddenNodeIdsForGraph(
  graph: ContentCanvasGraph,
  layoutByNodeId: Record<string, Pick<ContentCanvasNodeLayout, 'collapsed'>>,
  selectedNodeId: string | null,
): Set<string> {
  const collapsedNodeIds = Object.entries(layoutByNodeId)
    .filter(([, layout]) => layout.collapsed)
    .map(([nodeId]) => nodeId)
  const hidden = new Set<string>()
  for (const nodeId of collapsedNodeIds) {
    for (const relatedId of collapsedDescendantNodeIds(graph, nodeId)) {
      if (relatedId !== selectedNodeId) hidden.add(relatedId)
    }
  }
  return hidden
}

function collapsedDescendantNodeIds(graph: ContentCanvasGraph, nodeId: string): Set<string> {
  const hidden = new Set<string>()
  const queue = [nodeId]
  const collapseRelations = new Set<ContentCanvasEdge['relation'] | undefined>([
    undefined,
    'content_unit_candidate',
    'asset_downstream',
    'setting_state_reference',
    'expression_unit_shot',
    'expression_unit_storyboard',
    'expression_unit_content_unit',
    'audio_cue_shot',
    'audio_cue_storyboard',
    'audio_cue_asset',
    'candidate_resource',
    'selection_candidate',
    'content_unit_shot',
    'content_unit_keyframe',
    'content_unit_storyboard',
  ])
  while (queue.length) {
    const current = queue.shift()
    if (!current) continue
    for (const edge of outgoingEdgesForNode(graph, current)) {
      if (edge.kind !== 'hierarchy' && !collapseRelations.has(edge.relation)) continue
      if (hidden.has(edge.target) || edge.target === nodeId) continue
      hidden.add(edge.target)
      queue.push(edge.target)
    }
  }
  return hidden
}

function contentCanvasCollapsedSummaries(
  graph: ContentCanvasGraph,
  visibleIds: ReadonlySet<string>,
  hiddenNodeIds: ReadonlySet<string>,
): Record<string, ContentCanvasCollapsedRelationSummary[]> {
  const countsByAnchor = new Map<string, Map<ContentCanvasNodeKind, number>>()
  for (const hiddenNodeId of hiddenNodeIds) {
    const hiddenNode = nodeById(graph, hiddenNodeId)
    if (!hiddenNode || !isAggregatedHiddenKind(hiddenNode.kind)) continue
    const anchorId = anchorVisibleNodeForHiddenNode(graph, visibleIds, hiddenNodeId, 3)
    if (!anchorId) continue
    const counts = countsByAnchor.get(anchorId) ?? new Map<ContentCanvasNodeKind, number>()
    counts.set(hiddenNode.kind, (counts.get(hiddenNode.kind) ?? 0) + 1)
    countsByAnchor.set(anchorId, counts)
  }
  return Object.fromEntries(
    [...countsByAnchor.entries()].map(([nodeId, counts]) => [
      nodeId,
      [...counts.entries()]
        .sort(([left], [right]) => collapsedKindRank(left) - collapsedKindRank(right))
        .map(([kind, count]) => ({
          kind,
          count,
          label: collapsedKindLabel(kind),
        })),
    ]),
  )
}

function anchorVisibleNodeForHiddenNode(
  graph: ContentCanvasGraph,
  visibleIds: ReadonlySet<string>,
  hiddenNodeId: string,
  maxDepth: number,
): string | undefined {
  const visited = new Set<string>([hiddenNodeId])
  let frontier = new Set<string>([hiddenNodeId])
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = new Set<string>()
    for (const current of frontier) {
      for (const edge of relatedEdgesForNode(graph, current)) {
        const relatedId = edge.source === current ? edge.target : edge.source
        if (visibleIds.has(relatedId)) return relatedId
        if (!visited.has(relatedId)) {
          visited.add(relatedId)
          next.add(relatedId)
        }
      }
    }
    frontier = next
    if (!frontier.size) break
  }
  return undefined
}

function isAggregatedHiddenKind(kind: ContentCanvasNodeKind): boolean {
  return kind === 'content_unit'
    || kind === 'candidate'
    || kind === 'selection'
    || kind === 'resource'
    || kind === 'keyframe'
    || kind === 'storyboard'
    || kind === 'expression_unit'
    || kind === 'audio_cue'
    || kind === 'state'
    || kind === 'work_item'
}

function collapsedKindRank(kind: ContentCanvasNodeKind): number {
  if (kind === 'work_item') return 0
  if (kind === 'content_unit') return 1
  if (kind === 'keyframe') return 2
  if (kind === 'storyboard') return 3
  if (kind === 'expression_unit') return 4
  if (kind === 'audio_cue') return 5
  if (kind === 'state') return 6
  if (kind === 'candidate') return 7
  if (kind === 'selection') return 8
  if (kind === 'resource') return 9
  return 9
}

function collapsedKindLabel(kind: ContentCanvasNodeKind): string {
  if (kind === 'work_item') return '工作项'
  if (kind === 'content_unit') return '制作项'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'storyboard') return '分镜'
  if (kind === 'expression_unit') return '表达'
  if (kind === 'audio_cue') return '声音'
  if (kind === 'state') return '状态'
  if (kind === 'candidate') return '候选'
  if (kind === 'selection') return '选择'
  if (kind === 'resource') return '资源'
  return '关系'
}

function issueNodeIdsForFilters(
  graph: ContentCanvasGraph,
  actor: ContentCanvasIssueActorFilter,
  severity: ContentCanvasIssueSeverityFilter,
  targetKind: ContentCanvasIssueTargetKindFilter,
): Set<string> | undefined {
  if (actor === 'all' && severity === 'all' && targetKind === 'all') return undefined
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const matchingWorkItems = new Set(
    graph.nodes
      .filter((node) => node.kind === 'work_item' && workItemMatchesFilters(node, actor, severity, targetKind, graph, nodeById))
      .map((node) => node.id),
  )
  const ids = new Set(matchingWorkItems)
  for (const edge of graph.edges) {
    if (edge.relation === 'work_item_target' && matchingWorkItems.has(edge.source)) ids.add(edge.target)
    if (edge.relation === 'actor_work_item' && matchingWorkItems.has(edge.target)) ids.add(edge.source)
  }
  return ids
}

function workItemMatchesFilters(
  node: ContentCanvasNode,
  actor: ContentCanvasIssueActorFilter,
  severity: ContentCanvasIssueSeverityFilter,
  targetKind: ContentCanvasIssueTargetKindFilter,
  graph: ContentCanvasGraph,
  nodeById: Map<string, ContentCanvasNode>,
): boolean {
  const record = node.record
  const itemActor = typeof record.recommendedActor === 'string' ? record.recommendedActor : undefined
  const itemSeverity = typeof record.severity === 'string' ? record.severity : undefined
  return (actor === 'all' || itemActor === actor)
    && (severity === 'all' || itemSeverity === severity)
    && workItemMatchesTargetKind(node, targetKind, graph, nodeById)
}

function workItemMatchesTargetKind(
  node: ContentCanvasNode,
  targetKind: ContentCanvasIssueTargetKindFilter,
  graph: ContentCanvasGraph,
  nodeById: Map<string, ContentCanvasNode>,
): boolean {
  if (targetKind === 'all') return true
  if (node.record.targetKind === targetKind) return true
  return graph.edges.some((edge) => {
    if (edge.relation !== 'work_item_target' || edge.source !== node.id) return false
    return nodeById.get(edge.target)?.kind === targetKind
  })
}

function contentCanvasNodeMatchesStatusFilter(
  node: ContentCanvasNode,
  statusFilter: ContentCanvasStatusFilter,
): boolean {
  if (statusFilter === 'all') return true
  if (statusFilter === 'selected') {
    return node.kind === 'selection'
      || node.record.selected === true
      || stringRecordValue(node.record.status) === 'selected'
      || stringRecordValue(node.record.review_status) === 'selected'
  }
  if (statusFilter === 'ready') {
    return node.status === 'ready'
      || stringRecordValue(node.record.status) === 'ready'
      || stringRecordValue(node.record.review_status) === 'approved'
  }
  if (statusFilter === 'missing') {
    return node.status === 'missing'
      || recordContainsAny(node.record, ['status', 'kind'], ['missing', 'blocked'])
  }
  if (statusFilter === 'stale') {
    return recordContainsAny(node.record, ['status', 'review_status', 'kind'], ['stale', 'stale_selection'])
  }
  return recordContainsAny(node.record, ['status', 'review_status', 'kind'], ['needs_candidate', 'missing_candidate'])
    || (node.kind === 'content_unit' && node.candidates.length === 0)
}

function recordContainsAny(
  record: Record<string, unknown>,
  keys: string[],
  needles: string[],
): boolean {
  return keys.some((key) => {
    const value = stringRecordValue(record[key])
    return value ? needles.some((needle) => value.includes(needle)) : false
  })
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined
}

export function contentCanvasDensityFor(input: Pick<ContentCanvasViewPlanInput, 'graph' | 'mode' | 'selectedNodeId' | 'largeGraphNodeThreshold'>): ContentCanvasDensity {
  if (input.mode === 'issues') return 'trace'
  if (input.selectedNodeId) return input.graph.nodes.length >= (input.largeGraphNodeThreshold ?? 300) ? 'trace' : 'workband'
  if (input.mode === 'structure') return 'overview'
  return input.graph.nodes.length >= (input.largeGraphNodeThreshold ?? 300) ? 'overview' : 'workband'
}

export function contentCanvasLodTierFor(input: Pick<ContentCanvasViewPlanInput, 'graph' | 'largeGraphNodeThreshold' | 'clusterGraphNodeThreshold' | 'focusedGraphNodeThreshold'>): ContentCanvasLodTier {
  const nodeCount = input.graph.nodes.length
  if (nodeCount >= (input.focusedGraphNodeThreshold ?? 5000)) return 'focused'
  if (nodeCount >= (input.clusterGraphNodeThreshold ?? 2000)) return 'clustered'
  if (nodeCount >= (input.largeGraphNodeThreshold ?? 300)) return 'folded'
  return 'normal'
}

export function contentCanvasModeNodeIds(
  graph: ContentCanvasGraph,
  mode: ContentCanvasViewMode,
  selectedNodeId: string | null,
  impactByNodeId: Record<string, ContentCanvasImpactKind>,
  density: ContentCanvasDensity,
  lodTier: ContentCanvasLodTier = 'normal',
): Set<string> | undefined {
  if (mode === 'structure') {
    const ids = new Set(graph.nodes.filter((node) => STRUCTURE_KINDS.has(node.kind)).map((node) => node.id))
    if (selectedNodeId) {
      ids.add(selectedNodeId)
      addNeighborhood(ids, graph, selectedNodeId, 1, WORKBAND_KINDS)
    }
    return ids
  }
  if (mode === 'issues') {
    return issueNodeIdsForGraph(graph, impactByNodeId)
  }
  if (!selectedNodeId && lodTier === 'focused') {
    return issueNodeIdsForGraph(graph, impactByNodeId)
      ?? new Set(graph.nodes.filter((node) => STRUCTURE_KINDS.has(node.kind)).map((node) => node.id))
  }
  if (!selectedNodeId && lodTier === 'clustered') {
    return new Set(graph.nodes.filter((node) => STRUCTURE_KINDS.has(node.kind) || node.kind === 'asset' || node.kind === 'setting' || node.kind === 'state').map((node) => node.id))
  }
  if (density !== 'trace' || !selectedNodeId) return undefined
  const ids = new Set<string>([selectedNodeId])
  addNeighborhood(ids, graph, selectedNodeId, lodTier === 'focused' ? 1 : 2, TRACE_KINDS)
  return ids
}

function issueNodeIdsForGraph(
  graph: ContentCanvasGraph,
  impactByNodeId: Record<string, ContentCanvasImpactKind>,
): Set<string> | undefined {
  const issueNodeIds = new Set(
    graph.nodes
      .filter((node) => node.kind === 'work_item' || node.kind === 'actor' || node.status === 'missing' || Boolean(impactByNodeId[node.id]))
      .map((node) => node.id),
  )
  for (const edge of graph.edges) {
    if (edge.state === 'stale' || edge.state === 'needs_candidate' || edge.state === 'missing') {
      issueNodeIds.add(edge.source)
      issueNodeIds.add(edge.target)
      continue
    }
    if (!issueNodeIds.has(edge.source) && !issueNodeIds.has(edge.target)) continue
    issueNodeIds.add(edge.source)
    issueNodeIds.add(edge.target)
  }
  return issueNodeIds.size > 0 ? issueNodeIds : undefined
}

export function contentCanvasModeAllowsEdge(
  edge: ContentCanvasEdge,
  mode: ContentCanvasViewMode,
  density: ContentCanvasDensity = 'workband',
): boolean {
  if (mode === 'structure') return edge.kind === 'hierarchy' || edge.kind === 'sequence'
  if (mode === 'issues') return edge.kind === 'reference'
  if (density === 'overview') return edge.kind === 'hierarchy' || edge.kind === 'sequence' || edge.relation !== 'content_unit_candidate'
  return true
}

function addNeighborhood(
  ids: Set<string>,
  graph: ContentCanvasGraph,
  centerNodeId: string,
  radius: number,
  allowedKinds: ReadonlySet<ContentCanvasNodeKind>,
) {
  let frontier = new Set([centerNodeId])
  for (let depth = 0; depth < radius; depth += 1) {
    const next = new Set<string>()
    for (const nodeId of frontier) {
      for (const edge of relatedEdgesForNode(graph, nodeId)) {
        const relatedId = edge.source === nodeId ? edge.target : edge.source
        const related = nodeById(graph, relatedId)
        if (!related || (!allowedKinds.has(related.kind) && depth > 0)) continue
        ids.add(relatedId)
        next.add(relatedId)
      }
    }
    frontier = next
    if (!frontier.size) break
  }
}

function shouldFoldTraceOnlyNode(
  node: ContentCanvasNode,
  traceNodeIdsToKeep: ReadonlySet<string>,
  selectedNodeId: string | null,
): boolean {
  return (node.kind === 'candidate' || node.kind === 'selection' || node.kind === 'resource')
    && node.id !== selectedNodeId
    && !traceNodeIdsToKeep.has(node.id)
}

function traceNodeIdsAllowedBySelection(
  graph: ContentCanvasGraph,
  mode: ContentCanvasViewMode,
  selectedNodeId: string | null,
  needle: string,
  impactByNodeId: Record<string, ContentCanvasImpactKind>,
): Set<string> {
  const keep = new Set<string>()
  if (mode === 'structure') return keep
  const selectedNode = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) : undefined
  if (selectedNode && (selectedNode.kind === 'candidate' || selectedNode.kind === 'selection' || selectedNode.kind === 'resource')) {
    keep.add(selectedNode.id)
    addTraceChain(keep, graph, selectedNode.id)
  }
  if (selectedNode?.kind === 'asset') {
    for (const edge of relatedEdgesForNode(graph, selectedNode.id)) {
      if (edge.relation === 'content_unit_asset' && edge.target === selectedNode.id) {
        keep.add(edge.source)
      }
      if (edge.relation === 'asset_downstream' && edge.source === selectedNode.id) {
        keep.add(edge.target)
      }
    }
  }
  for (const node of graph.nodes) {
    if (node.kind !== 'candidate' && node.kind !== 'selection' && node.kind !== 'resource') continue
    if (impactByNodeId[node.id] || (needle && contentCanvasNodeMatchesQuery(node, needle))) {
      keep.add(node.id)
      addTraceChain(keep, graph, node.id)
    }
  }
  return keep
}

function addTraceChain(ids: Set<string>, graph: ContentCanvasGraph, nodeId: string) {
  for (const edge of relatedEdgesForNode(graph, nodeId)) {
    if (edge.source === nodeId && edge.relation === 'candidate_resource') {
      ids.add(edge.target)
    }
    if (edge.target === nodeId && edge.relation === 'candidate_resource') {
      ids.add(edge.source)
    }
    if (edge.source === nodeId && edge.relation === 'selection_candidate') {
      ids.add(edge.target)
    }
  }
}

function relatedEdgesForNode(graph: ContentCanvasGraph, nodeId: string): ContentCanvasEdge[] {
  const indexes = graph.indexes
  if (!indexes) return graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId)
  const edgeIds = new Set([
    ...(indexes.upstreamEdgeIdsByNodeId[nodeId] ?? []),
    ...(indexes.downstreamEdgeIdsByNodeId[nodeId] ?? []),
  ])
  return [...edgeIds].flatMap((edgeId) => {
    const edge = indexes.edgeById[edgeId]
    return edge ? [edge] : []
  })
}

function outgoingEdgesForNode(graph: ContentCanvasGraph, nodeId: string): ContentCanvasEdge[] {
  const indexes = graph.indexes
  if (!indexes) return graph.edges.filter((edge) => edge.source === nodeId)
  return (indexes.downstreamEdgeIdsByNodeId[nodeId] ?? []).flatMap((edgeId) => {
    const edge = indexes.edgeById[edgeId]
    return edge ? [edge] : []
  })
}

function nodeById(graph: ContentCanvasGraph, nodeId: string): ContentCanvasNode | undefined {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}

function contentCanvasEdgeLabelIds(
  graph: ContentCanvasGraph,
  selectedNodeId: string | null,
  impactByNodeId: Record<string, ContentCanvasImpactKind>,
  density: ContentCanvasDensity,
): Set<string> {
  if (density !== 'trace' && !selectedNodeId) return new Set()
  return new Set(
    graph.edges
      .filter((edge) => (
        edge.source === selectedNodeId
        || edge.target === selectedNodeId
        || Boolean(impactByNodeId[edge.source])
        || Boolean(impactByNodeId[edge.target])
      ))
      .map((edge) => edge.id),
  )
}

function contentCanvasNodeMatchesQuery(node: ContentCanvasNode, needle: string): boolean {
  return [node.title, node.subtitle, node.summary, node.sourcePath, node.entityKey]
    .some((value) => value.toLowerCase().includes(needle))
}
