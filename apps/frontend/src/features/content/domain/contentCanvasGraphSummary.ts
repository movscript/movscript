import type {
  ContentCanvasEdge,
  ContentCanvasGraph,
  ContentCanvasGraphIndexes,
  ContentCanvasGraphSummary,
  ContentCanvasNode,
  ContentCanvasNodeKind,
} from './contentCanvasTypes'

export function withGraphIndexesAndSummary(graph: Pick<ContentCanvasGraph, 'nodes' | 'edges'>): ContentCanvasGraph {
  const indexes = buildContentCanvasGraphIndexes(graph.nodes, graph.edges)
  return {
    ...graph,
    indexes,
    summary: buildContentCanvasGraphSummary(graph.nodes, graph.edges, indexes),
  }
}

export function withStructureSummaryMetrics(nodes: ContentCanvasNode[], edges: ContentCanvasEdge[]): ContentCanvasNode[] {
  const structureKinds = new Set<ContentCanvasNodeKind>(['project', 'production', 'segment', 'scene_moment', 'expression_unit'])
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const childrenByNodeId = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.kind !== 'hierarchy') continue
    childrenByNodeId.set(edge.source, [...(childrenByNodeId.get(edge.source) ?? []), edge.target])
  }
  return nodes.map((node) => {
    if (!structureKinds.has(node.kind)) return node
    const scopeIds = contentCanvasHierarchyScope(node.id, childrenByNodeId)
    const scopedNodes = [...scopeIds].map((nodeId) => nodeById.get(nodeId)).filter((item): item is ContentCanvasNode => Boolean(item))
    const descendantNodes = scopedNodes.filter((item) => item.id !== node.id)
    const metrics = dedupeMetrics([
      ...node.metrics,
      structureCountMetric('关键帧', descendantNodes, 'keyframe'),
      structureCountMetric('分镜', descendantNodes, 'storyboard'),
      structureCountMetric('声音', descendantNodes, 'audio_cue'),
      structureCountMetric('表达', descendantNodes, 'expression_unit'),
      workItemMetric(scopeIds, edges),
      issueMetric('需候选', contentCanvasScopeNeedsCandidateCount(scopeIds, edges, nodeById)),
      issueMetric('需复核', contentCanvasScopeStaleCount(scopeIds, edges, nodeById)),
      issueMetric('缺失', contentCanvasScopeMissingCount(scopeIds, edges, scopedNodes, nodeById)),
    ])
    return metrics.length === node.metrics.length ? node : { ...node, metrics }
  })
}

function buildContentCanvasGraphIndexes(
  nodes: ContentCanvasNode[],
  edges: ContentCanvasEdge[],
): ContentCanvasGraphIndexes {
  const nodeById: ContentCanvasGraphIndexes['nodeById'] = {}
  const edgeById: ContentCanvasGraphIndexes['edgeById'] = {}
  const upstreamEdgeIdsByNodeId: ContentCanvasGraphIndexes['upstreamEdgeIdsByNodeId'] = {}
  const downstreamEdgeIdsByNodeId: ContentCanvasGraphIndexes['downstreamEdgeIdsByNodeId'] = {}
  const workItemIdsByTargetId: ContentCanvasGraphIndexes['workItemIdsByTargetId'] = {}
  for (const node of nodes) nodeById[node.id] = node
  for (const edge of edges) {
    edgeById[edge.id] = edge
    downstreamEdgeIdsByNodeId[edge.source] = [...(downstreamEdgeIdsByNodeId[edge.source] ?? []), edge.id]
    upstreamEdgeIdsByNodeId[edge.target] = [...(upstreamEdgeIdsByNodeId[edge.target] ?? []), edge.id]
    if (edge.relation === 'work_item_target') {
      workItemIdsByTargetId[edge.target] = [...(workItemIdsByTargetId[edge.target] ?? []), edge.source]
    }
  }
  return {
    nodeById,
    edgeById,
    upstreamEdgeIdsByNodeId,
    downstreamEdgeIdsByNodeId,
    workItemIdsByTargetId,
  }
}

function buildContentCanvasGraphSummary(
  nodes: ContentCanvasNode[],
  edges: ContentCanvasEdge[],
  indexes: ContentCanvasGraphIndexes,
): ContentCanvasGraphSummary {
  const nodeCountByKind = nodes.reduce<ContentCanvasGraphSummary['nodeCountByKind']>((counts, node) => {
    counts[node.kind] = (counts[node.kind] ?? 0) + 1
    return counts
  }, {})
  const actorWorkItemCount: ContentCanvasGraphSummary['actorWorkItemCount'] = {
    human: 0,
    agent: 0,
    workflow: 0,
  }
  for (const node of nodes) {
    if (node.kind !== 'work_item') continue
    const actor = stringValue(node.record.recommendedActor)
    if (actor === 'agent' || actor === 'workflow' || actor === 'human') {
      actorWorkItemCount[actor] += 1
    }
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeCountByKind,
    productionCount: nodeCountByKind.production ?? 0,
    staleCount: issueCountForGraph(nodes, edges, 'stale'),
    needsCandidateCount: issueCountForGraph(nodes, edges, 'needs_candidate'),
    missingCount: issueCountForGraph(nodes, edges, 'missing'),
    openWorkItemCount: Object.values(indexes.workItemIdsByTargetId).reduce((total, itemIds) => total + itemIds.length, 0),
    actorWorkItemCount,
  }
}

