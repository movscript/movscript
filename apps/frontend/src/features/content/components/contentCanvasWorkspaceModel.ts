import type { ContentCanvasGraph, ContentCanvasNode, OpenCutTimelineDocumentLike, OpenCutTimelineElementLike } from '../domain/contentCanvasTypes'
import type { CandidateDecision, CandidateSelections, RadialNode, SettingKind, TimelineItem, TimelineTrack, TimelineTrackKind, TreeNodeData } from './contentCanvasWorkspaceTypes'
import { contentCanvasCodeForKind, contentCanvasGraphIndex } from './contentCanvasWorkspaceGraphModel'

export {
  clampCanvasZoom,
  clampRadialCoordinate,
  clampRadialYCoordinate,
  contentCanvasGraphIndex,
  emptyContentCanvasGraph,
  iconForContentNode,
  mergeSceneSettingGroups,
  radialNodeFromContentNode,
  radialNodesAround,
  radialPoint,
  reconcileContentCanvasInspectorSelection,
  sceneSettingGroupFromNode,
  sceneSettingGroupsUsedByScene,
  selectedSelectionId,
  SCENE_MAIN_NODE,
} from './contentCanvasWorkspaceGraphModel'

export function contentCanvasStructureTree(graph: ContentCanvasGraph, activeSceneId?: string, activeProductionId?: string): TreeNodeData[] {
  const productions = graph.nodes.filter((node) => node.kind === 'production')
  const segments = graph.nodes.filter((node) => node.kind === 'segment')
  const scenes = graph.nodes.filter((node) => node.kind === 'scene_moment')
  const childrenBySource = new Map<string, ContentCanvasNode[]>()
  for (const edge of graph.edges) {
    if (edge.kind !== 'hierarchy' && edge.type !== 'contains') continue
    const child = graph.nodes.find((node) => node.id === edge.target)
    if (child) appendMapArray(childrenBySource, edge.source, child)
  }
  const roots = productions.length ? productions : segments.length ? segments : scenes
  return roots.map((node) => structureNodeFromContentNode(node, childrenBySource, activeSceneId, activeProductionId))
}

function structureNodeFromContentNode(
  node: ContentCanvasNode,
  childrenBySource: Map<string, ContentCanvasNode[]>,
  activeSceneId?: string,
  activeProductionId?: string,
): TreeNodeData {
  const children = (childrenBySource.get(node.id) ?? [])
    .filter((child) => child.kind === 'segment' || child.kind === 'scene_moment')
    .map((child) => structureNodeFromContentNode(child, childrenBySource, activeSceneId, activeProductionId))
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    meta: `${node.kind} · ${node.subtitle}`,
    code: contentCanvasCodeForKind(node.kind),
    tone: node.kind === 'segment' ? 'violet' : 'blue',
    active: node.id === activeSceneId || node.id === activeProductionId,
    children,
  }
}

function appendMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

export function sceneTimelineItemsFromGraph(
  scene: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
): TimelineTrack[] {
  const candidates = (graphIndex.connectedByNodeId.get(scene.id) ?? [])
    .filter((node) => node.kind === 'expression_unit' || node.kind === 'content_unit' || node.kind === 'shot' || node.kind === 'audio_cue')
  const buckets: Record<TimelineTrackKind, ContentCanvasNode[]> = {
    audio: [],
    video: [],
    subtitle: [],
  }
  for (const node of candidates) {
    buckets[timelineTrackKindForNode(node)].push(node)
  }
  return ([
    { kind: 'audio', label: '音频', items: timelineItemsFromNodes(buckets.audio) },
    { kind: 'video', label: '视频', items: timelineItemsFromNodes(buckets.video) },
    { kind: 'subtitle', label: '字幕', items: timelineItemsFromNodes(buckets.subtitle) },
  ] satisfies TimelineTrack[]).filter((track) => track.items.length > 0)
}

