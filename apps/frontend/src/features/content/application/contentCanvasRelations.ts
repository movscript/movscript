import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export interface ContentCanvasRelationLedger {
  upstream: ContentCanvasRelationItem[]
  current: ContentCanvasCurrentFact[]
  downstream: ContentCanvasRelationItem[]
}

export interface ContentCanvasRelationItem {
  id: string
  nodeId: string
  title: string
  kind: ContentCanvasNodeKind
  status: ContentCanvasNode['status']
  relation: string
  direction: 'upstream' | 'downstream'
  evidence: string
  action: string
}

export interface ContentCanvasCurrentFact {
  id: string
  label: string
  value: string
}

export interface ContentCanvasEdgeInsight {
  id: string
  sourceNodeId: string
  sourceTitle: string
  sourceKind: ContentCanvasNodeKind
  targetNodeId: string
  targetTitle: string
  targetKind: ContentCanvasNodeKind
  relation: string
  evidence: string
  action: string
  primaryActionNodeId: string
  primaryActionLabel: string
}

export function buildContentCanvasEdgeInsight(
  graph: ContentCanvasGraph,
  edgeId: string | null,
): ContentCanvasEdgeInsight | null {
  if (!edgeId) return null
  const edge = edgeById(graph, edgeId)
  if (!edge) return null
  const sourceNode = nodeById(graph, edge.source)
  const targetNode = nodeById(graph, edge.target)
  if (!sourceNode || !targetNode) return null
  const relation = edgeInsightRelationLabel(edge)
  const primaryActionNode = edgeInsightPrimaryActionNode(edge, sourceNode, targetNode)
  const action = edge.action ?? relationAction('downstream', relation, targetNode)
  return {
    id: edge.id,
    sourceNodeId: sourceNode.id,
    sourceTitle: sourceNode.title,
    sourceKind: sourceNode.kind,
    targetNodeId: targetNode.id,
    targetTitle: targetNode.title,
    targetKind: targetNode.kind,
    relation,
    evidence: relationEvidence(edge, sourceNode, targetNode),
    action,
    primaryActionNodeId: primaryActionNode.id,
    primaryActionLabel: edgeInsightPrimaryActionLabel(edge, action, primaryActionNode),
  }
}

export function buildContentCanvasRelationLedger(
  graph: ContentCanvasGraph,
  selectedNode: ContentCanvasNode | null,
): ContentCanvasRelationLedger {
  if (!selectedNode) return { upstream: [], current: [], downstream: [] }
  const upstream: ContentCanvasRelationItem[] = []
  const downstream: ContentCanvasRelationItem[] = []

  for (const edge of relationEdgesForNode(graph, selectedNode.id)) {
    const relation = classifyContentCanvasRelation(edge, selectedNode.id)
    const relatedNodeId = relation.relatedNodeId
    const relatedNode = nodeById(graph, relatedNodeId)
    if (!relatedNode) continue
    const item: ContentCanvasRelationItem = {
      id: `${edge.id}:${relation.direction}`,
      nodeId: relatedNode.id,
      title: relatedNode.title,
      kind: relatedNode.kind,
      status: relatedNode.status,
      relation: relation.label,
      direction: relation.direction,
      evidence: relationEvidence(edge, selectedNode, relatedNode),
      action: edge.action ?? relationAction(relation.direction, relation.label, relatedNode),
    }
    if (relation.direction === 'upstream') upstream.push(item)
    else downstream.push(item)
  }

  return {
    upstream: sortRelationItems(upstream),
    current: currentFactsForNode(selectedNode),
    downstream: sortRelationItems(downstream),
  }
}

