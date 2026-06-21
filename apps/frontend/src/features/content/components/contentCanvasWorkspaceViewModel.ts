import { buildContentCanvasGraph } from '../domain/contentCanvasGraph'
import type { ContentCanvasProjectData } from '../domain/contentCanvasTypes'
import {
  contentCanvasGraphIndex,
  contentCanvasStructureTree,
  emptyContentCanvasGraph,
  mergeSceneSettingGroups,
  radialNodeFromContentNode,
  radialPoint,
  reconcileContentCanvasInspectorSelection,
  sceneSettingGroupsUsedByScene,
  sceneTimelineItemsFromGraph,
  timelineItemsFromMediaEditingProject,
  SCENE_MAIN_NODE,
  settingKindFromNode,
  uniqueContentNodes,
} from './contentCanvasWorkspaceModel'
import { promptFromContentNode } from './contentCanvasWorkspaceNodeModel'
import type { CanvasMode, InspectorSelectionRef, SceneSettingGroup, SettingKind } from './contentCanvasWorkspaceTypes'

export function buildContentCanvasWorkspaceViewModel({
  projectData,
  activeKind,
  activeCanvasNodeId,
  activeProductionId,
  activeSceneId,
  activeSettingId,
  canvasMode,
  manualSceneSettingGroupsBySceneId,
  selection,
  settingQuery,
  draftPromptsByNodeId,
}: {
  projectData: ContentCanvasProjectData | undefined
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string | null
  activeProductionId: string | null
  activeSceneId: string | null
  activeSettingId: string | null
  canvasMode: CanvasMode
  manualSceneSettingGroupsBySceneId: Record<string, SceneSettingGroup[]>
  selection: InspectorSelectionRef
  settingQuery: string
  draftPromptsByNodeId?: Record<string, string>
}) {
  const graph = projectData ? buildContentCanvasGraph(projectData) : emptyContentCanvasGraph()
  const graphIndex = contentCanvasGraphIndex(graph)
  const settingNodes = graph.nodes.filter((node) => node.kind === 'setting')
  const productionNodes = graph.nodes.filter((node) => node.kind === 'production')
  const sceneNodes = graph.nodes.filter((node) => node.kind === 'scene_moment')
  const activeSetting = settingNodes.find((node) => node.id === activeSettingId) ?? settingNodes[0] ?? null
  const activeProduction = productionNodes.find((node) => node.id === activeProductionId) ?? productionNodes[0] ?? null
  const activeScene = sceneNodes.find((node) => node.id === activeSceneId) ?? sceneNodes[0] ?? null
  const activeCanvasNode = (activeCanvasNodeId ? graphIndex.nodeById.get(activeCanvasNodeId) : undefined)
    ?? (activeProductionId ? activeProduction : null)
    ?? activeScene
    ?? activeSetting
    ?? null
  const showTimelinePanel = activeCanvasNode?.kind === 'scene_moment'
  const timelineScene = showTimelinePanel ? activeCanvasNode : null
  const sceneMainNode = activeScene ? radialNodeFromContentNode(activeScene, 0, 0, 'primary') : SCENE_MAIN_NODE
  const settingMainNode = activeSetting ? radialNodeFromContentNode(activeSetting, 0, 0, 'primary') : null
  const canvasMainNode = activeCanvasNode ? radialNodeFromContentNode(activeCanvasNode, 0, 0, 'primary') : sceneMainNode
  const structureRelationNodes = activeCanvasNode ? namespaceRadialNodesAround(activeCanvasNode, graphIndex) : []
  const promptRelationNodes = activeCanvasNode ? promptReferenceRadialNodesAround(
    activeCanvasNode,
    graph,
    graphIndex,
    draftPromptsByNodeId?.[activeCanvasNode.id],
  ) : []
  const tree = contentCanvasStructureTree(graph, selection.nodeId, activeProductionId ?? undefined)
  const mediaProjectTimeline = timelineScene ? timelineItemsFromMediaEditingProject(projectData?.editingProjectsByNodeId?.[timelineScene.id]) : []
  const timelineItems = timelineScene
    ? (mediaProjectTimeline.length > 0 ? mediaProjectTimeline : sceneTimelineItemsFromGraph(timelineScene, graphIndex))
    : []
  const timelineTitle = 'Scene Moment Timeline'
  const timelineEmptyText = '当前 Scene Moment 暂无音频 / 视频 / 字幕表达轨道'
  const automaticSceneSettingGroups = activeScene ? sceneSettingGroupsUsedByScene(activeScene, graphIndex) : []
  const manualSceneSettingGroups = manualSceneSettingGroupsBySceneId[activeScene?.id ?? 'default'] ?? []
  const sceneSettingGroups = mergeSceneSettingGroups(automaticSceneSettingGroups, manualSceneSettingGroups)
  const sceneSettingGroupIds = new Set(sceneSettingGroups.map((group) => group.setting.id))
  const sceneSettingAssets = uniqueContentNodes(sceneSettingGroups.flatMap((group) => group.states.flatMap((state) => state.assets)))
  const scenePromptReferenceNodes = activeCanvasNode
    ? promptReferenceNodesForNamespace(activeCanvasNode, graphIndex, graph.nodes)
    : uniqueContentNodes([
      ...sceneSettingAssets,
      ...(activeScene ? visualReferenceNodesForScene(activeScene, graphIndex) : []),
    ])
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
    activeCanvasNode,
    canvasMainNode,
    filteredSettings,
    graph,
    graphIndex,
    sceneMainNode,
    sceneNodes,
    scenePromptReferenceNodes,
    sceneSettingAssets,
    sceneSettingGroupIds,
    sceneSettingGroups,
    settingMainNode,
    settingNodes,
    structureRelationNodes,
    promptRelationNodes,
    timelineEmptyText,
    timelineItems,
    timelineTitle,
    showTimelinePanel,
    tree,
    inspectorSelection,
    canvasMode,
  }
}

