import type { ContentCanvasWorkspaceSnapshot, ContentCanvasNode, ContentCanvasNodeKind, MediaEditingProjectLike, MediaTimelineClipLike } from '../domain/contentCanvasTypes'
import type { TimelineItem, TimelineTrack, TimelineTrackKind, TreeNodeData } from './contentCanvasWorkspaceTypes'
import { contentCanvasWorkspaceIndex } from './contentCanvasWorkspaceGraphModel'
import { stringField } from './contentCanvasWorkspaceNodeModel'
import {
  contentCanvasNodeDisplayCode,
  contentCanvasNodeDisplayKind,
} from '../domain/contentCanvasDomainPolicy'

export {
  clampCanvasZoom,
  clampRadialCoordinate,
  clampRadialYCoordinate,
  contentCanvasWorkspaceIndex,
  emptyContentCanvasWorkspaceSnapshot,
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
export {
  candidateDecisionForNode,
  candidatesForNode,
  contentStatusLabel,
  generationReferencesFromContentNode,
  isExpressionPromptNode,
  mediaKindForNode,
  mediaKindLabel,
  nodeCandidateBadge,
  promptFromContentNode,
  selectedCandidateForNode,
  settingKindFromNode,
  stringField,
  upsertContentNodeGenerationReference,
  uniqueContentNodes,
  type ContentCanvasGenerationReference,
  type NodeMediaKind,
} from './contentCanvasWorkspaceNodeModel'

const TREE_NAMESPACE_KINDS = new Set<ContentCanvasNodeKind>([
  'production',
  'segment',
  'scene_moment',
  'expression_unit',
  'keyframe',
  'storyboard',
  'audio_cue',
  'setting',
  'state',
  'asset',
])

export function contentCanvasStructureTree(graph: ContentCanvasWorkspaceSnapshot, activeNodeId?: string, activeProductionId?: string): TreeNodeData[] {
  const productions = graph.nodes.filter((node) => node.kind === 'production')
  const segments = graph.nodes.filter((node) => node.kind === 'segment')
  const scenes = graph.nodes.filter((node) => node.kind === 'scene_moment')
  const settings = graph.nodes.filter((node) => node.kind === 'setting')
  const childrenBySource = new Map<string, ContentCanvasNode[]>()
  const childIds = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.kind !== 'hierarchy' && edge.type !== 'contains') continue
    const child = graph.nodes.find((node) => node.id === edge.target)
    if (child && TREE_NAMESPACE_KINDS.has(child.kind)) {
      appendMapArray(childrenBySource, edge.source, child)
      childIds.add(child.id)
    }
  }
  const productionRoots = productions.length ? productions : segments.length ? segments : scenes
  const detachedRoots = graph.nodes.filter((node) => TREE_NAMESPACE_KINDS.has(node.kind) && !childIds.has(node.id) && !productionRoots.some((root) => root.id === node.id) && node.kind !== 'setting')
  const roots = uniqueById([...productionRoots, ...settings, ...detachedRoots])
  return roots.map((node) => structureNodeFromContentNode(node, childrenBySource, activeNodeId, activeProductionId))
}

function structureNodeFromContentNode(
  node: ContentCanvasNode,
  childrenBySource: Map<string, ContentCanvasNode[]>,
  activeNodeId?: string,
  activeProductionId?: string,
): TreeNodeData {
  const children = (childrenBySource.get(node.id) ?? [])
    .filter((child) => TREE_NAMESPACE_KINDS.has(child.kind))
    .map((child) => structureNodeFromContentNode(child, childrenBySource, activeNodeId, activeProductionId))
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    meta: `${contentCanvasNodeDisplayKind(node)} · ${node.subtitle}`,
    code: contentCanvasNodeDisplayCode(node),
    tone: treeToneForNodeKind(node.kind),
    active: node.id === activeNodeId || node.id === activeProductionId,
    children,
  }
}

