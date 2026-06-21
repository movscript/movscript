import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CandidateDecision, CandidateSelections, RadialNode, SettingKind } from './contentCanvasWorkspaceTypes'

export function settingKindFromNode(node: ContentCanvasNode): SettingKind | 'relationship' {
  const value = `${node.subtitle} ${stringField(node.record, 'kind', 'setting_kind', 'type')}`.toLowerCase()
  if (value.includes('character') || value.includes('角色')) return 'character'
  if (value.includes('location') || value.includes('场景')) return 'location'
  if (value.includes('prop') || value.includes('道具')) return 'prop'
  if (value.includes('costume') || value.includes('服装')) return 'costume'
  if (value.includes('visual') || value.includes('style') || value.includes('视觉')) return 'visual_style'
  if (value.includes('rule') || value.includes('规则')) return 'world_rule'
  if (value.includes('sound') || value.includes('声音')) return 'sound_motif'
  return 'relationship'
}

export function contentStatusLabel(status: ContentCanvasNode['status']) {
  if (status === 'ready') return '就绪'
  if (status === 'active') return '进行中'
  if (status === 'missing') return '缺失'
  return '普通'
}

export function promptFromContentNode(node: ContentCanvasNode | undefined) {
  if (!node) return undefined
  if (node.generationTask?.prompt) return node.generationTask.prompt
  const editPrompt = recordField(node.record, 'edit_prompt', 'editPrompt')
  const editPromptText = editPrompt ? stringField(editPrompt, 'text') : ''
  return editPromptText
    || stringField(node.record, 'prompt', 'prompt_text', 'generation_prompt')
    || node.summary
}

export function candidatesForNode(node: ContentCanvasNode | undefined) {
  return node?.generationTask?.candidates ?? node?.candidates ?? []
}

export function selectedCandidateForNode(node: ContentCanvasNode | undefined, candidateSelections: CandidateSelections) {
  const candidates = candidatesForNode(node)
  if (!node || candidates.length === 0) return undefined
  const selectedId = candidateSelectionIdForNode(node, candidateSelections)
  return candidates.find((candidate) => candidate.id === selectedId)
    ?? candidates.find((candidate) => candidate.selected)
    ?? candidates[0]
}

export function nodeCandidateBadge(node: ContentCanvasNode | undefined, candidateSelections: CandidateSelections) {
  const decision = candidateDecisionForNode(node, candidateSelections)
  return decision ? `${decision.label} · ${decision.candidateCount} 候选` : ''
}

export function candidateDecisionForNode(node: ContentCanvasNode | undefined, candidateSelections: CandidateSelections): CandidateDecision | null {
  if (!node) return null
  const candidates = candidatesForNode(node)
  const hasExplicitSelection = Boolean(candidateSelectionIdForNode(node, candidateSelections)) || candidates.some((candidate) => candidate.selected)
  if (isCandidateDecisionStale(node)) {
    return {
      tone: 'stale',
      label: '需复查',
      summary: candidates.length ? '上游内容可能已变化，请复核当前候选是否仍然有效。' : '上游内容可能已变化，需要重新生成候选。',
      actionLabel: candidates.length ? '复核候选' : '重新生成',
      candidateCount: candidates.length,
      hasExplicitSelection,
    }
  }
  if (isCandidateDecisionLocked(node)) {
    return {
      tone: 'locked',
      label: '已锁定',
      summary: hasExplicitSelection ? '当前候选已确认并锁定。' : '节点已锁定，但还没有明确候选选择。',
      actionLabel: '解锁',
      candidateCount: candidates.length,
      hasExplicitSelection,
    }
  }
  if (candidates.length === 0) {
    return {
      tone: 'empty',
      label: '待生成',
      summary: '还没有可比较的候选结果。',
      actionLabel: '生成候选',
      candidateCount: 0,
      hasExplicitSelection: false,
    }
  }
  if (!hasExplicitSelection) {
    return {
      tone: 'pending',
      label: '待选择',
      summary: '已有候选结果，但尚未确认当前选择。',
      actionLabel: '选择候选',
      candidateCount: candidates.length,
      hasExplicitSelection,
    }
  }
  return {
    tone: 'selected',
    label: '已选择',
    summary: '当前候选已经被选中，可继续锁定或用于下游表达。',
    actionLabel: '锁定选择',
    candidateCount: candidates.length,
    hasExplicitSelection,
  }
}

function candidateSelectionIdForNode(node: ContentCanvasNode, candidateSelections: CandidateSelections): string | undefined {
  return candidateSelectionKeysForNode(node)
    .map((key) => candidateSelections[key])
    .find((candidateId): candidateId is string => Boolean(candidateId))
}

