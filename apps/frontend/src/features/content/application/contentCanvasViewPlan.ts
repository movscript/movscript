import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'
import {
  contentCanvasCollapsedSummaries,
  contentCanvasHiddenEdgeSummaries,
  type ContentCanvasCollapsedRelationSummary,
  type ContentCanvasHiddenEdgeSummary,
} from './contentCanvasViewSummaries'
import {
  issueNodeIdsForFilters,
  issueNodeIdsForGraph,
} from './contentCanvasViewPlanIssues'
import {
  applyContentCanvasEdgeBudget,
  contentCanvasEdgeLabelIds,
  contentCanvasEdgeMatchesFilter,
  contentCanvasModeAllowsEdge,
} from './contentCanvasViewPlanEdges'

export type {
  ContentCanvasCollapsedRelationSummary,
  ContentCanvasHiddenEdgeSummary,
} from './contentCanvasViewSummaries'

export { contentCanvasModeAllowsEdge } from './contentCanvasViewPlanEdges'

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

function contentCanvasNodeMatchesQuery(node: ContentCanvasNode, needle: string): boolean {
  return [node.title, node.subtitle, node.summary, node.sourcePath, node.entityKey]
    .some((value) => value.toLowerCase().includes(needle))
}