export function timelineItemsFromOpenCutDocument(document: OpenCutTimelineDocumentLike | undefined): TimelineTrack[] {
  if (document?.schema !== 'opencut.timeline.v1') return []
  const scenes = document.project?.scenes ?? []
  const scene = scenes.find((candidate) => candidate.id && candidate.id === document.project?.currentSceneId) ?? scenes[0]
  if (!scene) return []
  const duration = Math.max(
    12,
    numberField(document.project?.metadata?.duration) ?? 0,
    ...scene.tracks?.flatMap((track) => (track.elements ?? []).map((element) =>
      (numberField(element.startTime) ?? 0) + (numberField(element.duration) ?? 0),
    )) ?? [],
  )
  const tracks: TimelineTrack[] = []
  for (const track of scene.tracks ?? []) {
    if (track.hidden === true) continue
    const kind = timelineTrackKindForOpenCutTrack(track.type)
    if (!kind) continue
    const items = (track.elements ?? [])
      .filter((element) => element.hidden !== true)
      .map((element, index) => timelineItemFromOpenCutElement(element, `${track.id ?? kind}_${index}`, duration))
      .filter((item): item is TimelineItem => item !== undefined)
      .sort((left, right) => (left.startSec ?? 0) - (right.startSec ?? 0) || left.id.localeCompare(right.id))
    if (items.length > 0) {
      tracks.push({
        kind,
        label: timelineTrackLabel(kind),
        items,
      })
    }
  }
  return tracks.sort((left, right) => timelineTrackRank(left.kind) - timelineTrackRank(right.kind))
}

function timelineItemFromOpenCutElement(
  element: OpenCutTimelineElementLike,
  fallbackId: string,
  totalDuration: number,
): TimelineItem | undefined {
  const kind = timelineTrackKindForOpenCutElement(element.type)
  if (!kind) return undefined
  const startSec = numberField(element.startTime) ?? 0
  const durationSec = Math.max(0.1, numberField(element.duration) ?? 4)
  const movscript = element.metadata?.movscript
  return {
    id: element.id ?? fallbackId,
    title: element.name?.trim() || element.id || fallbackId,
    type: kind === 'subtitle' ? 'text' : kind,
    startSec,
    durationSec,
    trimStartSec: numberField(element.trimStart),
    trimEndSec: numberField(element.trimEnd),
    resourceId: numberField(movscript?.resourceId),
    contentUnitId: movscript?.contentUnitId !== undefined ? String(movscript.contentUnitId) : undefined,
    status: movscript?.stale === true ? 'stale' : movscript?.selected === true ? 'selected' : numberField(movscript?.resourceId) !== undefined ? 'ready' : 'missing',
    start: Math.min(94, Math.max(2, (startSec / totalDuration) * 94 + 2)),
    width: Math.max(6, Math.min(96, (durationSec / totalDuration) * 94)),
  }
}

function timelineTrackKindForOpenCutTrack(type: string | undefined): TimelineTrackKind | undefined {
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'text') return 'subtitle'
  return undefined
}

function timelineTrackKindForOpenCutElement(type: string | undefined): TimelineTrackKind | undefined {
  if (type === 'video' || type === 'image') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'text') return 'subtitle'
  return undefined
}

function timelineTrackLabel(kind: TimelineTrackKind): string {
  if (kind === 'audio') return '音频'
  if (kind === 'subtitle') return '字幕'
  return '视频'
}

function timelineTrackRank(kind: TimelineTrackKind): number {
  if (kind === 'audio') return 0
  if (kind === 'video') return 1
  return 2
}

function timelineItemsFromNodes(nodes: ContentCanvasNode[]): TimelineItem[] {
  const items = nodes.slice(0, 8)
  const timelineItems = items.map((node, index) => timelineItemFromNode(node, index))
  const duration = Math.max(12, ...timelineItems.map((item) => (item.startSec ?? 0) + (item.durationSec ?? 4)))
  return timelineItems.map((item) => ({
    ...item,
    start: Math.min(92, Math.max(2, ((item.startSec ?? 0) / duration) * 94 + 2)),
    width: Math.max(8, Math.min(94, ((item.durationSec ?? 4) / duration) * 94)),
  }))
}

function timelineTrackKindForNode(node: ContentCanvasNode): TimelineTrackKind {
  if (node.kind === 'audio_cue') return 'audio'
  if (node.kind === 'shot') return 'video'
  const value = `${node.kind} ${node.subtitle} ${stringField(
    node.record,
    'expression_type',
    'expression_unit_type',
    'content_unit_type',
    'output_kind',
    'outputKind',
    'kind',
    'type',
  )}`.toLowerCase()
  if (value.includes('subtitle') || value.includes('caption') || value.includes('字幕')) return 'subtitle'
  if (value.includes('audio') || value.includes('voice') || value.includes('dialogue') || value.includes('sound') || value.includes('music') || value.includes('声音') || value.includes('音频')) return 'audio'
  return 'video'
}

