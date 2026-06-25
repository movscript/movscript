import { buildContentCanvasWorkspaceSnapshot } from '../domain/contentCanvasWorkspaceSnapshot'
import type { ContentCanvasProjectData } from '../domain/contentCanvasTypes'
import {
  contentCanvasWorkspaceIndex,
  contentCanvasStructureTree,
  emptyContentCanvasWorkspaceSnapshot,
  radialNodeFromContentNode,
  reconcileContentCanvasInspectorSelection,
  sceneSettingGroupsUsedByScene,
  SCENE_MAIN_NODE,
  settingKindFromNode,
  uniqueContentNodes,
} from './contentCanvasWorkspaceModel'
import type { InspectorSelectionRef, SettingKind } from './contentCanvasWorkspaceTypes'

export function buildContentCanvasWorkspaceViewModel({
  projectData,
  activeKind,
  activeCanvasNodeId,
  activeProductionId,
  activeSceneId,
  activeSettingId,
  selection,
  settingQuery,
}: {
  projectData: ContentCanvasProjectData | undefined
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string | null
  activeProductionId: string | null
  activeSceneId: string | null
  activeSettingId: string | null
  selection: InspectorSelectionRef
  settingQuery: string
}) {
  const graph = projectData ? buildContentCanvasWorkspaceSnapshot(projectData) : emptyContentCanvasWorkspaceSnapshot()
  const graphIndex = contentCanvasWorkspaceIndex(graph)
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
  const sceneMainNode = activeScene ? radialNodeFromContentNode(activeScene, 0, 0, 'primary') : SCENE_MAIN_NODE
  const settingMainNode = activeSetting ? radialNodeFromContentNode(activeSetting, 0, 0, 'primary') : null
  const tree = contentCanvasStructureTree(graph, selection.nodeId, activeProductionId ?? undefined)
  const sceneSettingAssets = uniqueContentNodes((activeScene ? sceneSettingGroupsUsedByScene(activeScene, graphIndex) : [])
    .flatMap((group) => group.states.flatMap((state) => state.assets)))
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
    filteredSettings,
    graph,
    graphIndex,
    sceneMainNode,
    sceneNodes,
    scenePromptReferenceNodes,
    sceneSettingAssets,
    settingMainNode,
    settingNodes,
    tree,
    inspectorSelection,
  }
}

function filterContentCanvasSettings(
  settingNodes: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'],
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
  scene: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
) {
  const output: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'] = []
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
  owner: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  nodes: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'],
) {
  const scoped: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'] = []
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
  owner: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
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

function contentUnitNodeForBusinessNode(
  node: ReturnType<typeof buildContentCanvasWorkspaceSnapshot>['nodes'][number],
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
) {
  if (node.kind === 'content_unit') return node
  const taskNodeId = node.generationTask?.nodeId
  const taskNode = taskNodeId ? graphIndex.nodeById.get(taskNodeId) : undefined
  return taskNode?.kind === 'content_unit' ? taskNode : undefined
}
