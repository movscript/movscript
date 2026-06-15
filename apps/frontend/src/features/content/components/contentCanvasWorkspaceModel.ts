import { Box, Building2, CircleDot, FileImage, Film, Image, KeyRound, Palette, Rows3, ScrollText, Shirt, Sparkles, SquareStack, Star, TextCursorInput, UserRound, Video, WandSparkles, type LucideIcon } from 'lucide-react'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import { CANVAS_WORLD_HEIGHT, CANVAS_WORLD_WIDTH, SCENE_RELATION_RADIUS_X, SCENE_RELATION_RADIUS_Y, type CandidateSelections, type InspectorSelection, type RadialNode, type SceneSettingGroup, type SettingKind, type TimelineItem, type TimelineTrack, type TimelineTrackKind, type TreeNodeData } from './contentCanvasWorkspaceTypes'

export const SCENE_MAIN_NODE: RadialNode = {
  id: 'scene-main',
  code: 'SCN',
  title: '电话打断告白',
  description: 'scene_moment 主节点',
  x: 0,
  y: 0,
  Icon: Film,
  variant: 'primary',
}

export function selectedSelectionId(selection: InspectorSelection) {
  if (selection.kind === 'setting') return selection.setting.id
  return selection.node.id
}

export function clampRadialCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.round(value), -CANVAS_WORLD_WIDTH / 2 + 76), CANVAS_WORLD_WIDTH / 2 - 76)
}

export function clampRadialYCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.round(value), -CANVAS_WORLD_HEIGHT / 2 + 46), CANVAS_WORLD_HEIGHT / 2 - 46)
}

export function clampCanvasZoom(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.round(value * 100) / 100, 0.5), 1.8)
}

export function emptyContentCanvasGraph(): ContentCanvasGraph {
  return { nodes: [], edges: [] }
}

export function contentCanvasGraphIndex(graph: ContentCanvasGraph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const connectedByNodeId = new Map<string, ContentCanvasNode[]>()
  const edgesByNodeId = new Map<string, ContentCanvasEdge[]>()
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    appendMapArray(connectedByNodeId, edge.source, target)
    appendMapArray(connectedByNodeId, edge.target, source)
    appendMapArray(edgesByNodeId, edge.source, edge)
    appendMapArray(edgesByNodeId, edge.target, edge)
  }
  return { nodeById, connectedByNodeId, edgesByNodeId }
}

function appendMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

export function radialNodesAround(
  main: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
  allowedKinds: ContentCanvasNodeKind[],
): RadialNode[] {
  if (main.kind === 'setting') {
    const states = (graphIndex.connectedByNodeId.get(main.id) ?? [])
      .filter((node) => node.kind === 'state')
      .slice(0, 8)
    return states.flatMap((state, stateIndex) => {
      const statePoint = radialPoint(stateIndex, states.length, 180, 118, -Math.PI / 18)
      const stateNode = radialNodeFromContentNode(state, statePoint.x, statePoint.y, 'state')
      const assets = (graphIndex.connectedByNodeId.get(state.id) ?? [])
        .filter((node) => node.kind === 'asset')
        .slice(0, 4)
        .map((asset, assetIndex) => {
          const assetPoint = childRadialPoint(
            statePoint,
            assetIndex,
            assetsForStateCount(graphIndex, state.id),
            statePoint.x >= 0 ? 0 : Math.PI,
          )
          return {
            ...radialNodeFromContentNode(asset, assetPoint.x, assetPoint.y, 'asset'),
            parentId: state.id,
          }
        })
      return [stateNode, ...assets]
    })
  }
  const allowed = new Set<ContentCanvasNodeKind>(allowedKinds)
  const direct = graphIndex.connectedByNodeId.get(main.id) ?? []
  const expanded = direct.flatMap((node) => {
    if (allowed.has(node.kind)) return [node]
    if (main.kind === 'scene_moment' && node.kind === 'shot') {
      return [
        node,
        ...(graphIndex.connectedByNodeId.get(node.id) ?? []).filter((child) => allowed.has(child.kind)),
      ]
    }
    if (main.kind === 'setting' && node.kind === 'state') {
      return [
        node,
        ...(graphIndex.connectedByNodeId.get(node.id) ?? []).filter((child) => allowed.has(child.kind)),
      ]
    }
    return []
  })
  const unique = [...new Map(expanded.filter((node) => node.id !== main.id).map((node) => [node.id, node])).values()]
  return unique.slice(0, 10).map((node, index, items) => {
    const point = main.kind === 'scene_moment'
      ? radialPoint(index, items.length, SCENE_RELATION_RADIUS_X, SCENE_RELATION_RADIUS_Y)
      : radialPoint(index, items.length)
    return radialNodeFromContentNode(node, point.x, point.y, radialVariantForKind(node.kind))
  })
}

function assetsForStateCount(graphIndex: ReturnType<typeof contentCanvasGraphIndex>, stateId: string) {
  return Math.max(1, (graphIndex.connectedByNodeId.get(stateId) ?? []).filter((node) => node.kind === 'asset').length)
}

