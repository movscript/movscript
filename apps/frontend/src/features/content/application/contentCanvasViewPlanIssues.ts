import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode } from '../domain/contentCanvasTypes'
import type {
  ContentCanvasImpactKind,
  ContentCanvasIssueActorFilter,
  ContentCanvasIssueSeverityFilter,
  ContentCanvasIssueTargetKindFilter,
} from './contentCanvasViewPlanTypes'

export function issueNodeIdsForFilters(
  graph: ContentCanvasWorkspaceSnapshot,
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

export function issueNodeIdsForGraph(
  graph: ContentCanvasWorkspaceSnapshot,
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

function workItemMatchesFilters(
  node: ContentCanvasNode,
  actor: ContentCanvasIssueActorFilter,
  severity: ContentCanvasIssueSeverityFilter,
  targetKind: ContentCanvasIssueTargetKindFilter,
  graph: ContentCanvasWorkspaceSnapshot,
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
  graph: ContentCanvasWorkspaceSnapshot,
  nodeById: Map<string, ContentCanvasNode>,
): boolean {
  if (targetKind === 'all') return true
  if (node.record.targetKind === targetKind) return true
  return graph.edges.some((edge: ContentCanvasEdge) => {
    if (edge.relation !== 'work_item_target' || edge.source !== node.id) return false
    return nodeById.get(edge.target)?.kind === targetKind
  })
}
