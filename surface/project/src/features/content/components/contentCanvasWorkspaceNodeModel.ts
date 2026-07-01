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
  const value = `${node.kind} ${node.subtitle} ${node.generationTask?.outputKind ?? ''} ${node.generationTask?.contentUnitType ?? ''} ${stringField(
    node.record,
    'media_kind',
    'mediaKind',
    'resource_kind',
    'resourceKind',
    'mime_type',
    'mimeType',
    'output_kind',
    'outputKind',
    'content_unit_type',
    'contentUnitType',
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

export type ContentCanvasGenerationReference = {
  id?: string
  kind?: string
  ref?: string | number
  raw?: string
  resource_id?: number
  media_type?: string
  role?: string
  source_ref?: string
  label?: string
  source?: string
}

export function generationReferencesFromContentNode(node: ContentCanvasNode | undefined): ContentCanvasGenerationReference[] {
  if (!node) return []
  return [
    ...generationReferencesFromValue(node.record.generation_references ?? node.record.generationReferences),
    ...generationReferenceAssetsFromValue(node.record.reference_assets ?? node.record.referenceAssets),
  ]
}

export function upsertContentNodeGenerationReference(
  current: readonly ContentCanvasGenerationReference[],
  sourceNode: ContentCanvasNode,
  options: { role?: string; mediaType?: string } = {},
): ContentCanvasGenerationReference[] {
  const nextReference = contentNodeGenerationReference(sourceNode, options)
  const key = generationReferenceKey(nextReference)
  const withoutExisting = current.filter((reference) => generationReferenceKey(reference) !== key)
  return [...withoutExisting, nextReference]
}

export function contentNodeGenerationReference(
  node: ContentCanvasNode,
  options: { role?: string; mediaType?: string } = {},
): ContentCanvasGenerationReference {
  const kind = promptReferenceKindForNode(node)
  const resourceId = kind === 'resource'
    ? resourceIdFromReferenceValue(numberField(node.record, 'resource_id', 'resourceId', 'id', 'ID'))
      ?? resourceIdFromReferenceValue(stringField(node.record, 'resource_id', 'resourceId', 'id', 'ID'))
      ?? resourceIdFromReferenceValue(node.entityKey)
      ?? resourceIdFromReferenceValue(node.id)
    : undefined
  const entityRef = kind === 'resource'
    ? undefined
    : promptEntityRefFromReferenceValue(node.entityKey || node.id, kind)
  const mediaType = options.mediaType ?? mediaTypeForContentNodeReference(node)
  const role = options.role ?? defaultGenerationReferenceRole(mediaType)
  return {
    id: `${kind}:${(resourceId ?? entityRef) || node.id}`,
    kind,
    ...(kind === 'resource'
      ? resourceId !== undefined
        ? { ref: resourceId, resource_id: resourceId }
        : { ref: node.entityKey || node.id }
      : { ref: (entityRef ?? node.entityKey) || node.id }),
    ...(mediaType ? { media_type: mediaType } : {}),
    ...(role ? { role } : {}),
    label: node.title,
    source: 'content_canvas',
  }
}

function generationReferencesFromValue(value: unknown): ContentCanvasGenerationReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ContentCanvasGenerationReference[] => {
    if (!isRecord(item)) return []
    const raw = optionalStringField(item, 'raw')
    const sourceRef = optionalStringField(item, 'source_ref', 'sourceRef')
    const rawReference = parsePromptReferenceValue(raw ?? sourceRef)
    const explicitKind = optionalStringField(item, 'kind', 'ref_kind', 'refKind', 'type')
    const targetRef = optionalStringField(item, 'ref', 'target_ref', 'targetRef')
      ?? numberField(item, 'ref', 'target_ref', 'targetRef')
    const resourceId = resourceIdFromReferenceValue(numberField(item, 'resource_id', 'resourceId', 'ID'))
      ?? resourceIdFromReferenceValue(optionalStringField(item, 'resource_id', 'resourceId', 'ID'))
      ?? resourceIdFromReferenceValue(targetRef)
      ?? resourceIdFromReferenceValue(rawReference?.kind === 'resource' ? rawReference.token : undefined)
      ?? resourceIdFromReferenceValue(optionalStringField(item, 'id'))
    const kind = explicitKind ?? rawReference?.kind ?? (resourceId !== undefined ? 'resource' : undefined)
    const ref = kind === 'resource' ? resourceId : promptEntityRefFromReferenceValue(targetRef ?? rawReference?.token, kind)
    const reference = pruneUndefined({
      id: optionalStringField(item, 'id'),
      kind,
      ref,
      raw,
      resource_id: resourceId,
      media_type: optionalStringField(item, 'media_type', 'mediaType') ?? rawReference?.mediaType,
      role: optionalStringField(item, 'role') ?? rawReference?.role,
      source_ref: sourceRef,
      label: optionalStringField(item, 'label', 'title'),
      source: optionalStringField(item, 'source'),
    })
    return Object.keys(reference).length ? [reference] : []
  })
}

function generationReferenceAssetsFromValue(value: unknown): ContentCanvasGenerationReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ContentCanvasGenerationReference[] => {
    if (!isRecord(item)) return []
    const sourceRef = optionalStringField(item, 'source_ref', 'sourceRef')
    const resourceId = resourceIdFromReferenceValue(numberField(item, 'resource_id', 'resourceId', 'ID'))
      ?? resourceIdFromReferenceValue(optionalStringField(item, 'resource_id', 'resourceId', 'ID'))
      ?? resourceIdFromReferenceValue(optionalStringField(item, 'ref', 'target_ref', 'targetRef'))
      ?? resourceIdFromReferenceValue(sourceRef)
      ?? resourceIdFromReferenceValue(optionalStringField(item, 'id'))
    if (resourceId === undefined) return []
    return [{
      id: `resource:${resourceId}`,
      kind: 'resource',
      ref: resourceId,
      resource_id: resourceId,
      media_type: optionalStringField(item, 'media_type', 'mediaType'),
      role: optionalStringField(item, 'role'),
      source_ref: sourceRef,
      source: 'reference_assets_compat',
    }]
  })
}

function generationReferenceKey(reference: ContentCanvasGenerationReference): string {
  return [
    reference.kind ?? '',
    reference.resource_id ?? reference.ref ?? reference.id ?? '',
    reference.media_type ?? '',
  ].join(':')
}

type ContentPromptReferenceKind = 'asset' | 'candidate' | 'resource' | 'keyframe' | 'storyboard' | 'scene_moment' | 'expression_unit' | 'content_unit'

const PROMPT_REFERENCE_VALUE_RE = /\{\{\s*(asset|candidate|resource|keyframe|storyboard|scene_moment|expression_unit|content_unit):{1,2}\s*([^}]+?)\s*\}\}/i

function promptReferenceKindForNode(node: ContentCanvasNode): ContentPromptReferenceKind {
  if (node.kind === 'keyframe') return 'keyframe'
  if (node.kind === 'storyboard') return 'storyboard'
  if (node.kind === 'candidate') return 'candidate'
  if (node.kind === 'resource') return 'resource'
  if (node.kind === 'scene_moment') return 'scene_moment'
  if (node.kind === 'expression_unit') return 'expression_unit'
  if (node.kind === 'content_unit') return 'content_unit'
  return 'asset'
}

function mediaTypeForContentNodeReference(node: ContentCanvasNode): string | undefined {
  const text = `${node.kind} ${node.subtitle} ${stringField(node.record, 'kind', 'resource_kind', 'resourceKind', 'media_type', 'mediaType', 'output_kind', 'outputKind', 'mime_type', 'mimeType')}`.toLowerCase()
  if (text.includes('video')) return 'video'
  if (text.includes('audio')) return 'audio'
  if (text.includes('image') || text.includes('storyboard') || text.includes('keyframe') || node.kind === 'asset') return 'image'
  return undefined
}

function defaultGenerationReferenceRole(mediaType: string | undefined): string | undefined {
  if (mediaType === 'video') return 'reference_video'
  if (mediaType === 'audio') return 'reference_audio'
  if (mediaType === 'image') return 'reference_image'
  return undefined
}

function numberFromString(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function resourceIdFromReferenceValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const direct = numberFromString(text)
  if (direct !== undefined) return direct
  const modernMention = text.match(/@\[resource:([^\]\s]+)\]/i)
  if (modernMention) return numberFromString(modernMention[1]?.split(':').filter(Boolean).at(-1))
  const legacyMention = text.match(/\[\[resource::(\d+)\]\]/i)
  if (legacyMention) return numberFromString(legacyMention[1])
  const promptMention = text.match(/\{\{\s*resource:{1,2}\s*([^}\s]+)(?:\s[^}]*)?\s*\}\}/i)
  if (promptMention) return numberFromString(promptMention[1])
  const internalRef = text.match(/^resource(?:::|:)(\d+)$/i)
  if (internalRef) return numberFromString(internalRef[1])
  return undefined
}

function promptEntityRefFromReferenceValue(value: unknown, kind: string | undefined): string | number | undefined {
  if (value === undefined || value === null || kind === 'resource') return undefined
  if (typeof value === 'number') return value
  const text = String(value).trim()
  if (!text) return undefined
  return kind ? text.replace(new RegExp(`^${kind}(?:::|:)`, 'i'), '') : text
}

function parsePromptReferenceValue(value: string | undefined): {
  kind: ContentPromptReferenceKind
  token: string
  mediaType?: string
  role?: string
} | undefined {
  if (!value) return undefined
  const resourceMention = value.match(/@\[resource:([^\]\s]+)\]/i)
  if (resourceMention) {
    const payload = parseResourceMentionPayload(resourceMention[1])
    if (!payload.token) return undefined
    return {
      kind: 'resource',
      token: payload.token,
      ...(payload.mediaType ? { mediaType: payload.mediaType } : {}),
      ...(payload.role ? { role: payload.role } : {}),
    }
  }
  const promptRef = value.match(PROMPT_REFERENCE_VALUE_RE)
  if (promptRef) {
    const kind = promptRef[1] as ContentPromptReferenceKind | undefined
    const payload = parsePromptReferencePayloadValue(promptRef[2])
    if (!kind || !payload.token) return undefined
    return {
      kind,
      token: payload.token,
      ...(payload.mediaType ? { mediaType: payload.mediaType } : {}),
      ...(payload.role ? { role: payload.role } : {}),
    }
  }
  const legacyResource = value.match(/\[\[resource::(\d+)\]\]/i)
  if (legacyResource?.[1]) return { kind: 'resource', token: legacyResource[1] }
  return undefined
}

function parseResourceMentionPayload(value: string | undefined): { token: string; mediaType?: string; role?: string } {
  const parts = String(value ?? '').split(':').map(normalizeReferenceMetadataPart).filter(Boolean)
  const token = parts.at(-1) ?? ''
  if (!numberFromString(token)) return { token: '' }
  const descriptors = parts.slice(0, -1)
  const mediaTypes = new Set(['image', 'video', 'audio', 'text', 'any', 'file'])
  const first = descriptors[0] ?? ''
  const mediaType = mediaTypes.has(first) ? first : ''
  const role = mediaType ? descriptors.slice(1).join(':') : descriptors.join(':')
  return {
    token,
    ...(mediaType ? { mediaType } : {}),
    ...(role ? { role } : {}),
  }
}

function parsePromptReferencePayloadValue(value: string | undefined): { token: string; mediaType?: string; role?: string } {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  const token = parts.shift() ?? ''
  let mediaType = ''
  let role = ''
  for (const part of parts) {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=(.+)$/)
    if (!match) continue
    const key = normalizeReferenceMetadataPart(match[1])
    const metadataValue = normalizeReferenceMetadataPart(match[2])
    if (!metadataValue) continue
    if (key === 'role') role = metadataValue
    if (key === 'media' || key === 'media_type' || key === 'mediatype') mediaType = metadataValue
  }
  return {
    token,
    ...(mediaType ? { mediaType } : {}),
    ...(role ? { role } : {}),
  }
}

function normalizeReferenceMetadataPart(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/^['"]|['"]$/g, '').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
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

function optionalStringField(record: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  const value = stringField(record, ...keys)
  return value || undefined
}

function numberField(record: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim())
      if (Number.isInteger(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

function recordField(record: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
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