function relationEdgesForNode(graph: ContentCanvasGraph, nodeId: string): ContentCanvasEdge[] {
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

function nodeById(graph: ContentCanvasGraph, nodeId: string): ContentCanvasNode | undefined {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}

function edgeById(graph: ContentCanvasGraph, edgeId: string): ContentCanvasEdge | undefined {
  return graph.indexes?.edgeById[edgeId] ?? graph.edges.find((edge) => edge.id === edgeId)
}

function classifyContentCanvasRelation(edge: ContentCanvasEdge, selectedNodeId: string): {
  relatedNodeId: string
  direction: 'upstream' | 'downstream'
  label: string
} {
  if (edge.kind === 'hierarchy') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '结构上级' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '结构子级' }
  }
  if (edge.kind === 'sequence') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '上一项' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '下一项' }
  }
  if (edge.relation === 'content_unit_candidate') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '候选来源' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '生成候选' }
  }
  if (edge.relation === 'asset_downstream') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '素材影响' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '下游影响' }
  }
  if (edge.relation === 'selection_candidate') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '当前采纳' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '采纳候选' }
  }
  if (edge.relation === 'candidate_resource') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '资源来源' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '产出资源' }
  }
  if (edge.relation === 'content_unit_scene') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '情节输入' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '情节制作项' }
  }
  if (edge.relation === 'content_unit_asset') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '素材输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此素材' }
  }
  if (edge.relation === 'content_unit_keyframe') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '关键帧输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此关键帧' }
  }
  if (edge.relation === 'content_unit_shot') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '镜头输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '镜头制作项' }
  }
  if (edge.relation === 'content_unit_storyboard') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '分镜输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此分镜' }
  }
  if (edge.relation === 'audio_cue_shot') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '声音约束' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用镜头' }
  }
  if (edge.relation === 'audio_cue_storyboard') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '声音约束' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用分镜' }
  }
  if (edge.relation === 'audio_cue_asset') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '声音素材' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '声音使用' }
  }
  if (edge.relation === 'setting_state_reference') {
    return edge.source === selectedNodeId
      ? { relatedNodeId: edge.target, direction: 'upstream', label: '设定状态输入' }
      : { relatedNodeId: edge.source, direction: 'downstream', label: '依赖此状态' }
  }
  if (edge.relation === 'expression_unit_shot') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '表达约束' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用镜头' }
  }
  if (edge.relation === 'expression_unit_storyboard') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '表达约束' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用分镜' }
  }
  if (edge.relation === 'expression_unit_content_unit') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '表达输入' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '作用制作项' }
  }
  if (edge.relation === 'work_item_target') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '待处理项' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '处理目标' }
  }
  if (edge.relation === 'actor_work_item') {
    return edge.target === selectedNodeId
      ? { relatedNodeId: edge.source, direction: 'upstream', label: '推荐处理者' }
      : { relatedNodeId: edge.target, direction: 'downstream', label: '推荐工作项' }
  }
  return edge.target === selectedNodeId
    ? { relatedNodeId: edge.source, direction: 'upstream', label: edge.label ?? '上游引用' }
    : { relatedNodeId: edge.target, direction: 'downstream', label: edge.label ?? '下游引用' }
}

function currentFactsForNode(node: ContentCanvasNode): ContentCanvasCurrentFact[] {
  return [
    { id: 'kind', label: '类型', value: kindText(node.kind) },
    { id: 'status', label: '状态', value: statusText(node.status) },
    { id: 'source', label: '来源', value: node.sourcePath || 'workspace index' },
    ...currentProductFactsForNode(node),
    node.kind === 'work_item' ? stringFact('severity', '严重度', node.record.severity) : undefined,
    node.kind === 'work_item' ? stringFact('actor', '推荐处理', node.record.recommendedActor) : undefined,
    node.kind === 'work_item' ? numberFact('priority', '优先级', node.record.priority) : undefined,
    node.kind === 'work_item' ? actionsFact(node.record.actionLabels) : undefined,
    node.candidates.length ? { id: 'candidates', label: '候选', value: `${node.candidates.length} 个` } : undefined,
    ...node.metrics.map((metric, index) => ({ id: `metric:${index}`, label: '指标', value: metric })),
  ].filter((item): item is ContentCanvasCurrentFact => Boolean(item))
}