function candidateSelectionKeysForNode(node: ContentCanvasNode): string[] {
  return uniqueStrings(
    node.id,
    node.entityKey,
    node.generationTask?.nodeId,
    node.generationTask?.id,
  )
}

function isCandidateDecisionLocked(node: ContentCanvasNode) {
  if (node.generationTask?.status === 'selected') return false
  return booleanField(node.record, 'locked', 'is_locked', 'isLocked', 'decision_locked', 'decisionLocked')
    || stringField(node.record, 'decision_state', 'decisionState', 'selection_state', 'selectionState', 'state').toLowerCase() === 'locked'
}

function isCandidateDecisionStale(node: ContentCanvasNode) {
  if (node.generationTask?.status === 'stale') return true
  if (node.status === 'missing') return true
  const state = stringField(node.record, 'decision_state', 'decisionState', 'selection_state', 'selectionState', 'state', 'status').toLowerCase()
  return booleanField(node.record, 'stale', 'is_stale', 'isStale', 'invalidated', 'outdated', 'needs_review', 'needsReview')
    || state === 'stale'
    || state === 'invalidated'
    || state === 'outdated'
    || state === 'needs_review'
}

export type NodeMediaKind = 'image' | 'video' | 'audio' | 'text' | 'board' | 'keyframe' | 'scene' | 'unknown'

export function mediaKindForNode(node: ContentCanvasNode | undefined): NodeMediaKind {
  if (!node) return 'unknown'
  if (node.kind === 'scene_moment') return 'scene'
  if (node.kind === 'storyboard') return 'board'
  if (node.kind === 'keyframe') return 'keyframe'
  if (node.kind === 'audio_cue') return 'audio'
  const value = `${node.kind} ${node.subtitle} ${stringField(
    node.record,
    'media_kind',
    'mediaKind',
    'resource_kind',
    'resourceKind',
    'mime_type',
    'mimeType',
    'content_type',
    'type',
    'kind',
  )}`.toLowerCase()
  if (value.includes('audio') || value.includes('sound') || value.includes('voice') || value.includes('音频') || value.includes('声音')) return 'audio'
  if (value.includes('video') || value.includes('shot') || value.includes('mp4') || value.includes('mov') || value.includes('视频')) return 'video'
  if (value.includes('image') || value.includes('photo') || value.includes('png') || value.includes('jpg') || value.includes('jpeg') || value.includes('图片') || value.includes('图像')) return 'image'
  if (value.includes('text') || value.includes('subtitle') || value.includes('caption') || value.includes('字幕')) return 'text'
  return 'unknown'
}

export function mediaKindLabel(kind: NodeMediaKind) {
  if (kind === 'image') return '图片'
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  if (kind === 'text') return '文本'
  if (kind === 'board') return 'Storyboard'
  if (kind === 'keyframe') return 'Keyframe'
  if (kind === 'scene') return 'Scene'
  return '媒体'
}

export function isExpressionPromptNode(node: RadialNode) {
  return node.source?.kind === 'expression_unit'
    || node.source?.kind === 'audio_cue'
    || node.variant === 'expression'
}

export function appendAssetReferenceToPrompt(prompt: string, asset: ContentCanvasNode) {
  return appendContentNodeReferenceToPrompt(prompt, asset)
}

export function appendContentNodeReferenceToPrompt(prompt: string, node: ContentCanvasNode) {
  const kind = promptReferenceKindForNode(node)
  const token = `{{${kind}:${node.entityKey || node.id}}}`
  if (prompt.includes(token)) return prompt
  return [prompt.trim(), token].filter(Boolean).join('\n')
}

function promptReferenceKindForNode(node: ContentCanvasNode): 'asset' | 'candidate' | 'resource' | 'keyframe' | 'storyboard' {
  if (node.kind === 'keyframe') return 'keyframe'
  if (node.kind === 'storyboard') return 'storyboard'
  if (node.kind === 'candidate') return 'candidate'
  if (node.kind === 'resource') return 'resource'
  return 'asset'
}

export function uniqueContentNodes(nodes: ContentCanvasNode[]) {
  return [...new Map(nodes.map((node) => [node.id, node])).values()]
}

export function stringField(record: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function recordField(record: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  return undefined
}

function booleanField(record: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!record) return false
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true
      if (normalized === 'false' || normalized === 'no' || normalized === '0') return false
    }
  }
  return false
}

function uniqueStrings(...values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}
