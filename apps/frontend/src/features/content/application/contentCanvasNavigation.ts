import type { ContentCanvasWorkspaceSnapshot, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export interface ContentCanvasNavigatorItem {
  nodeId: string
  title: string
  kind: ContentCanvasNodeKind
  status: ContentCanvasNode['status']
  depth: number
  childCount: number
  workItemCount: number
}

const NAVIGATOR_KINDS = new Set<ContentCanvasNodeKind>([
  'project',
  'production',
  'segment',
  'scene_moment',
])

export function buildContentCanvasNavigatorItems(graph: ContentCanvasWorkspaceSnapshot): ContentCanvasNavigatorItem[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const structureNodeIds = graph.nodes.filter((node) => NAVIGATOR_KINDS.has(node.kind)).map((node) => node.id)
  const structureNodeIdSet = new Set(structureNodeIds)
  const childrenByNodeId = new Map<string, string[]>()
  const parentByNodeId = new Map<string, string>()
  const workItemCountByTargetId = new Map<string, number>()

  for (const edge of graph.edges) {
    if (edge.kind === 'hierarchy' && structureNodeIdSet.has(edge.source) && structureNodeIdSet.has(edge.target)) {
      const children = childrenByNodeId.get(edge.source) ?? []
      children.push(edge.target)
      childrenByNodeId.set(edge.source, children)
      parentByNodeId.set(edge.target, edge.source)
    }
    if (edge.relation === 'work_item_target') {
      workItemCountByTargetId.set(edge.target, (workItemCountByTargetId.get(edge.target) ?? 0) + 1)
    }
  }

  const visited = new Set<string>()
  const roots = structureNodeIds.filter((nodeId) => !parentByNodeId.has(nodeId))
  const ordered: ContentCanvasNavigatorItem[] = []
  for (const rootId of roots) appendNavigatorNode(rootId, 0)
  for (const nodeId of structureNodeIds) appendNavigatorNode(nodeId, 0)
  return ordered

  function appendNavigatorNode(nodeId: string, depth: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodeById.get(nodeId)
    if (!node) return
    const childIds = childrenByNodeId.get(nodeId) ?? []
    ordered.push({
      nodeId,
      title: node.title,
      kind: node.kind,
      status: node.status,
      depth,
      childCount: childIds.length,
      workItemCount: workItemCountByTargetId.get(nodeId) ?? 0,
    })
    for (const childId of childIds) appendNavigatorNode(childId, depth + 1)
  }
}