function currentProductFactsForNode(node: ContentCanvasNode): Array<ContentCanvasCurrentFact | undefined> {
  if (node.kind === 'shot') {
    return [
      stringFact('shot-description', '镜头描述', node.record.description ?? node.record.summary ?? node.summary),
      numberFact('shot-duration', '时长秒', node.record.duration_sec ?? node.record.durationSec),
      stringFact('shot-camera', 'Camera', node.record.camera ?? node.record.camera_motion ?? node.record.cameraMotion ?? node.record.shot_size),
      stringFact('shot-expression', '表达', node.record.expression_ref ?? node.record.expression_id ?? node.record.expression),
      stringFact('shot-content-status', '制作状态', node.record.content_unit_status ?? node.record.contentUnitStatus),
    ]
  }
  if (node.kind === 'asset') {
    return [
      stringFact('asset-slot', '资源槽位', node.record.slot ?? node.record.slot_key ?? node.record.setting_state_id ?? node.record.settingStateId),
      stringFact('asset-kind', '素材类型', node.record.asset_kind ?? node.record.kind),
      stringFact('asset-lock-policy', '确认策略', node.record.lock_policy ?? node.record.lockPolicy),
      stringFact('asset-prompt-hint', '提示线索', node.record.prompt_hint ?? node.record.promptHint),
    ]
  }
  if (node.kind === 'content_unit') {
    return [
      stringFact('content-unit-output-kind', '产物类型', node.record.output_kind ?? node.record.outputKind),
      stringFact('content-unit-type', '制作项类型', node.record.content_unit_type ?? node.record.contentUnitType),
      stringFact('content-unit-prompt', 'Edit prompt', promptTextFromRecord(node.record)),
      node.candidates.length ? { id: 'content-unit-candidate-count', label: '候选数', value: `${node.candidates.length}` } : undefined,
      selectedCandidateFact(node),
    ]
  }
  if (node.kind === 'keyframe' || node.kind === 'storyboard') {
    return [
      stringFact('visual-selection-state', '选择状态', node.record.selection_state ?? node.record.selectionState ?? node.record.status),
      stringFact('visual-selected-candidate', '已选候选', node.record.selected_candidate_id ?? node.record.selectedCandidateId ?? node.record.candidate_id),
      stringFact('visual-input-hash', 'Input hash', node.record.input_hash ?? node.record.inputHash ?? node.record.accepted_input_hash ?? node.record.acceptedInputHash),
      stringFact('visual-slot', '槽位', node.record.slot ?? node.record.frame_id ?? node.record.frameId),
    ]
  }
  return []
}

function promptTextFromRecord(record: Record<string, unknown>): string | undefined {
  const prompt = record.edit_prompt ?? record.editPrompt ?? record.prompt
  if (typeof prompt === 'string' && prompt.trim()) return prompt.trim()
  if (isRecord(prompt) && typeof prompt.text === 'string' && prompt.text.trim()) return prompt.text.trim()
  return undefined
}

function selectedCandidateFact(node: ContentCanvasNode): ContentCanvasCurrentFact | undefined {
  const selected = node.candidates.find((candidate) => candidate.selected)
  if (!selected) return undefined
  return {
    id: 'content-unit-selected-candidate',
    label: '已选候选',
    value: selected.title,
  }
}

function relationEvidence(edge: ContentCanvasEdge, selectedNode: ContentCanvasNode, relatedNode: ContentCanvasNode): string {
  if (edge.evidence) return edge.evidence
  if (edge.relation === 'work_item_target') {
    const workItemNode = selectedNode.kind === 'work_item' ? selectedNode : relatedNode.kind === 'work_item' ? relatedNode : undefined
    return [
      stringValue(workItemNode?.record.reason),
      stringValue(workItemNode?.record.targetPath) ?? workItemNode?.sourcePath ?? relatedNode.sourcePath,
      stringValue(workItemNode?.record.severity),
    ].filter(Boolean).join(' · ') || 'Production work plan'
  }
  if (edge.relation === 'actor_work_item') {
    const workItemNode = selectedNode.kind === 'work_item' ? selectedNode : relatedNode.kind === 'work_item' ? relatedNode : undefined
    return [
      stringValue(workItemNode?.record.recommendedActor),
      stringValue(workItemNode?.record.severity),
      stringValue(workItemNode?.record.reason),
    ].filter(Boolean).join(' · ') || 'Production work plan'
  }
  return [
    edge.relation ?? edge.kind,
    edge.label,
    relatedNode.sourcePath || relatedNode.entityKey,
  ].filter(Boolean).join(' · ')
}

function relationAction(direction: 'upstream' | 'downstream', relation: string, node: ContentCanvasNode): string {
  if (relation === '下游影响' && node.status === 'missing') return '定位下游缺口'
  if (node.kind === 'work_item') return actionTextFromRecord(node.record) ?? '查看建议动作'
  if (node.kind === 'actor') return '查看推荐工作项'
  if (node.status === 'missing') return '补齐缺失输入'
  if (node.kind === 'selection') return '查看当前采纳'
  if (node.kind === 'resource') return '查看资源输出'
  if (node.kind === 'candidate') return '检查候选选择'
  if (node.kind === 'content_unit') return direction === 'upstream' ? '打开来源制作项' : '复核下游制作项'
  if (direction === 'upstream') return `检查${relation}`
  return `定位${relation}`
}