function issueCountForGraph(
  nodes: ContentCanvasNode[],
  edges: ContentCanvasEdge[],
  state: NonNullable<ContentCanvasEdge['state']>,
): number {
  const issueIds = new Set<string>()
  for (const edge of edges) {
    if (edge.state === state) issueIds.add(edge.id)
    if (edge.relation !== 'work_item_target') continue
    const workItem = nodes.find((node) => node.id === edge.source)
    if (!workItem) continue
    if (state === 'needs_candidate' && stringValue(workItem.record.kind) === 'missing_candidate') issueIds.add(workItem.id)
    if (state === 'stale' && stringValue(workItem.record.kind) === 'stale_selection') issueIds.add(workItem.id)
    if (state === 'missing' && (workItem.status === 'missing' || stringValue(workItem.record.severity) === 'blocking')) issueIds.add(workItem.id)
  }
  return issueIds.size
}

function contentCanvasHierarchyScope(
  nodeId: string,
  childrenByNodeId: Map<string, string[]>,
): Set<string> {
  const ids = new Set<string>([nodeId])
  const queue = [...(childrenByNodeId.get(nodeId) ?? [])]
  while (queue.length) {
    const current = queue.shift()
    if (!current || ids.has(current)) continue
    ids.add(current)
    queue.push(...(childrenByNodeId.get(current) ?? []))
  }
  return ids
}

function structureCountMetric(
  label: string,
  nodes: ContentCanvasNode[],
  kind: ContentCanvasNodeKind,
): string | undefined {
  const count = nodes.filter((node) => node.kind === kind).length
  return count > 0 ? `${label} ${count}` : undefined
}

function workItemMetric(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
): string | undefined {
  const workItemIds = new Set<string>()
  for (const edge of edges) {
    if (edge.relation === 'work_item_target' && scopeIds.has(edge.target)) workItemIds.add(edge.source)
  }
  return workItemIds.size > 0 ? `工作项 ${workItemIds.size}` : undefined
}

function contentCanvasScopeNeedsCandidateCount(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
  nodeById: Map<string, ContentCanvasNode>,
): number {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.state === 'needs_candidate' && (scopeIds.has(edge.source) || scopeIds.has(edge.target))) ids.add(edge.id)
    if (edge.relation !== 'work_item_target' || !scopeIds.has(edge.target)) continue
    const workItem = nodeById.get(edge.source)
    if (stringValue(workItem?.record.kind) === 'missing_candidate') ids.add(edge.source)
  }
  return ids.size
}

function contentCanvasScopeStaleCount(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
  nodeById: Map<string, ContentCanvasNode>,
): number {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.state === 'stale' && (scopeIds.has(edge.source) || scopeIds.has(edge.target))) ids.add(edge.id)
    if (edge.relation !== 'work_item_target' || !scopeIds.has(edge.target)) continue
    const workItem = nodeById.get(edge.source)
    if (stringValue(workItem?.record.kind) === 'stale_selection') ids.add(edge.source)
  }
  return ids.size
}

function contentCanvasScopeMissingCount(
  scopeIds: ReadonlySet<string>,
  edges: ContentCanvasEdge[],
  scopedNodes: ContentCanvasNode[],
  nodeById: Map<string, ContentCanvasNode>,
): number {
  const ids = new Set<string>()
  for (const node of scopedNodes) {
    if (node.status === 'missing') ids.add(node.id)
  }
  for (const edge of edges) {
    if (edge.state === 'missing' && (scopeIds.has(edge.source) || scopeIds.has(edge.target))) ids.add(edge.id)
    if (edge.relation !== 'work_item_target' || !scopeIds.has(edge.target)) continue
    const workItem = nodeById.get(edge.source)
    if (workItem?.status === 'missing' || stringValue(workItem?.record.severity) === 'blocking') ids.add(edge.source)
  }
  return ids.size
}

function issueMetric(label: string, count: number): string | undefined {
  return count > 0 ? `${label} ${count}` : undefined
}

function dedupeMetrics(metrics: Array<string | undefined>): string[] {
  return [...new Set(metrics.filter((metric): metric is string => Boolean(metric)))]
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
