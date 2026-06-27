import { buildContentCanvasWorkspaceSnapshot } from '../domain/contentCanvasWorkspaceSnapshot'
import type { ContentCanvasNode, ContentCanvasProjectData, ContentCanvasWorkspaceSnapshot } from '../domain/contentCanvasTypes'
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
import type { ContentCanvasPreviewScope, InspectorSelectionRef, SettingKind } from './contentCanvasWorkspaceTypes'

export type ContentCanvasWorkspacePreviewInput =
  | { kind: 'production'; targetNodeId?: string | null }
  | { kind: 'setting'; targetNodeId?: string | null }

export function buildContentCanvasWorkspaceViewModel({
  projectData,
  activeKind,
  activeCanvasNodeId,
  activeProductionId,
  activeSceneId,
  activeSettingId,
  preview,
  selection,
  settingQuery,
}: {
  projectData: ContentCanvasProjectData | undefined
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string | null
  activeProductionId: string | null
  activeSceneId: string | null
  activeSettingId: string | null
  preview?: ContentCanvasWorkspacePreviewInput
  selection: InspectorSelectionRef
  settingQuery: string
}) {
  const fullGraph = projectData ? buildContentCanvasWorkspaceSnapshot(projectData) : emptyContentCanvasWorkspaceSnapshot()
  const fullGraphIndex = contentCanvasWorkspaceIndex(fullGraph)
  const resolvedPreviewScope = resolveContentCanvasPreviewScope(fullGraph, fullGraphIndex, preview)
  const graph = scopedContentCanvasGraph(fullGraph, fullGraphIndex, resolvedPreviewScope)
  const graphIndex = contentCanvasWorkspaceIndex(graph)
  const previewScope = scopedPreviewScope(resolvedPreviewScope, graphIndex)
  const settingNodes = graph.nodes.filter((node) => node.kind === 'setting')
  const productionNodes = graph.nodes.filter((node) => node.kind === 'production')
  const sceneNodes = graph.nodes.filter((node) => node.kind === 'scene_moment')
  const activeSetting = previewScope.kind === 'setting'
    ? previewScope.rootNode
    : settingNodes.find((node) => node.id === activeSettingId) ?? settingNodes[0] ?? null
  const activeProduction = previewScope.kind === 'production'
    ? previewScope.rootNode
    : productionNodes.find((node) => node.id === activeProductionId) ?? productionNodes[0] ?? null
  const activeScene = sceneNodes.find((node) => node.id === activeSceneId) ?? sceneNodes[0] ?? null
  const activeCanvasNode = (activeCanvasNodeId ? graphIndex.nodeById.get(activeCanvasNodeId) : undefined)
    ?? (previewScope.kind !== 'mixed' ? previewScope.rootNode : null)
    ?? (activeProductionId ? activeProduction : null)
    ?? activeScene
    ?? activeSetting
    ?? null
  const sceneMainNode = activeScene ? radialNodeFromContentNode(activeScene, 0, 0, 'primary') : SCENE_MAIN_NODE
  const settingMainNode = activeSetting ? radialNodeFromContentNode(activeSetting, 0, 0, 'primary') : null
  const tree = contentCanvasStructureTree(graph, selection.nodeId, activeProductionId ?? undefined)
  const previewTree = contentCanvasPreviewTree(tree, previewScope)
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
    fullGraphIndex,
    graph,
    graphIndex,
    previewScope,
    previewTree,
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

function contentCanvasPreviewTree(
  tree: ReturnType<typeof contentCanvasStructureTree>,
  scope: ContentCanvasPreviewScope,
): ReturnType<typeof contentCanvasStructureTree> {
  if (scope.kind === 'mixed') return tree
  if (!scope.rootNode) return []
  const root = tree.find((node) => node.id === scope.rootNode?.id)
  return root?.children ?? []
}

function resolveContentCanvasPreviewScope(
  graph: ContentCanvasWorkspaceSnapshot,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  preview: ContentCanvasWorkspacePreviewInput | undefined,
): ContentCanvasPreviewScope {
  if (!preview) return { kind: 'mixed', rootNode: null }
  const targetNode = preview.targetNodeId ? graphIndex.nodeById.get(preview.targetNodeId) : undefined
  if (preview.kind === 'production') {
    return {
      kind: 'production',
      rootNode: ancestorOrSelfOfKind(targetNode, graphIndex, 'production')
        ?? graph.nodes.find((node) => node.kind === 'production')
        ?? null,
    }
  }
  return {
    kind: 'setting',
    rootNode: ancestorOrSelfOfKind(targetNode, graphIndex, 'setting')
      ?? graph.nodes.find((node) => node.kind === 'setting')
      ?? null,
  }
}

function scopedPreviewScope(
  scope: ContentCanvasPreviewScope,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): ContentCanvasPreviewScope {
  if (scope.kind === 'mixed') return scope
  return {
    kind: scope.kind,
    rootNode: scope.rootNode ? graphIndex.nodeById.get(scope.rootNode.id) ?? null : null,
  }
}

function scopedContentCanvasGraph(
  graph: ContentCanvasWorkspaceSnapshot,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  scope: ContentCanvasPreviewScope,
): ContentCanvasWorkspaceSnapshot {
  if (scope.kind === 'mixed') return graph
  if (!scope.rootNode) return emptyContentCanvasWorkspaceSnapshot()
  const nodeIds = scopedNodeIds(scope.rootNode, graph, graphIndex)
  return {
    nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges: graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  }
}

function scopedNodeIds(
  rootNode: ContentCanvasNode,
  graph: ContentCanvasWorkspaceSnapshot,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): Set<string> {
  const nodeIds = new Set<string>()
  const queue = [rootNode.id]
  while (queue.length) {
    const nodeId = queue.shift()
    if (!nodeId || nodeIds.has(nodeId)) continue
    nodeIds.add(nodeId)
    for (const child of graphIndex.childNodesByHierarchy.get(nodeId) ?? []) {
      queue.push(child.id)
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const edge of graph.edges) {
      if (nodeIds.has(edge.source) && includeScopedReferenceNode(edge.target, graphIndex)) {
        changed = addNodeId(nodeIds, edge.target) || changed
      }
      if (nodeIds.has(edge.target) && includeScopedReferenceNode(edge.source, graphIndex)) {
        changed = addNodeId(nodeIds, edge.source) || changed
      }
    }
  }

  return nodeIds
}

function addNodeId(nodeIds: Set<string>, nodeId: string): boolean {
  if (nodeIds.has(nodeId)) return false
  nodeIds.add(nodeId)
  return true
}

function includeScopedReferenceNode(
  nodeId: string,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): boolean {
  const node = graphIndex.nodeById.get(nodeId)
  return node?.kind === 'content_unit'
    || node?.kind === 'candidate'
    || node?.kind === 'selection'
    || node?.kind === 'resource'
}

function ancestorOrSelfOfKind(
  node: ContentCanvasNode | undefined,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  kind: ContentCanvasNode['kind'],
): ContentCanvasNode | undefined {
  if (!node) return undefined
  if (node.kind === kind) return node
  for (const ancestorId of node.domainAncestorNodeIds ?? []) {
    const ancestor = graphIndex.nodeById.get(ancestorId)
    if (ancestor?.kind === kind) return ancestor
  }
  const seen = new Set<string>([node.id])
  let current: ContentCanvasNode | undefined = node
  while (current) {
    const parent = hierarchyParentForNode(current, graphIndex)
    if (!parent || seen.has(parent.id)) return undefined
    if (parent.kind === kind) return parent
    seen.add(parent.id)
    current = parent
  }
  return undefined
}

function hierarchyParentForNode(
  node: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): ContentCanvasNode | undefined {
  for (const edge of graphIndex.edgesByNodeId.get(node.id) ?? []) {
    if (edge.kind !== 'hierarchy' || edge.target !== node.id) continue
    return graphIndex.nodeById.get(edge.source)
  }
  return undefined
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