function edgeInsightRelationLabel(edge: ContentCanvasEdge): string {
  if (edge.kind === 'hierarchy') return edge.label ?? '结构归属'
  if (edge.kind === 'sequence') return edge.label ?? '顺序关系'
  if (edge.relation === 'content_unit_candidate') return '生成候选'
  if (edge.relation === 'asset_downstream') return '下游影响'
  if (edge.relation === 'selection_candidate') return '当前采纳'
  if (edge.relation === 'candidate_resource') return '产出资源'
  if (edge.relation === 'content_unit_scene') return '情节制作项'
  if (edge.relation === 'content_unit_asset') return '素材输入'
  if (edge.relation === 'content_unit_keyframe') return '关键帧输入'
  if (edge.relation === 'content_unit_shot') return '镜头制作项'
  if (edge.relation === 'content_unit_storyboard') return '分镜输入'
  if (edge.relation === 'audio_cue_shot') return '声音约束'
  if (edge.relation === 'audio_cue_storyboard') return '声音分镜'
  if (edge.relation === 'audio_cue_asset') return '声音素材'
  if (edge.relation === 'setting_state_reference') return '设定状态'
  if (edge.relation === 'expression_unit_shot') return '表达约束'
  if (edge.relation === 'expression_unit_storyboard') return '表达分镜'
  if (edge.relation === 'expression_unit_content_unit') return '表达制作项'
  if (edge.relation === 'work_item_target') return '处理目标'
  if (edge.relation === 'actor_work_item') return '推荐处理'
  return edge.label ?? edge.relation ?? edge.kind
}

function edgeInsightPrimaryActionNode(
  edge: ContentCanvasEdge,
  sourceNode: ContentCanvasNode,
  targetNode: ContentCanvasNode,
): ContentCanvasNode {
  if (edge.relation === 'work_item_target') return targetNode
  if (edge.state === 'stale' || edge.state === 'needs_candidate' || edge.state === 'missing') return targetNode
  if (edge.relation === 'content_unit_asset' || edge.relation === 'content_unit_keyframe' || edge.relation === 'content_unit_storyboard') return sourceNode
  if (edge.relation === 'selection_candidate' || edge.relation === 'candidate_resource') return targetNode
  return targetNode
}

function edgeInsightPrimaryActionLabel(
  edge: ContentCanvasEdge,
  action: string,
  node: ContentCanvasNode,
): string {
  if (edge.state === 'stale') return `${action} · 定位复核`
  if (edge.state === 'needs_candidate') return `${action} · 定位候选缺口`
  if (edge.state === 'missing') return `${action} · 定位缺失输入`
  if (edge.relation === 'work_item_target') return `定位处理目标：${node.title}`
  return `定位${node.title}`
}

function stringFact(id: string, label: string, value: unknown): ContentCanvasCurrentFact | undefined {
  const text = stringValue(value)
  return text ? { id, label, value: text } : undefined
}

function numberFact(id: string, label: string, value: unknown): ContentCanvasCurrentFact | undefined {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : undefined
  return number === undefined ? undefined : { id, label, value: String(number) }
}

function actionsFact(value: unknown): ContentCanvasCurrentFact | undefined {
  if (!Array.isArray(value)) return undefined
  const actions = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return actions.length ? { id: 'actions', label: '建议动作', value: actions.join(' / ') } : undefined
}

function actionTextFromRecord(record: Record<string, unknown>): string | undefined {
  if (!Array.isArray(record.actionLabels)) return undefined
  return record.actionLabels.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sortRelationItems(items: ContentCanvasRelationItem[]): ContentCanvasRelationItem[] {
  return [...items].sort((left, right) => {
    const statusDelta = statusRank(left.status) - statusRank(right.status)
    if (statusDelta !== 0) return statusDelta
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

function statusRank(status: ContentCanvasNode['status']): number {
  if (status === 'missing') return 0
  if (status === 'active') return 1
  if (status === 'ready') return 2
  return 3
}

function kindText(kind: ContentCanvasNodeKind): string {
  if (kind === 'project') return '项目'
  if (kind === 'production') return '制作'
  if (kind === 'segment') return '段落'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'shot') return '镜头'
  if (kind === 'storyboard') return '分镜图'
  if (kind === 'expression_unit') return '表达单元'
  if (kind === 'content_unit') return '制作项'
  if (kind === 'candidate') return '候选'
  if (kind === 'selection') return '选择'
  if (kind === 'resource') return '资源'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'asset') return '素材'
  if (kind === 'state') return '状态'
  if (kind === 'audio_cue') return '声音'
  if (kind === 'work_item') return '工作项'
  if (kind === 'actor') return '处理者'
  if (kind === 'group') return '分组'
  return '设定'
}

function statusText(status: ContentCanvasNode['status']): string {
  if (status === 'ready') return '稳定'
  if (status === 'active') return '推进中'
  if (status === 'missing') return '待补齐'
  return '记录'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
