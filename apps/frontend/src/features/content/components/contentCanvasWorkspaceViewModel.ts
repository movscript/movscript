import { buildContentCanvasGraph } from '../domain/contentCanvasGraph'
import type { ContentCanvasProjectData } from '../domain/contentCanvasTypes'
import {
  contentCanvasGraphIndex,
  contentCanvasStructureTree,
  emptyContentCanvasGraph,
  mergeSceneSettingGroups,
  radialNodeFromContentNode,
  radialNodesAround,
  reconcileContentCanvasInspectorSelection,
  sceneSettingGroupsUsedByScene,
  sceneTimelineItemsFromGraph,
  timelineItemsFromMediaEditingProject,
  SCENE_MAIN_NODE,
  settingKindFromNode,
  uniqueContentNodes,
} from './contentCanvasWorkspaceModel'
import type { CanvasMode, InspectorSelectionRef, SceneSettingGroup, SettingKind } from './contentCanvasWorkspaceTypes'

export function buildContentCanvasWorkspaceViewModel({
  projectData,
  activeKind,
  activeProductionId,
  activeSceneId,
  activeSettingId,
  canvasMode,
  manualSceneSettingGroupsBySceneId,
  selection,
  settingQuery,
}: {
  projectData: ContentCanvasProjectData | undefined
  activeKind: SettingKind | 'all'
  activeProductionId: string | null
  activeSceneId: string | null
  activeSettingId: string | null
  canvasMode: CanvasMode
  manualSceneSettingGroupsBySceneId: Record<string, SceneSettingGroup[]>
  selection: InspectorSelectionRef
  settingQuery: string
}) {
  const graph = projectData ? buildContentCanvasGraph(projectData) : emptyContentCanvasGraph()
  const graphIndex = contentCanvasGraphIndex(graph)
  const settingNodes = graph.nodes.filter((node) => node.kind === 'setting')
  const productionNodes = graph.nodes.filter((node) => node.kind === 'production')
  const sceneNodes = graph.nodes.filter((node) => node.kind === 'scene_moment')
  const activeSetting = settingNodes.find((node) => node.id === activeSettingId) ?? settingNodes[0] ?? null
  const activeProduction = productionNodes.find((node) => node.id === activeProductionId) ?? productionNodes[0] ?? null
  const activeScene = sceneNodes.find((node) => node.id === activeSceneId) ?? sceneNodes[0] ?? null
  const sceneMainNode = activeScene ? radialNodeFromContentNode(activeScene, 0, 0, 'primary') : SCENE_MAIN_NODE
  const settingMainNode = activeSetting ? radialNodeFromContentNode(activeSetting, 0, 0, 'primary') : null
  const sceneRelationNodes = activeScene ? radialNodesAround(activeScene, graphIndex, ['expression_unit', 'shot', 'keyframe', 'storyboard', 'audio_cue']) : []
  const settingRelationNodes = activeSetting ? radialNodesAround(activeSetting, graphIndex, ['state', 'asset']) : []
  const tree = contentCanvasStructureTree(graph, activeScene?.id, activeProductionId ?? undefined)
  const mediaProjectTimeline = activeScene ? timelineItemsFromMediaEditingProject(projectData?.editingProjectsByNodeId?.[activeScene.id]) : []
  const productionMediaProjectTimeline = activeProductionId
    ? timelineItemsFromMediaEditingProject(projectData?.editingProjectsByNodeId?.[activeProductionId])
    : []
  const timelineItems = productionMediaProjectTimeline.length > 0
    ? productionMediaProjectTimeline
    : activeScene ? (mediaProjectTimeline.length > 0 ? mediaProjectTimeline : sceneTimelineItemsFromGraph(activeScene, graphIndex)) : []
  const timelineTitle = activeProductionId && activeProduction ? `${activeProduction.title} Timeline` : 'Scene Moment Timeline'
  const timelineEmptyText = activeProductionId
    ? '当前 Production 暂无可剪辑片段'
    : '当前 Scene Moment 暂无音频 / 视频 / 字幕表达轨道'
  const automaticSceneSettingGroups = activeScene ? sceneSettingGroupsUsedByScene(activeScene, graphIndex) : []
  const manualSceneSettingGroups = manualSceneSettingGroupsBySceneId[activeScene?.id ?? 'default'] ?? []
  const sceneSettingGroups = mergeSceneSettingGroups(automaticSceneSettingGroups, manualSceneSettingGroups)
  const sceneSettingGroupIds = new Set(sceneSettingGroups.map((group) => group.setting.id))
  const sceneSettingAssets = uniqueContentNodes(sceneSettingGroups.flatMap((group) => group.states.flatMap((state) => state.assets)))
  const inspectorSelection = reconcileContentCanvasInspectorSelection({
    graphIndex,
    sceneMainNode,
    selection,
    settingMainNode,
  })
  const filteredSettings = filterContentCanvasSettings(settingNodes, activeKind, settingQuery)

  return {
    activeScene,
    activeSetting,
    activeProduction,
    filteredSettings,
    graph,
    graphIndex,
    sceneMainNode,
    sceneNodes,
    sceneRelationNodes,
    sceneSettingAssets,
    sceneSettingGroupIds,
    sceneSettingGroups,
    settingMainNode,
    settingNodes,
    settingRelationNodes,
    timelineEmptyText,
    timelineItems,
    timelineTitle,
    tree,
    inspectorSelection,
    canvasMode,
  }
}

function filterContentCanvasSettings(
  settingNodes: ReturnType<typeof buildContentCanvasGraph>['nodes'],
  activeKind: SettingKind | 'all',
  settingQuery: string,
) {
  const needle = settingQuery.trim().toLowerCase()
  return settingNodes.filter((item) => {
    const kind = settingKindFromNode(item)
    const active = activeKind === 'all' || kind === activeKind
    if (!active) return false
    if (!needle) return true
    return [
      item.id,
      kind,
      item.entityKey,
      item.title,
      item.subtitle,
      item.summary,
      item.status,
      item.sourcePath,
    ].join(' ').toLowerCase().includes(needle)
  })
}
