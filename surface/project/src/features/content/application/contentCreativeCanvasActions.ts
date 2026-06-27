import type { ContentCanvasCandidate, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { contentCanvasNodeCanUseCandidateFlow } from '../domain/contentCanvasDomainPolicy'

export type CreativeCanvasAction =
  | { kind: 'create_child'; childKind: Extract<ContentCanvasNodeKind, 'segment' | 'scene_moment' | 'expression_unit' | 'keyframe' | 'storyboard' | 'asset' | 'state'>; label: string }
  | { kind: 'create_assembly'; label: string }
  | { kind: 'generate_candidate'; label: string }
  | { kind: 'upload_candidate'; label: string }
  | { kind: 'select_candidate'; candidateId: string; label: string }
  | { kind: 'open_resource'; resourceId?: number; label: string }
  | { kind: 'remove_from_canvas'; label: string }
  | { kind: 'delete_node'; label: string }

export function creativeCanvasActionsForNode(node: ContentCanvasNode | undefined): CreativeCanvasAction[] {
  if (!node) return []
  const actions: CreativeCanvasAction[] = []
  actions.push(...creativeCanvasStructureActionsForNode(node))
  if (contentCanvasNodeCanUseCandidateFlow(node)) {
    if (canGenerateCandidateForNode(node)) {
      actions.push({ kind: 'generate_candidate', label: node.candidates.length ? '再生成候选' : '生成候选' })
    }
    actions.push({ kind: 'upload_candidate', label: '上传候选' })
  }
  if (node.kind === 'candidate') {
    const candidateId = String(node.record.id ?? node.entityKey)
    actions.push({ kind: 'select_candidate', candidateId, label: node.record.selected === true ? '已选择候选' : '选择候选' })
  }
  if (node.kind === 'resource') {
    actions.push({ kind: 'open_resource', resourceId: numericRecordField(node.record.resourceId), label: '打开资源' })
  }
  actions.push({ kind: 'remove_from_canvas', label: '从画布移除' })
  if (contentCanvasNodeCanDelete(node)) {
    actions.push({ kind: 'delete_node', label: '删除源节点' })
  }
  return actions
}

function creativeCanvasStructureActionsForNode(node: ContentCanvasNode): CreativeCanvasAction[] {
  if (node.domainCategory === 'timeline_namespace') return timelineNamespaceActionsForNode(node)
  if (node.domainCategory === 'setting_namespace') return settingNamespaceActionsForNode(node)
  return legacyKindStructureActionsForNode(node)
}

function timelineNamespaceActionsForNode(node: ContentCanvasNode): CreativeCanvasAction[] {
  if (node.kind === 'production') {
    return [
      { kind: 'create_child', childKind: 'segment', label: '添加子层级' },
      { kind: 'create_assembly', label: '创建剪辑聚合' },
    ]
  }
  if (node.kind === 'segment') {
    return [
      { kind: 'create_child', childKind: 'scene_moment', label: '添加情节' },
      { kind: 'create_assembly', label: '创建剪辑聚合' },
    ]
  }
  return []
}

function settingNamespaceActionsForNode(node: ContentCanvasNode): CreativeCanvasAction[] {
  if (node.kind === 'setting') return [{ kind: 'create_child', childKind: 'state', label: '添加状态层级' }]
  if (node.kind === 'state') return [{ kind: 'create_child', childKind: 'asset', label: '添加资产槽' }]
  return []
}

function legacyKindStructureActionsForNode(node: ContentCanvasNode): CreativeCanvasAction[] {
  const actions: CreativeCanvasAction[] = []
  if (node.kind === 'production') {
    actions.push({ kind: 'create_child', childKind: 'segment', label: '添加段落' })
  }
  if (node.kind === 'segment') {
    actions.push({ kind: 'create_child', childKind: 'scene_moment', label: '添加情节' })
  }
  if (node.kind === 'scene_moment') {
    actions.push(
      { kind: 'create_child', childKind: 'expression_unit', label: '添加 Expression' },
      { kind: 'create_child', childKind: 'keyframe', label: '添加关键帧' },
      { kind: 'create_child', childKind: 'storyboard', label: '添加故事版' },
    )
  }
  if (node.kind === 'expression_unit') {
    actions.push(
      { kind: 'create_child', childKind: 'keyframe', label: '添加关键帧' },
      { kind: 'create_child', childKind: 'storyboard', label: '添加故事版' },
    )
  }
  if (node.kind === 'setting') actions.push({ kind: 'create_child', childKind: 'state', label: '添加状态' })
  if (node.kind === 'state') actions.push({ kind: 'create_child', childKind: 'asset', label: '添加资产' })
  return actions
}

function contentCanvasNodeCanDelete(node: ContentCanvasNode): boolean {
  if (!node.sourcePath) return false
  return node.kind === 'production'
    || node.kind === 'segment'
    || node.kind === 'scene_moment'
    || node.kind === 'expression_unit'
    || node.kind === 'keyframe'
    || node.kind === 'storyboard'
    || node.kind === 'audio_cue'
    || node.kind === 'content_unit'
    || node.kind === 'setting'
    || node.kind === 'state'
    || node.kind === 'asset'
}

function canGenerateCandidateForNode(node: ContentCanvasNode): boolean {
  const outputKind = contentCanvasCandidateOutputKind(node)
  return outputKind === 'image' || outputKind === 'video'
}

function contentCanvasCandidateOutputKind(node: ContentCanvasNode): string {
  if (node.generationTask?.outputKind) return node.generationTask.outputKind
  if (node.kind === 'scene_moment') return 'video'
  if (node.kind === 'keyframe' || node.kind === 'storyboard') return 'image'
  const outputKind = String(
    node.record.output_kind
      ?? node.record.outputKind
      ?? node.record.asset_kind
      ?? node.record.assetKind
      ?? node.subtitle
  ).toLowerCase()
  if (outputKind === 'image' || outputKind === 'video' || outputKind === 'audio' || outputKind === 'text') return outputKind
  return node.kind === 'content_unit' ? 'image' : outputKind
}

function numericRecordField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function selectedCandidateActionForNode(node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate | undefined): CreativeCanvasAction | undefined {
  if (!node || !candidate) return undefined
  return { kind: 'select_candidate', candidateId: candidate.id, label: candidate.selected ? '已选择' : '选择候选' }
}
