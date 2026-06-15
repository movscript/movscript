import type { ContentCanvasEdge, ContentCanvasGraph } from '../domain/contentCanvasTypes'
import type { ContentCanvasNodeLayout } from './contentCanvasLayout'

export type ContentCanvasGroupFrame = {
  id: string
  title: string
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  nodeIds: string[]
}

export function buildContentCanvasGroupFrames(
  graph: Pick<ContentCanvasGraph, 'nodes' | 'edges'>,
  layoutByNodeId: Record<string, ContentCanvasNodeLayout>,
): ContentCanvasGroupFrame[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const visibleIds = new Set(nodesById.keys())
  const edgesByNodeId = new Map<string, ContentCanvasEdge[]>()
  for (const edge of graph.edges) {
    edgesByNodeId.set(edge.source, [...(edgesByNodeId.get(edge.source) ?? []), edge])
    edgesByNodeId.set(edge.target, [...(edgesByNodeId.get(edge.target) ?? []), edge])
  }
  return graph.nodes
    .filter((node) => node.kind === 'content_unit')
    .flatMap((contentUnit) => {
      const relatedEdges = edgesByNodeId.get(contentUnit.id) ?? []
      const candidateIds = relatedEdges
        .filter((edge) => edge.source === contentUnit.id && edge.relation === 'content_unit_candidate' && visibleIds.has(edge.target))
        .map((edge) => edge.target)
      if (!candidateIds.length) return []
      const nodeIds = new Set<string>([contentUnit.id, ...candidateIds])
      for (const candidateId of candidateIds) {
        for (const edge of edgesByNodeId.get(candidateId) ?? []) {
          if (edge.relation !== 'candidate_resource' && edge.relation !== 'selection_candidate') continue
          const relatedId = edge.source === candidateId ? edge.target : edge.source
          if (visibleIds.has(relatedId)) nodeIds.add(relatedId)
        }
      }
      const rect = contentCanvasRectForNodeIds([...nodeIds], layoutByNodeId)
      if (!rect) return []
      return [{
        id: `auto-group:${contentUnit.id}`,
        title: `${contentUnit.title} · 候选组`,
        rect,
        nodeIds: [...nodeIds],
      }]
    })
}

function contentCanvasRectForNodeIds(
  nodeIds: string[],
  layoutByNodeId: Record<string, ContentCanvasNodeLayout>,
): ContentCanvasGroupFrame['rect'] | undefined {
  const layouts = nodeIds.map((nodeId) => layoutByNodeId[nodeId]).filter((layout): layout is ContentCanvasNodeLayout => Boolean(layout))
  if (layouts.length < 2) return undefined
  const padding = 42
  const minX = Math.min(...layouts.map((layout) => layout.x))
  const minY = Math.min(...layouts.map((layout) => layout.y))
  const maxX = Math.max(...layouts.map((layout) => layout.x + layout.width))
  const maxY = Math.max(...layouts.map((layout) => layout.y + layout.height))
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