export function radialPoint(index: number, total: number, radiusX = 250, radiusY = 160, startAngle = -Math.PI / 2) {
  const angle = ((Math.PI * 2) / Math.max(total, 1)) * index + startAngle
  return {
    x: Math.round(Math.cos(angle) * radiusX),
    y: Math.round(Math.sin(angle) * radiusY),
  }
}

function childRadialPoint(parent: { x: number; y: number }, index: number, total: number, startAngle = -Math.PI / 2) {
  const spread = Math.min(Math.PI, (Math.PI * 2) / Math.max(total, 1))
  const angle = total <= 1
    ? startAngle
    : startAngle - spread / 2 + (spread / Math.max(total - 1, 1)) * index
  return {
    x: clampRadialCoordinate(parent.x + Math.cos(angle) * 132),
    y: clampRadialYCoordinate(parent.y + Math.sin(angle) * 82),
  }
}

export function radialNodeFromContentNode(node: ContentCanvasNode, x: number, y: number, variant = radialVariantForKind(node.kind)): RadialNode {
  const Icon = iconForContentNode(node)
  return {
    id: node.id,
    code: codeForKind(node.kind),
    title: node.title,
    description: node.summary || node.subtitle || node.sourcePath,
    x,
    y,
    Icon,
    variant,
    source: node,
  }
}

export function sceneSettingGroupFromNode(
  setting: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
  position: ContentCanvasNodePosition,
): SceneSettingGroup {
  const states = (graphIndex.connectedByNodeId.get(setting.id) ?? [])
    .filter((node) => node.kind === 'state')
    .slice(0, 8)
    .map((state) => ({
      state,
      assets: (graphIndex.connectedByNodeId.get(state.id) ?? [])
        .filter((node) => node.kind === 'asset')
        .slice(0, 6),
    }))
  return {
    id: `scene-setting-group:${setting.id}`,
    setting,
    states,
    x: clampRadialCoordinate(position.x),
    y: clampRadialYCoordinate(position.y),
  }
}

export function mergeSceneSettingGroups(automaticGroups: SceneSettingGroup[], manualGroups: SceneSettingGroup[]) {
  const groups = new Map<string, SceneSettingGroup>()
  for (const group of automaticGroups) groups.set(group.setting.id, group)
  for (const group of manualGroups) groups.set(group.setting.id, group)
  return [...groups.values()]
}

export function sceneSettingGroupsUsedByScene(
  scene: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
): SceneSettingGroup[] {
  const scopedNodeIds = sceneScopedNodeIds(scene, graphIndex)
  const assetIds = new Set<string>()
  const stateIds = new Set<string>()
  for (const nodeId of scopedNodeIds) {
    for (const edge of graphIndex.edgesByNodeId.get(nodeId) ?? []) {
      const source = graphIndex.nodeById.get(edge.source)
      const target = graphIndex.nodeById.get(edge.target)
      if (edge.relation === 'content_unit_asset' || edge.relation === 'audio_cue_asset') {
        if (source?.kind === 'asset') assetIds.add(source.id)
        if (target?.kind === 'asset') assetIds.add(target.id)
      }
      if (edge.relation === 'setting_state_reference') {
        if (source?.kind === 'state') stateIds.add(source.id)
        if (target?.kind === 'state') stateIds.add(target.id)
      }
    }
  }

  const settings = new Map<string, ContentCanvasNode>()
  for (const assetId of assetIds) {
    const state = parentStateForAsset(assetId, graphIndex)
    if (!state) continue
    const setting = parentSettingForState(state.id, graphIndex)
    if (setting) settings.set(setting.id, setting)
  }
  for (const stateId of stateIds) {
    const setting = parentSettingForState(stateId, graphIndex)
    if (setting) settings.set(setting.id, setting)
  }

  return [...settings.values()].slice(0, 6).map((setting, index, items) => {
    const point = radialPoint(index, items.length, 295, 172, Math.PI / 6)
    return sceneSettingGroupFromNode(setting, graphIndex, point)
  })
}

function sceneScopedNodeIds(
  scene: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  const scopedKinds = new Set<ContentCanvasNodeKind>(['scene_moment', 'expression_unit', 'shot', 'storyboard', 'keyframe', 'content_unit', 'audio_cue'])
  const scoped = new Set<string>([scene.id])
  const queue = [scene.id]
  while (queue.length) {
    const nodeId = queue.shift()
    if (!nodeId) continue
    for (const edge of graphIndex.edgesByNodeId.get(nodeId) ?? []) {
      const nextId = edge.source === nodeId ? edge.target : edge.source
      if (scoped.has(nextId)) continue
      const nextNode = graphIndex.nodeById.get(nextId)
      if (!nextNode || !scopedKinds.has(nextNode.kind)) continue
      if (edge.kind === 'hierarchy' || edge.relation === 'content_unit_scene' || isSceneScopedRelation(edge.relation)) {
        scoped.add(nextId)
        queue.push(nextId)
      }
    }
  }
  return scoped
}