function namespaceRadialNodesAround(
  node: ReturnType<typeof buildContentCanvasGraph>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  const children = (graphIndex.childNodesByHierarchy.get(node.id) ?? [])
    .filter((child) => child.kind !== 'content_unit')
  return children.slice(0, 12).map((child, index, items) => {
    const point = radialPoint(index, items.length, 285, 176)
    return radialNodeFromContentNode(child, point.x, point.y)
  })
}

function promptReferenceRadialNodesAround(
  node: ReturnType<typeof buildContentCanvasGraph>['nodes'][number],
  graph: ReturnType<typeof buildContentCanvasGraph>,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
  draftPrompt?: string,
) {
  const prompt = draftPrompt ?? promptFromContentNode(node) ?? ''
  const refs = promptReferenceTokens(prompt)
  const allowedBusinessNodes = promptReferenceNodesForNamespace(node, graphIndex, graph.nodes)
  const referencedNodes = refs.flatMap((ref) => {
    const sourceNodes = ref.kind === 'candidate' || ref.kind === 'resource'
      ? graph.nodes
      : allowedBusinessNodes
    const target = sourceNodes.find((candidate) => candidate.kind === ref.kind && (
      candidate.entityKey === ref.token
      || candidate.id === ref.token
      || candidate.id === `${ref.kind}:${ref.token}`
      || candidate.sourcePath === ref.token
    ))
    return target ? [target] : []
  })
  const contentUnit = contentUnitNodeForBusinessNode(node, graphIndex)
  const outputNodes = contentUnit ? (graphIndex.connectedByNodeId.get(contentUnit.id) ?? [])
    .filter((candidate) => candidate.kind === 'candidate' || candidate.kind === 'selection' || candidate.kind === 'resource') : []
  const nodes = uniqueContentNodes([...(contentUnit ? [contentUnit] : []), ...referencedNodes, ...outputNodes])
  return nodes.slice(0, 12).map((item, index, items) => {
    const point = radialPoint(index, items.length, 285, 176)
    return radialNodeFromContentNode(item, point.x, point.y)
  })
}

function promptReferenceTokens(prompt: string): Array<{ kind: 'asset' | 'keyframe' | 'storyboard' | 'candidate' | 'resource'; token: string }> {
  const tokens: Array<{ kind: 'asset' | 'keyframe' | 'storyboard' | 'candidate' | 'resource'; token: string }> = []
  const seen = new Set<string>()
  const pattern = /\{\{\s*(asset|keyframe|storyboard|candidate|resource):([^}]+?)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(prompt)) !== null) {
    const kind = match[1] as 'asset' | 'keyframe' | 'storyboard' | 'candidate' | 'resource'
    const token = match[2].trim()
    const key = `${kind}:${token}`
    if (seen.has(key)) continue
    seen.add(key)
    tokens.push({ kind, token })
  }
  return tokens
}

function contentUnitNodeForBusinessNode(
  node: ReturnType<typeof buildContentCanvasGraph>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  if (node.kind === 'content_unit') return node
  const taskNodeId = node.generationTask?.nodeId
  const taskNode = taskNodeId ? graphIndex.nodeById.get(taskNodeId) : undefined
  return taskNode?.kind === 'content_unit' ? taskNode : undefined
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

function visualReferenceNodesForScene(
  scene: ReturnType<typeof buildContentCanvasGraph>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  const output: ReturnType<typeof buildContentCanvasGraph>['nodes'] = []
  const visit = (nodeId: string) => {
    for (const child of graphIndex.childNodesByHierarchy.get(nodeId) ?? []) {
      if (child.kind === 'keyframe' || child.kind === 'storyboard') output.push(child)
      if (child.kind === 'expression_unit') visit(child.id)
    }
  }
  visit(scene.id)
  return output
}

function promptReferenceNodesForNamespace(
  owner: ReturnType<typeof buildContentCanvasGraph>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
  nodes: ReturnType<typeof buildContentCanvasGraph>['nodes'],
) {
  const scoped: ReturnType<typeof buildContentCanvasGraph>['nodes'] = []
  const visit = (nodeId: string) => {
    for (const child of graphIndex.childNodesByHierarchy.get(nodeId) ?? []) {
      if (child.kind === 'asset' || child.kind === 'keyframe' || child.kind === 'storyboard') scoped.push(child)
      visit(child.id)
    }
  }
  visit(owner.id)
  const globalAssets = nodes.filter((node) => node.kind === 'asset')
  const outputReferences = promptOutputReferenceNodesForOwner(owner, graphIndex)
  return uniqueContentNodes([...scoped, ...globalAssets, ...outputReferences]).filter((node) => node.id !== owner.id)
}

function promptOutputReferenceNodesForOwner(
  owner: ReturnType<typeof buildContentCanvasGraph>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
) {
  const contentUnit = contentUnitNodeForBusinessNode(owner, graphIndex)
  if (!contentUnit) return []
  const candidates = (graphIndex.connectedByNodeId.get(contentUnit.id) ?? [])
    .filter((node) => node.kind === 'candidate')
  const resources = candidates.flatMap((candidate) => (
    graphIndex.connectedByNodeId.get(candidate.id) ?? []
  )).filter((node) => node.kind === 'resource')
  return uniqueContentNodes([...candidates, ...resources])
}
