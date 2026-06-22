import type { ContentCanvasCandidate, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'

export type CreativeCanvasAction =
  | { kind: 'create_child'; childKind: Extract<ContentCanvasNodeKind, 'expression_unit' | 'keyframe' | 'storyboard' | 'asset' | 'state' | 'content_unit'>; label: string }
  | { kind: 'generate_candidate'; label: string }
  | { kind: 'upload_candidate'; label: string }
  | { kind: 'select_candidate'; candidateId: string; label: string }
  | { kind: 'open_resource'; resourceId?: number; label: string }
  | { kind: 'delete_node'; label: string }

export function creativeCanvasActionsForNode(node: ContentCanvasNode | undefined): CreativeCanvasAction[] {
  if (!node) return []
  const actions: CreativeCanvasAction[] = []
  if (node.kind === 'scene_moment') {
    actions.push(
      { kind: 'create_child', childKind: 'expression_unit', label: '添加 Expression' },
      { kind: 'create_child', childKind: 'keyframe', label: '添加关键帧' },
      { kind: 'create_child', childKind: 'storyboard', label: '添加故事版' },
      { kind: 'create_child', childKind: 'content_unit', label: '添加创作片段' },
    )
  }
  if (node.kind === 'expression_unit') {
    actions.push(
      { kind: 'create_child', childKind: 'keyframe', label: '添加关键帧' },
      { kind: 'create_child', childKind: 'storyboard', label: '添加故事版' },
      { kind: 'create_child', childKind: 'content_unit', label: '添加创作片段' },
    )
  }
  if (node.kind === 'setting') actions.push({ kind: 'create_child', childKind: 'state', label: '添加状态' })
  if (node.kind === 'state') actions.push({ kind: 'create_child', childKind: 'asset', label: '添加资产' })
  if (canGenerateCandidateForNode(node)) {
    actions.push(
      { kind: 'generate_candidate', label: node.candidates.length ? '再生成候选' : '生成候选' },
      { kind: 'upload_candidate', label: '上传候选' },
    )
  }
  if (node.kind === 'candidate') {
    const candidateId = String(node.record.id ?? node.entityKey)
    actions.push({ kind: 'select_candidate', candidateId, label: node.record.selected === true ? '已选择候选' : '选择候选' })
  }
  if (node.kind === 'resource') {
    actions.push({ kind: 'open_resource', resourceId: numericRecordField(node.record.resourceId), label: '打开资源' })
  }
  if (contentCanvasNodeCanDelete(node)) {
    actions.push({ kind: 'delete_node', label: '删除节点' })
  }
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
  return node.kind === 'asset'
    || node.kind === 'keyframe'
    || node.kind === 'storyboard'
    || node.kind === 'scene_moment'
    || node.kind === 'expression_unit'
    || node.kind === 'content_unit'
}

function numericRecordField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function selectedCandidateActionForNode(node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate | undefined): CreativeCanvasAction | undefined {
  if (!node || !candidate) return undefined
  return { kind: 'select_candidate', candidateId: candidate.id, label: candidate.selected ? '已选择' : '选择候选' }
}
