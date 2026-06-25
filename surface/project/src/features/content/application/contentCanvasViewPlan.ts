import type { ContentCanvasEdge } from '../domain/contentCanvasTypes'
import {
  contentCanvasCollapsedSummaries,
  contentCanvasHiddenEdgeSummaries,
} from './contentCanvasViewSummaries'
import {
  issueNodeIdsForFilters,
} from './contentCanvasViewPlanIssues'
import {
  applyContentCanvasEdgeBudget,
  contentCanvasEdgeLabelIds,
  contentCanvasEdgeMatchesFilter,
  contentCanvasModeAllowsEdge,
} from './contentCanvasViewPlanEdges'
import {
  collapsedHiddenNodeIdsForGraph,
  contentCanvasDensityFor,
  contentCanvasLodTierFor,
  contentCanvasModeNodeIds,
  contentCanvasNodeMatchesQuery,
  contentCanvasNodeMatchesStatusFilter,
  shouldFoldTraceOnlyNode,
  shouldHideDefaultWorkOverlayNode,
  traceNodeIdsAllowedBySelection,
} from './contentCanvasViewPlanNodes'
import type {
  ContentCanvasViewPlan,
  ContentCanvasViewPlanInput,
} from './contentCanvasViewPlanTypes'

export type {
  ContentCanvasCollapsedRelationSummary,
  ContentCanvasHiddenEdgeSummary,
} from './contentCanvasViewSummaries'

export { contentCanvasModeAllowsEdge } from './contentCanvasViewPlanEdges'
export {
  contentCanvasDensityFor,
  contentCanvasLodTierFor,
  contentCanvasModeNodeIds,
} from './contentCanvasViewPlanNodes'

export type {
  ContentCanvasDensity,
  ContentCanvasEdgeFilter,
  ContentCanvasImpactKind,
  ContentCanvasIssueActorFilter,
  ContentCanvasIssueSeverityFilter,
  ContentCanvasIssueTargetKindFilter,
  ContentCanvasLodTier,
  ContentCanvasStatusFilter,
  ContentCanvasViewMode,
  ContentCanvasViewPlan,
  ContentCanvasViewPlanInput,
} from './contentCanvasViewPlanTypes'

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
    collapsedSummariesByNodeId: contentCanvasCollapsedSummaries(input.graph, visibleIds, hiddenNodeIds, {
      excludeKinds: input.mode === 'structure' ? STRUCTURE_COLLAPSED_SUMMARY_EXCLUDED_KINDS : undefined,
    }),
    edgeSummariesByNodeId: contentCanvasHiddenEdgeSummaries([...edgeBudget.hiddenEdges, ...filteredEdges], visibleIds),
  }
}

const STRUCTURE_COLLAPSED_SUMMARY_EXCLUDED_KINDS = new Set([
  'content_unit',
  'candidate',
  'selection',
  'resource',
] as const)