function timelineItemFromNode(node: ContentCanvasNode, index: number): TimelineItem {
  const timing = recordField(node.record.timing_intent)
    ?? recordField(node.record.timing)
    ?? recordField(node.generationTask?.record.timing_intent)
    ?? recordField(node.generationTask?.record.timing)
  const selected = node.generationTask?.selectedCandidate ?? node.candidates.find((candidate) => candidate.selected)
  const durationSec = numberField(timing?.duration_sec ?? timing?.durationSec)
    ?? durationFromInOut(timing)
    ?? numberField(selected?.resourceKind === 'video' ? node.record.duration_sec : undefined)
    ?? 4
  const startSec = numberField(timing?.timeline_start_sec ?? timing?.timelineStartSec ?? timing?.start_time_sec ?? timing?.startTimeSec) ?? index * durationSec
  return {
    id: node.id,
    title: node.title,
    type: node.kind,
    width: 18,
    start: 2,
    startSec,
    durationSec,
    trimStartSec: numberField(timing?.trim_start_sec ?? timing?.trimStartSec ?? timing?.in_sec ?? timing?.start_sec),
    trimEndSec: numberField(timing?.trim_end_sec ?? timing?.trimEndSec),
    resourceId: selected?.resourceId,
    status: timelineStatusForNode(node),
    contentUnitId: node.kind === 'content_unit' ? node.entityKey : node.generationTask?.id,
  }
}

function timelineStatusForNode(node: ContentCanvasNode): TimelineItem['status'] {
  const status = node.generationTask?.status
  if (status === 'selected' || status === 'stale' || status === 'needs_candidate') return status
  if (node.status === 'missing') return 'missing'
  return node.candidates.some((candidate) => candidate.selected) ? 'selected' : 'ready'
}

function durationFromInOut(timing: Record<string, unknown> | undefined): number | undefined {
  const start = numberField(timing?.start_sec ?? timing?.startSec ?? timing?.in_sec ?? timing?.inSec)
  const end = numberField(timing?.end_sec ?? timing?.endSec ?? timing?.out_sec ?? timing?.outSec)
  if (start === undefined || end === undefined || end <= start) return undefined
  return end - start
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

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
  return stringField(node.record, 'prompt', 'prompt_text', 'generation_prompt', 'description') || node.summary
}

export function candidatesForNode(node: ContentCanvasNode | undefined) {
  return node?.generationTask?.candidates ?? node?.candidates ?? []
}

export function selectedCandidateForNode(node: ContentCanvasNode | undefined, candidateSelections: CandidateSelections) {
  const candidates = candidatesForNode(node)
  if (!node || candidates.length === 0) return undefined
  const selectedId = candidateSelections[node.id]
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
  const hasExplicitSelection = Boolean(candidateSelections[node.id]) || candidates.some((candidate) => candidate.selected)
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

type NodeMediaKind = 'image' | 'video' | 'audio' | 'text' | 'board' | 'keyframe' | 'scene' | 'unknown'

export function mediaKindForNode(node: ContentCanvasNode | undefined): NodeMediaKind {
  if (!node) return 'unknown'
  if (node.kind === 'scene_moment') return 'scene'
  if (node.kind === 'storyboard') return 'board'
  if (node.kind === 'keyframe') return 'keyframe'
  if (node.kind === 'audio_cue') return 'audio'
  if (node.kind === 'shot') return 'video'
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
    || node.source?.kind === 'shot'
    || node.source?.kind === 'storyboard'
    || node.source?.kind === 'keyframe'
    || node.source?.kind === 'audio_cue'
    || node.variant === 'expression'
    || node.variant === 'shot'
    || node.variant === 'storyboard'
    || node.variant === 'keyframe'
}

export function appendAssetReferenceToPrompt(prompt: string, asset: ContentCanvasNode) {
  const token = `{{asset:${asset.entityKey || asset.id}}}`
  if (prompt.includes(token)) return prompt
  return [prompt.trim(), token].filter(Boolean).join('\n')
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
