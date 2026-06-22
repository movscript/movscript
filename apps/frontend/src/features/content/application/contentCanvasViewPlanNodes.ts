import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'
import { nodeById, outgoingEdgesForNode, relatedEdgesForNode } from './contentCanvasViewPlanGraph'
import { issueNodeIdsForGraph } from './contentCanvasViewPlanIssues'
import type {
  ContentCanvasDensity,
  ContentCanvasImpactKind,
  ContentCanvasLodTier,
  ContentCanvasStatusFilter,
  ContentCanvasViewMode,
  ContentCanvasViewPlanInput,
} from './contentCanvasViewPlanTypes'

const STRUCTURE_KINDS = new Set<ContentCanvasNodeKind>([
  'project',
  'production',
  'segment',
  'scene_moment',
  'group',
])

const WORKBAND_KINDS = new Set<ContentCanvasNodeKind>([
  'keyframe',
  'storyboard',
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

export function shouldHideDefaultWorkOverlayNode(
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

export function collapsedHiddenNodeIdsForGraph(
  graph: ContentCanvasWorkspaceSnapshot,
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

function collapsedDescendantNodeIds(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): Set<string> {
  const hidden = new Set<string>()
  const queue = [nodeId]
  const collapseRelations = new Set<ContentCanvasEdge['relation'] | undefined>([
    undefined,
    'content_unit_candidate',
    'asset_downstream',
    'setting_state_reference',
    'expression_unit_storyboard',
    'expression_unit_content_unit',
    'audio_cue_storyboard',
    'audio_cue_asset',
    'candidate_resource',
    'selection_candidate',
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

export function contentCanvasNodeMatchesStatusFilter(
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
  graph: ContentCanvasWorkspaceSnapshot,
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
      addNeighborhood(ids, graph, selectedNodeId, 1, WORKBAND_KINDS, { strictAllowedKinds: true })
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
  graph: ContentCanvasWorkspaceSnapshot,
  centerNodeId: string,
  radius: number,
  allowedKinds: ReadonlySet<ContentCanvasNodeKind>,
  options: { strictAllowedKinds?: boolean } = {},
) {
  let frontier = new Set([centerNodeId])
  for (let depth = 0; depth < radius; depth += 1) {
    const next = new Set<string>()
    for (const nodeId of frontier) {
      for (const edge of relatedEdgesForNode(graph, nodeId)) {
        const relatedId = edge.source === nodeId ? edge.target : edge.source
        const related = nodeById(graph, relatedId)
        if (!related || (!allowedKinds.has(related.kind) && (options.strictAllowedKinds || depth > 0))) continue
        ids.add(relatedId)
        next.add(relatedId)
      }
    }
    frontier = next
    if (!frontier.size) break
  }
}

export function shouldFoldTraceOnlyNode(
  node: ContentCanvasNode,
  traceNodeIdsToKeep: ReadonlySet<string>,
  selectedNodeId: string | null,
): boolean {
  return (node.kind === 'candidate' || node.kind === 'selection' || node.kind === 'resource')
    && node.id !== selectedNodeId
    && !traceNodeIdsToKeep.has(node.id)
}

export function traceNodeIdsAllowedBySelection(
  graph: ContentCanvasWorkspaceSnapshot,
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

function addTraceChain(ids: Set<string>, graph: ContentCanvasWorkspaceSnapshot, nodeId: string) {
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

export function contentCanvasNodeMatchesQuery(node: ContentCanvasNode, needle: string): boolean {
  return [node.title, node.subtitle, node.summary, node.sourcePath, node.entityKey]
    .some((value) => value.toLowerCase().includes(needle))
}
