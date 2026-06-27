import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export interface ContentCanvasCollapsedRelationSummary {
  kind: ContentCanvasNodeKind
  domainKind?: string
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
  graph: ContentCanvasWorkspaceSnapshot,
  visibleIds: ReadonlySet<string>,
  hiddenNodeIds: ReadonlySet<string>,
  options: { excludeKinds?: ReadonlySet<ContentCanvasNodeKind> } = {},
): Record<string, ContentCanvasCollapsedRelationSummary[]> {
  const countsByAnchor = new Map<string, Map<string, ContentCanvasCollapsedRelationSummary & { rank: number }>>()
  for (const hiddenNodeId of hiddenNodeIds) {
    const hiddenNode = nodeById(graph, hiddenNodeId)
    if (!hiddenNode || !isAggregatedHiddenNode(hiddenNode)) continue
    if (options.excludeKinds?.has(hiddenNode.kind)) continue
    const anchorId = anchorVisibleNodeForHiddenNode(graph, visibleIds, hiddenNodeId, 3)
    if (!anchorId) continue
    const counts = countsByAnchor.get(anchorId) ?? new Map<string, ContentCanvasCollapsedRelationSummary & { rank: number }>()
    const key = collapsedSummaryKey(hiddenNode)
    const current = counts.get(key)
    counts.set(key, {
      kind: hiddenNode.kind,
      ...(hiddenNode.domainKind ? { domainKind: hiddenNode.domainKind } : {}),
      count: (current?.count ?? 0) + 1,
      label: collapsedNodeLabel(hiddenNode),
      rank: collapsedNodeRank(hiddenNode),
    })
    countsByAnchor.set(anchorId, counts)
  }
  return Object.fromEntries(
    [...countsByAnchor.entries()].map(([nodeId, counts]) => [
      nodeId,
      [...counts.values()]
        .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, 'zh-CN'))
        .map(({ rank: _rank, ...summary }) => summary),
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
  if (relation === 'expression_unit_storyboard' || relation === 'expression_unit_content_unit') return 8
  if (relation === 'audio_cue_storyboard' || relation === 'audio_cue_asset' || relation === 'content_unit_audio_cue') return 9
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
  if (relation === 'expression_unit_storyboard' || relation === 'expression_unit_content_unit') return '表达约束边'
  if (relation === 'audio_cue_storyboard') return '声音约束边'
  if (relation === 'audio_cue_asset') return '声音素材边'
  if (relation === 'content_unit_audio_cue') return '声音边'
  if (relation === 'content_unit_keyframe') return '关键帧边'
  if (relation === 'content_unit_storyboard') return '分镜边'
  if (relation === 'candidate_resource') return '资源边'
  if (relation === 'selection_candidate') return '选择边'
  return '关系边'
}

function anchorVisibleNodeForHiddenNode(
  graph: ContentCanvasWorkspaceSnapshot,
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

function isAggregatedHiddenNode(node: ContentCanvasNode): boolean {
  if (node.domainCategory === 'timeline_namespace' || node.domainCategory === 'setting_namespace') return true
  return node.kind === 'content_unit'
    || node.kind === 'candidate'
    || node.kind === 'selection'
    || node.kind === 'resource'
    || node.kind === 'keyframe'
    || node.kind === 'storyboard'
    || node.kind === 'expression_unit'
    || node.kind === 'audio_cue'
    || node.kind === 'scene_moment'
    || node.kind === 'state'
    || node.kind === 'work_item'
}

function collapsedNodeRank(node: ContentCanvasNode): number {
  if (node.domainCategory === 'timeline_namespace') return 1
  if (node.kind === 'scene_moment') return 2
  if (node.domainCategory === 'setting_namespace') return 6
  return collapsedKindRank(node.kind)
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

function collapsedSummaryKey(node: ContentCanvasNode): string {
  return `${node.kind}:${node.domainCategory ?? ''}:${node.domainKind ?? ''}`
}

function collapsedNodeLabel(node: ContentCanvasNode): string {
  if ((node.domainCategory === 'timeline_namespace' || node.domainCategory === 'setting_namespace') && node.domainKind) {
    return node.domainKind
  }
  return collapsedKindLabel(node.kind)
}

function collapsedKindLabel(kind: ContentCanvasNodeKind): string {
  if (kind === 'production') return '时间层级'
  if (kind === 'segment') return '时间层级'
  if (kind === 'setting') return '设定层级'
  if (kind === 'work_item') return '工作项'
  if (kind === 'content_unit') return '创作片段'
  if (kind === 'scene_moment') return '场面'
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

function relatedEdgesForNode(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): ContentCanvasEdge[] {
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

function nodeById(graph: ContentCanvasWorkspaceSnapshot, nodeId: string) {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}
