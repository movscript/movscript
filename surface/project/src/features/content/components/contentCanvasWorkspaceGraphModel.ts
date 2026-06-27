import { Box, Building2, CircleDot, FileImage, Film, Image, KeyRound, Palette, Rows3, ScrollText, Shirt, SquareStack, Star, TextCursorInput, UserRound, WandSparkles, type LucideIcon } from 'lucide-react'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import {
  contentCanvasKindCode,
  contentCanvasNodeDisplayCode,
} from '../domain/contentCanvasDomainPolicy'
import { CANVAS_WORLD_HEIGHT, CANVAS_WORLD_WIDTH, SCENE_RELATION_RADIUS_X, SCENE_RELATION_RADIUS_Y, type InspectorSelection, type InspectorSelectionRef, type RadialNode, type SceneSettingGroup } from './contentCanvasWorkspaceTypes'

export const SCENE_MAIN_NODE: RadialNode = {
  id: 'scene-main',
  code: 'SCN',
  title: '未选择情节',
  description: '请选择一个 Scene Moment',
  x: 0,
  y: 0,
  Icon: Film,
  variant: 'primary',
}

export function selectedSelectionId(selection: InspectorSelection) {
  if (selection.kind === 'setting') return selection.setting.id
  if (
    selection.kind === 'create_expression_unit'
    || selection.kind === 'create_keyframe'
    || selection.kind === 'create_storyboard'
    || selection.kind === 'create_state'
    || selection.kind === 'create_asset'
  ) return selection.parent.id
  return selection.node.id
}

export function reconcileContentCanvasInspectorSelection(input: {
  selection: InspectorSelectionRef
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>
  sceneMainNode: RadialNode
  settingMainNode?: RadialNode | null
}): InspectorSelection {
  const { graphIndex, sceneMainNode, selection, settingMainNode } = input
  if (selection.kind === 'setting') {
    const setting = graphIndex.nodeById.get(selection.nodeId)
    return setting?.kind === 'setting' ? { kind: 'setting', setting } : fallbackContentCanvasInspectorSelection(sceneMainNode, settingMainNode)
  }

  const selectedId = selection.nodeId
  if (selectedId === sceneMainNode.id) return { kind: 'scene_moment', node: sceneMainNode }
  if (settingMainNode && selectedId === settingMainNode.id) {
    const setting = settingMainNode.source ?? graphIndex.nodeById.get(settingMainNode.id)
    return setting?.kind === 'setting' ? { kind: 'setting', setting } : fallbackContentCanvasInspectorSelection(sceneMainNode, settingMainNode)
  }

  const node = graphIndex.nodeById.get(selectedId)
  if (!node) return fallbackContentCanvasInspectorSelection(sceneMainNode, settingMainNode)
  const radialNode = radialNodeFromContentNode(node, 0, 0, radialVariantForKind(node.kind))
  if (node.kind === 'scene_moment') return { kind: 'scene_moment', node: radialNode }
  if (node.kind === 'setting') return { kind: 'setting', setting: node }
  if (node.kind === 'state') return { kind: 'state', node: radialNode }
  if (node.kind === 'asset') return { kind: 'asset', node: radialNode }
  return { kind: 'other', node: radialNode }
}

function fallbackContentCanvasInspectorSelection(sceneMainNode: RadialNode, settingMainNode?: RadialNode | null): InspectorSelection {
  if (sceneMainNode.id !== SCENE_MAIN_NODE.id) return { kind: 'scene_moment', node: sceneMainNode }
  if (settingMainNode?.source?.kind === 'setting') return { kind: 'setting', setting: settingMainNode.source }
  return { kind: 'scene_moment', node: sceneMainNode }
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

export function emptyContentCanvasWorkspaceSnapshot(): ContentCanvasWorkspaceSnapshot {
  return { nodes: [], edges: [] }
}

export function contentCanvasWorkspaceIndex(graph: ContentCanvasWorkspaceSnapshot) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const connectedByNodeId = new Map<string, ContentCanvasNode[]>()
  const childNodesByHierarchy = new Map<string, ContentCanvasNode[]>()
  const edgesByNodeId = new Map<string, ContentCanvasEdge[]>()
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    appendMapArray(connectedByNodeId, edge.source, target)
    appendMapArray(connectedByNodeId, edge.target, source)
    if (edge.kind === 'hierarchy') appendMapArray(childNodesByHierarchy, edge.source, target)
    appendMapArray(edgesByNodeId, edge.source, edge)
    appendMapArray(edgesByNodeId, edge.target, edge)
  }
  return { nodeById, connectedByNodeId, childNodesByHierarchy, edgesByNodeId }
}

function appendMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

export function radialNodesAround(
  main: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
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

function assetsForStateCount(graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>, stateId: string) {
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
    code: contentCanvasNodeDisplayCode(node),
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
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  position: ContentCanvasNodePosition,
): SceneSettingGroup {
  const states = (graphIndex.childNodesByHierarchy.get(setting.id) ?? [])
    .filter((node) => node.kind === 'state')
    .map((state) => ({
      state,
      assets: (graphIndex.childNodesByHierarchy.get(state.id) ?? []).filter((node) => node.kind === 'asset'),
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
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
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
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
) {
  const scopedKinds = new Set<ContentCanvasNodeKind>(['scene_moment', 'expression_unit', 'storyboard', 'keyframe', 'content_unit', 'audio_cue'])
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
  return relation === 'expression_unit_content_unit'
    || relation === 'expression_unit_storyboard'
    || relation === 'content_unit_keyframe'
    || relation === 'content_unit_storyboard'
    || relation === 'audio_cue_storyboard'
}

function parentStateForAsset(
  assetId: string,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
) {
  for (const edge of graphIndex.edgesByNodeId.get(assetId) ?? []) {
    const otherId = edge.source === assetId ? edge.target : edge.source
    const other = graphIndex.nodeById.get(otherId)
    if (other?.kind === 'state' && edge.kind === 'hierarchy') return other
  }
  return undefined
}

function parentSettingForState(
  stateId: string,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
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

export function contentCanvasCodeForKind(kind: ContentCanvasNodeKind) {
  return contentCanvasKindCode(kind)
}
