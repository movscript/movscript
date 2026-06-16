import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export interface ContentCanvasCollapsedRelationSummary {
  kind: ContentCanvasNodeKind
  count: number
  label: string
}

export interface ContentCanvasHiddenEdgeSummary {
  relation: ContentCanvasEdge['relation'] | 'hierarchy' | 'reference' | 'sequence'
  count: number
  label: string
}

export function contentCanvasHiddenEdgeSummaries(
  hiddenEdges: ContentCanvasEdge[],
  visibleIds: ReadonlySet<string>,
): Record<string, ContentCanvasHiddenEdgeSummary[]> {
  const countsByNodeId = new Map<string, Map<ContentCanvasHiddenEdgeSummary['relation'], number>>()
  for (const edge of hiddenEdges) {
    const anchorId = visibleIds.has(edge.source) ? edge.source : visibleIds.has(edge.target) ? edge.target : undefined
    if (!anchorId) continue
    const relation = edge.relation ?? edge.kind
    const counts = countsByNodeId.get(anchorId) ?? new Map<ContentCanvasHiddenEdgeSummary['relation'], number>()
    counts.set(relation, (counts.get(relation) ?? 0) + 1)
    countsByNodeId.set(anchorId, counts)
  }
  return Object.fromEntries(
    [...countsByNodeId.entries()].map(([nodeId, counts]) => [
      nodeId,
      [...counts.entries()]
        .sort(([left], [right]) => hiddenEdgeRelationRank(left) - hiddenEdgeRelationRank(right))
        .map(([relation, count]) => ({
          relation,
          count,
          label: hiddenEdgeRelationLabel(relation),
        })),
    ]),
  )
}

export function contentCanvasCollapsedSummaries(
  graph: ContentCanvasGraph,
  visibleIds: ReadonlySet<string>,
  hiddenNodeIds: ReadonlySet<string>,
): Record<string, ContentCanvasCollapsedRelationSummary[]> {
  const countsByAnchor = new Map<string, Map<ContentCanvasNodeKind, number>>()
  for (const hiddenNodeId of hiddenNodeIds) {
    const hiddenNode = nodeById(graph, hiddenNodeId)
    if (!hiddenNode || !isAggregatedHiddenKind(hiddenNode.kind)) continue
    const anchorId = anchorVisibleNodeForHiddenNode(graph, visibleIds, hiddenNodeId, 3)
    if (!anchorId) continue
    const counts = countsByAnchor.get(anchorId) ?? new Map<ContentCanvasNodeKind, number>()
    counts.set(hiddenNode.kind, (counts.get(hiddenNode.kind) ?? 0) + 1)
    countsByAnchor.set(anchorId, counts)
  }
  return Object.fromEntries(
    [...countsByAnchor.entries()].map(([nodeId, counts]) => [
      nodeId,
      [...counts.entries()]
        .sort(([left], [right]) => collapsedKindRank(left) - collapsedKindRank(right))
        .map(([kind, count]) => ({
          kind,
          count,
          label: collapsedKindLabel(kind),
        })),
    ]),
  )
}

function hiddenEdgeRelationRank(relation: ContentCanvasHiddenEdgeSummary['relation']): number {
  if (relation === 'work_item_target') return 0
  if (relation === 'actor_work_item') return 1
  if (relation === 'hierarchy') return 2
  if (relation === 'sequence') return 3
  if (relation === 'content_unit_asset') return 4
  if (relation === 'content_unit_candidate') return 5
  if (relation === 'asset_downstream') return 6
  if (relation === 'setting_state_reference') return 7
  if (relation === 'expression_unit_shot' || relation === 'expression_unit_storyboard' || relation === 'expression_unit_content_unit') return 8
  if (relation === 'audio_cue_shot' || relation === 'audio_cue_storyboard' || relation === 'audio_cue_asset') return 9
  return 11
}

function hiddenEdgeRelationLabel(relation: ContentCanvasHiddenEdgeSummary['relation']): string {
  if (relation === 'work_item_target') return '处理边'
  if (relation === 'actor_work_item') return '处理者边'
  if (relation === 'hierarchy') return '结构边'
  if (relation === 'sequence') return '顺序边'
  if (relation === 'content_unit_asset') return '素材边'
  if (relation === 'content_unit_candidate') return '候选边'
  if (relation === 'asset_downstream') return '资产影响边'
  if (relation === 'setting_state_reference') return '设定状态边'
  if (relation === 'expression_unit_shot' || relation === 'expression_unit_storyboard' || relation === 'expression_unit_content_unit') return '表达约束边'
  if (relation === 'audio_cue_shot' || relation === 'audio_cue_storyboard') return '声音约束边'
  if (relation === 'audio_cue_asset') return '声音素材边'
  if (relation === 'content_unit_keyframe') return '关键帧边'
  if (relation === 'content_unit_storyboard') return '分镜边'
  if (relation === 'candidate_resource') return '资源边'
  if (relation === 'selection_candidate') return '选择边'
  return '关系边'
}

function anchorVisibleNodeForHiddenNode(
  graph: ContentCanvasGraph,
  visibleIds: ReadonlySet<string>,
  hiddenNodeId: string,
  maxDepth: number,
): string | undefined {
  const visited = new Set<string>([hiddenNodeId])
  let frontier = new Set<string>([hiddenNodeId])
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = new Set<string>()
    for (const current of frontier) {
      for (const edge of relatedEdgesForNode(graph, current)) {
        const relatedId = edge.source === current ? edge.target : edge.source
        if (visibleIds.has(relatedId)) return relatedId
        if (!visited.has(relatedId)) {
          visited.add(relatedId)
          next.add(relatedId)
        }
      }
    }
    frontier = next
    if (!frontier.size) break
  }
  return undefined
}

function isAggregatedHiddenKind(kind: ContentCanvasNodeKind): boolean {
  return kind === 'content_unit'
    || kind === 'candidate'
    || kind === 'selection'
    || kind === 'resource'
    || kind === 'keyframe'
    || kind === 'storyboard'
    || kind === 'expression_unit'
    || kind === 'audio_cue'
    || kind === 'state'
    || kind === 'work_item'
}

function collapsedKindRank(kind: ContentCanvasNodeKind): number {
  if (kind === 'work_item') return 0
  if (kind === 'content_unit') return 1
  if (kind === 'keyframe') return 2
  if (kind === 'storyboard') return 3
  if (kind === 'expression_unit') return 4
  if (kind === 'audio_cue') return 5
  if (kind === 'state') return 6
  if (kind === 'candidate') return 7
  if (kind === 'selection') return 8
  if (kind === 'resource') return 9
  return 9
}

function collapsedKindLabel(kind: ContentCanvasNodeKind): string {
  if (kind === 'work_item') return '工作项'
  if (kind === 'content_unit') return '制作项'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'storyboard') return '分镜'
  if (kind === 'expression_unit') return '表达'
  if (kind === 'audio_cue') return '声音'
  if (kind === 'state') return '状态'
  if (kind === 'candidate') return '候选'
  if (kind === 'selection') return '选择'
  if (kind === 'resource') return '资源'
  return '关系'
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

function nodeById(graph: ContentCanvasGraph, nodeId: string) {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}
