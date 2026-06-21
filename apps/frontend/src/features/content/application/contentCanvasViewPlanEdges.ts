import type { ContentCanvasEdge, ContentCanvasGraph } from '../domain/contentCanvasTypes'
import type {
  ContentCanvasDensity,
  ContentCanvasEdgeFilter,
  ContentCanvasImpactKind,
  ContentCanvasViewMode,
} from './contentCanvasViewPlanTypes'

export function applyContentCanvasEdgeBudget(
  edges: ContentCanvasEdge[],
  input: {
    edgeRenderLimit?: number
    selectedNodeId: string | null
    impactByNodeId: Record<string, ContentCanvasImpactKind>
  },
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

function edgeRenderRank(
  edge: ContentCanvasEdge,
  input: {
    selectedNodeId: string | null
    impactByNodeId: Record<string, ContentCanvasImpactKind>
  },
): number {
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

export function contentCanvasEdgeMatchesFilter(edge: ContentCanvasEdge, filters: ReadonlySet<ContentCanvasEdgeFilter>): boolean {
  return filters.has(edge.kind) || (edge.relation ? filters.has(edge.relation) : false)
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

export function contentCanvasEdgeLabelIds(
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