function isSceneScopedRelation(relation: ContentCanvasEdge['relation']) {
  return relation === 'expression_unit_shot'
    || relation === 'expression_unit_storyboard'
    || relation === 'expression_unit_content_unit'
    || relation === 'content_unit_shot'
    || relation === 'content_unit_keyframe'
    || relation === 'content_unit_storyboard'
    || relation === 'audio_cue_shot'
    || relation === 'audio_cue_storyboard'
}

function parentStateForAsset(
  assetId: string,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  for (const edge of graphIndex.edgesByNodeId.get(assetId) ?? []) {
    const otherId = edge.source === assetId ? edge.target : edge.source
    const other = graphIndex.nodeById.get(otherId)
    if (other?.kind === 'state' && (edge.kind === 'hierarchy' || edge.relation === 'setting_state_reference')) return other
  }
  return undefined
}

function parentSettingForState(
  stateId: string,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  for (const edge of graphIndex.edgesByNodeId.get(stateId) ?? []) {
    const otherId = edge.source === stateId ? edge.target : edge.source
    const other = graphIndex.nodeById.get(otherId)
    if (other?.kind === 'setting' && edge.kind === 'hierarchy') return other
  }
  return undefined
}

export function radialVariantForKind(kind: ContentCanvasNodeKind): RadialNode['variant'] {
  if (kind === 'state') return 'state'
  if (kind === 'asset') return 'asset'
  if (kind === 'expression_unit') return 'expression'
  if (kind === 'shot') return 'shot'
  if (kind === 'keyframe') return 'keyframe'
  if (kind === 'storyboard') return 'storyboard'
  return undefined
}

export function iconForContentNode(node: Pick<ContentCanvasNode, 'kind' | 'subtitle'>): LucideIcon {
  if (node.kind === 'scene_moment') return Film
  if (node.kind === 'production') return Box
  if (node.kind === 'segment') return Rows3
  if (node.kind === 'state') return CircleDot
  if (node.kind === 'asset') return Image
  if (node.kind === 'shot') return Video
  if (node.kind === 'storyboard') return FileImage
  if (node.kind === 'keyframe') return KeyRound
  if (node.kind === 'expression_unit') return SquareStack
  if (node.kind === 'content_unit') return TextCursorInput
  if (node.kind === 'audio_cue') return WandSparkles
  if (node.kind === 'setting') {
    const subtype = node.subtitle.toLowerCase()
    if (subtype.includes('character') || subtype.includes('角色')) return UserRound
    if (subtype.includes('location') || subtype.includes('场景')) return Building2
    if (subtype.includes('prop') || subtype.includes('道具')) return Box
    if (subtype.includes('costume') || subtype.includes('服装')) return Shirt
    if (subtype.includes('visual') || subtype.includes('视觉')) return Palette
    if (subtype.includes('rule') || subtype.includes('规则')) return ScrollText
    if (subtype.includes('sound') || subtype.includes('声音')) return WandSparkles
  }
  return Star
}

function codeForKind(kind: ContentCanvasNodeKind) {
  if (kind === 'scene_moment') return 'SCN'
  if (kind === 'production') return 'PRO'
  if (kind === 'segment') return 'SEG'
  if (kind === 'expression_unit') return 'EXP'
  if (kind === 'content_unit') return 'UNIT'
  if (kind === 'storyboard') return 'BOARD'
  if (kind === 'keyframe') return 'KEY'
  return kind.toUpperCase().slice(0, 5)
}

export function contentCanvasStructureTree(graph: ContentCanvasGraph, activeSceneId?: string): TreeNodeData[] {
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
  return roots.map((node) => structureNodeFromContentNode(node, childrenBySource, activeSceneId))
}

function structureNodeFromContentNode(
  node: ContentCanvasNode,
  childrenBySource: Map<string, ContentCanvasNode[]>,
  activeSceneId?: string,
): TreeNodeData {
  const children = (childrenBySource.get(node.id) ?? [])
    .filter((child) => child.kind === 'segment' || child.kind === 'scene_moment')
    .map((child) => structureNodeFromContentNode(child, childrenBySource, activeSceneId))
  return {
    id: node.id,
    title: node.title,
    meta: `${node.kind} · ${node.subtitle}`,
    code: codeForKind(node.kind),
    tone: node.kind === 'segment' ? 'violet' : 'blue',
    active: node.id === activeSceneId,
    children,
  }
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

function timelineItemsFromNodes(nodes: ContentCanvasNode[]): TimelineItem[] {
  const items = nodes.slice(0, 8)
  const width = items.length ? Math.max(10, Math.floor(80 / items.length)) : 18
  return items.map((node, index) => ({
    id: node.id,
    title: node.title,
    type: node.kind,
    width,
    start: Math.min(86, 4 + index * Math.max(10, width)),
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
  return stringField(node.record, 'prompt', 'prompt_text', 'generation_prompt', 'description') || node.summary
}

export function candidatesForNode(node: ContentCanvasNode | undefined) {
  return node?.candidates ?? []
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
  const candidates = candidatesForNode(node)
  if (!node || candidates.length === 0) return ''
  const selectedCandidate = selectedCandidateForNode(node, candidateSelections)
  const selectedLabel = selectedCandidate ? `已选 ${selectedCandidate.title}` : '未选择'
  return `${selectedLabel} · ${candidates.length} 候选`
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