function treeToneForNodeKind(kind: ContentCanvasNodeKind): string {
  if (kind === 'setting' || kind === 'state' || kind === 'asset') return 'amber'
  if (kind === 'expression_unit' || kind === 'keyframe' || kind === 'storyboard') return 'violet'
  if (kind === 'audio_cue') return 'green'
  return kind === 'segment' ? 'violet' : 'blue'
}

function uniqueById(nodes: ContentCanvasNode[]) {
  return [...new Map(nodes.map((node) => [node.id, node])).values()]
}

function appendMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

export function sceneTimelineItemsFromGraph(
  scene: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): TimelineTrack[] {
  const candidates = uniqueById((graphIndex.connectedByNodeId.get(scene.id) ?? [])
    .filter((node) => node.kind === 'expression_unit' || node.kind === 'content_unit' || node.kind === 'audio_cue'))
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

export function timelineItemsFromMediaEditingProject(project: MediaEditingProjectLike | undefined): TimelineTrack[] {
  if (project?.version !== 1) return []
  const timeline = project.timeline
  if (!timeline) return []
  const duration = Math.max(
    12,
    (numberField(timeline.durationMs) ?? 0) / 1000,
    ...timeline.tracks?.flatMap((track) => (track.clips ?? []).map((clip) =>
      ((numberField(clip.timelineStartMs) ?? 0) + (numberField(clip.durationMs) ?? 0)) / 1000,
    )) ?? [],
  )
  const tracks: TimelineTrack[] = []
  for (const track of timeline.tracks ?? []) {
    if (track.locked === true) continue
    const kind = timelineTrackKindForMediaTrack(track.type)
    if (!kind) continue
    const items = (track.clips ?? [])
      .map((clip, index) => timelineItemFromMediaClip(clip, `${track.id ?? kind}_${index}`, duration))
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

function timelineItemFromMediaClip(
  clip: MediaTimelineClipLike,
  fallbackId: string,
  totalDuration: number,
): TimelineItem | undefined {
  const kind = timelineTrackKindForMediaClip(clip.assetType)
  if (!kind) return undefined
  const startSec = (numberField(clip.timelineStartMs) ?? 0) / 1000
  const durationSec = Math.max(0.1, (numberField(clip.durationMs) ?? 4000) / 1000)
  const sourceStartSec = numberField(clip.sourceStartMs) !== undefined ? numberField(clip.sourceStartMs)! / 1000 : undefined
  const sourceEndSec = numberField(clip.sourceEndMs) !== undefined ? numberField(clip.sourceEndMs)! / 1000 : undefined
  const trimStartSec = sourceStartSec ?? 0
  const movscript = clip.metadata?.movscript
  const resourceId = numberField(clip.asset?.resourceId ?? movscript?.resourceId)
  return {
    id: clip.id ?? fallbackId,
    title: clip.asset?.label?.trim() || clip.text?.content?.trim() || clip.id || fallbackId,
    type: kind === 'subtitle' ? 'text' : kind,
    startSec,
    durationSec,
    trimStartSec: sourceStartSec,
    trimEndSec: sourceEndSec !== undefined ? Math.max(0, sourceEndSec - trimStartSec - durationSec) : undefined,
    resourceId,
    contentUnitId: movscript?.contentUnitId !== undefined ? String(movscript.contentUnitId) : undefined,
    status: movscript?.stale === true ? 'stale' : movscript?.selected === true ? 'selected' : resourceId !== undefined ? 'ready' : 'missing',
    start: Math.min(94, Math.max(2, (startSec / totalDuration) * 94 + 2)),
    width: Math.max(6, Math.min(96, (durationSec / totalDuration) * 94)),
  }
}

function timelineTrackKindForMediaTrack(type: string | undefined): TimelineTrackKind | undefined {
  if (type === 'video') return 'video'
  if (type === 'image') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'text' || type === 'subtitle') return 'subtitle'
  return undefined
}

function timelineTrackKindForMediaClip(type: string | undefined): TimelineTrackKind | undefined {
  if (type === 'video' || type === 'image') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'text' || type === 'subtitle') return 'subtitle'
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

export function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}
