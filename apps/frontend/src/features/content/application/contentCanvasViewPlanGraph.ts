import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode } from '../domain/contentCanvasTypes'

export function relatedEdgesForNode(graph: ContentCanvasGraph, nodeId: string): ContentCanvasEdge[] {
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

export function outgoingEdgesForNode(graph: ContentCanvasGraph, nodeId: string): ContentCanvasEdge[] {
  const indexes = graph.indexes
  if (!indexes) return graph.edges.filter((edge) => edge.source === nodeId)
  return (indexes.downstreamEdgeIdsByNodeId[nodeId] ?? []).flatMap((edgeId) => {
    const edge = indexes.edgeById[edgeId]
    return edge ? [edge] : []
  })
}

export function nodeById(graph: ContentCanvasGraph, nodeId: string): ContentCanvasNode | undefined {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}
