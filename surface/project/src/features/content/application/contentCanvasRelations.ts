import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { contentCanvasNodeDisplayKind } from '../domain/contentCanvasDomainPolicy'
import {
  classifyContentCanvasRelation,
  contentCanvasEdgeInsightRelationLabel,
  contentCanvasStatusText,
} from './contentCanvasRelationLabels'

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
  graph: ContentCanvasWorkspaceSnapshot,
  edgeId: string | null,
): ContentCanvasEdgeInsight | null {
  if (!edgeId) return null
  const edge = edgeById(graph, edgeId)
  if (!edge) return null
  const sourceNode = nodeById(graph, edge.source)
  const targetNode = nodeById(graph, edge.target)
  if (!sourceNode || !targetNode) return null
  const relation = contentCanvasEdgeInsightRelationLabel(edge)
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
  graph: ContentCanvasWorkspaceSnapshot,
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

function relationEdgesForNode(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): ContentCanvasEdge[] {
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

function nodeById(graph: ContentCanvasWorkspaceSnapshot, nodeId: string): ContentCanvasNode | undefined {
  return graph.indexes?.nodeById[nodeId] ?? graph.nodes.find((node) => node.id === nodeId)
}

function edgeById(graph: ContentCanvasWorkspaceSnapshot, edgeId: string): ContentCanvasEdge | undefined {
  return graph.indexes?.edgeById[edgeId] ?? graph.edges.find((edge) => edge.id === edgeId)
}

function currentFactsForNode(node: ContentCanvasNode): ContentCanvasCurrentFact[] {
  return [
    { id: 'kind', label: '类型', value: contentCanvasNodeDisplayKind(node) },
    { id: 'status', label: '状态', value: contentCanvasStatusText(node.status) },
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
      stringFact('content-unit-type', '创作片段类型', node.record.content_unit_type ?? node.record.contentUnitType),
      stringFact('content-unit-prompt', 'Edit prompt', promptTextFromRecord(node.record)),
      node.candidates.length ? { id: 'content-unit-candidate-count', label: '候选数', value: `${node.candidates.length}` } : undefined,
      selectedCandidateFact(node),
    ]
  }
  if (node.kind === 'expression_unit') {
    return [
      stringFact('expression-kind', '表达类型', node.record.slot_kind ?? node.record.slotKind ?? node.record.expression_kind ?? node.record.expressionKind ?? node.record.kind),
      stringFact('expression-summary', '表达描述', node.summary),
      numberFact('expression-duration', '时长秒', node.record.duration_sec ?? node.record.durationSec),
      stringFact('expression-camera', 'Camera', node.record.camera),
      stringFact('expression-ref', '表达', node.record.expression_ref ?? node.record.expressionRef),
      stringFact('expression-content-status', '制作状态', node.record.content_unit_status ?? node.record.contentUnitStatus),
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
  if (node.kind === 'setting') {
    return [
      stringFact('setting-kind', '设定类型', node.record.kind ?? node.record.setting_kind ?? node.record.settingKind),
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
  if (node.kind === 'content_unit') return direction === 'upstream' ? '打开来源创作片段' : '复核下游创作片段'
  if (direction === 'upstream') return `检查${relation}`
  return `定位${relation}`
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
