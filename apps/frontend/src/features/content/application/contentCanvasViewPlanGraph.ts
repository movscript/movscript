import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode } from '../domain/contentCanvasTypes'

export function relatedEdgesForNode(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): ContentCanvasEdge[] {
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

export function outgoingEdgesForNode(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): ContentCanvasEdge[] {
  const indexes = graph.indexes
  if (!indexes) return graph.edges.filter((edge) => edge.source === nodeId)
  return (indexes.downstreamEdgeIdsByNodeId[nodeId] ?? []).flatMap((edgeId) => {
    const edge = indexes.edgeById[edgeId]
    return edge ? [edge] : []
  })
}

export function nodeById(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): ContentCanvasNode | undefined {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}
