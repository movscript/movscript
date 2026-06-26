import { useCallback } from 'react'
import {
  createChildContentCanvasNode,
  createRootContentCanvasNode,
  type ContentCanvasCommandResult,
  type ContentCanvasGenerationOutputKind,
  type ContentCanvasCreateNodeInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CreativeCanvasAction } from '../application/contentCreativeCanvasActions'
import {
  createAssetCanvasNode,
  createNakedGenerationTaskCanvasNode,
  createSceneMomentCanvasNode,
} from '../application/contentCanvasContentUnitCreateNodeCommands'
import type { contentCanvasWorkspaceIndex } from './contentCanvasWorkspaceGraphModel'
import type {
  ContentCanvasNodePosition,
  InspectorSelection,
  TreeNodeData,
} from './contentCanvasWorkspaceTypes'

type CreativeCanvasChildKind = Extract<CreativeCanvasAction, { kind: 'create_child' }>['childKind']
type CreativeCanvasRootKind = 'production' | 'setting'
type CreativeCanvasDirectKind =
  | 'task_video'
  | 'task_image'
  | 'task_audio'
  | 'task_text'
  | 'scene_moment'
  | 'keyframe'
  | 'storyboard'
  | 'asset_image'
  | 'asset_video'
  | 'asset_audio'

type RunContentCanvasCommand = (
  actionKey: string,
  command: () => Promise<ContentCanvasCommandResult>,
) => Promise<ContentCanvasCommandResult | undefined>

export function useContentCanvasWorkspaceCreationCommands({
  gateway,
  graphIndex,
  projectId,
  runCanvasCommand,
  setActiveSceneId,
  setActiveSettingId,
  setCreateSelection,
}: {
  gateway: ContentCanvasWorkspaceGateway | null
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>
  projectId: number | undefined
  runCanvasCommand: RunContentCanvasCommand
  setActiveSceneId: (sceneId: string | null) => void
  setActiveSettingId: (settingId: string) => void
  setCreateSelection: (selection: Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset' }> | null) => void
}) {
  const firstStateForSetting = useCallback((setting: ContentCanvasNode) => (
    graphIndex.childNodesByHierarchy.get(setting.id)?.find((node) => node.kind === 'state')
  ), [graphIndex])

  const createRootSetting = useCallback((input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand('root-setting', () => createRootContentCanvasNode(projectId, 'setting', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createProduction = useCallback((input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand('structure-production', () => createRootContentCanvasNode(projectId, 'production', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createCreativeCanvasRoot = useCallback((rootKind: CreativeCanvasRootKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`creative-root:${rootKind}`, () => createRootContentCanvasNode(projectId, rootKind, { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createCreativeCanvasNode = useCallback((nodeKind: CreativeCanvasDirectKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    if (nodeKind.startsWith('task_')) {
      void runCanvasCommand(`creative-node:${nodeKind}`, () => (
        createNakedGenerationTaskCanvasNode(projectId, creativeCanvasDirectTaskOutputKind(nodeKind), { input, position }, gateway)
      ))
      return
    }
    if (nodeKind === 'scene_moment') {
      void runCanvasCommand(`creative-node:${nodeKind}`, () => createSceneMomentCanvasNode(projectId, { input, position }, gateway))
      return
    }
    if (nodeKind === 'keyframe' || nodeKind === 'storyboard') {
      const ownerNode = input?.targetOwnerNodeId ? graphIndex.nodeById.get(input.targetOwnerNodeId) : undefined
      if (!ownerNode || (ownerNode.kind !== 'scene_moment' && ownerNode.kind !== 'expression_unit')) return
      if (ownerNode.kind === 'scene_moment') setActiveSceneId(ownerNode.id)
      void runCanvasCommand(`creative-node:${nodeKind}:${ownerNode.id}`, () => (
        createChildContentCanvasNode(projectId, ownerNode, nodeKind, { input, position }, gateway)
      ))
      return
    }
    void runCanvasCommand(`creative-node:${nodeKind}`, () => (
      createAssetCanvasNode(projectId, {
        input: {
          ...(input ?? { id: '', title: '' }),
          outputKind: creativeCanvasDirectAssetOutputKind(nodeKind),
        },
        position,
      }, gateway)
    ))
  }, [gateway, graphIndex, projectId, runCanvasCommand, setActiveSceneId])

  const createStructureChild = useCallback((treeNode: TreeNodeData, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway || !treeNode.id) return
    const parentNode = graphIndex.nodeById.get(treeNode.id)
    if (!parentNode) return
    if (parentNode.kind === 'production') {
      void runCanvasCommand(`structure-segment:${parentNode.id}`, () => createChildContentCanvasNode(projectId, parentNode, 'segment', { input }, gateway))
    }
    if (parentNode.kind === 'segment') {
      void runCanvasCommand(`structure-scene:${parentNode.id}`, () => createChildContentCanvasNode(projectId, parentNode, 'scene_moment', { input }, gateway))
    }
  }, [gateway, graphIndex, projectId, runCanvasCommand])

  const createExpressionUnitForScene = useCallback((scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    setActiveSceneId(scene.id)
    void runCanvasCommand(`scene-expression:${scene.id}`, () => createChildContentCanvasNode(projectId, scene, 'expression_unit', { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId])

  const createKeyframeForOwner = useCallback((owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    if (owner.kind === 'scene_moment') setActiveSceneId(owner.id)
    void runCanvasCommand(`${owner.kind === 'scene_moment' ? 'scene' : 'expression'}-keyframe:${owner.id}`, () => createChildContentCanvasNode(projectId, owner, 'keyframe', { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId])

  const createStoryboardForOwner = useCallback((owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    if (owner.kind === 'scene_moment') setActiveSceneId(owner.id)
    void runCanvasCommand(`${owner.kind === 'scene_moment' ? 'scene' : 'expression'}-storyboard:${owner.id}`, () => createChildContentCanvasNode(projectId, owner, 'storyboard', { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId])

  const createStateForSetting = useCallback((setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    setActiveSettingId(setting.id)
    void runCanvasCommand(`setting-state:${setting.id}`, () => createChildContentCanvasNode(projectId, setting, 'state', { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSettingId])

  const createAssetForState = useCallback((state: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`state-asset:${state.id}`, () => createChildContentCanvasNode(projectId, state, 'asset', { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createAssetForFirstStateOfSetting = useCallback((setting: ContentCanvasNode) => {
    if (!projectId || !gateway) return
    const state = firstStateForSetting(setting)
    if (!state) return
    void runCanvasCommand('setting-asset', () => createChildContentCanvasNode(projectId, state, 'asset', undefined, gateway))
  }, [firstStateForSetting, gateway, projectId, runCanvasCommand])

  const createCreativeCanvasChild = useCallback((node: ContentCanvasNode, childKind: CreativeCanvasChildKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    if (node.kind === 'scene_moment') setActiveSceneId(node.id)
    if (node.kind === 'setting') setActiveSettingId(node.id)
    void runCanvasCommand(`creative-child:${childKind}:${node.id}`, () => createChildContentCanvasNode(projectId, node, childKind, { input, position }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId, setActiveSettingId])

  return {
    createAssetForFirstStateOfSetting,
    createAssetForState,
    createCreativeCanvasChild,
    createCreativeCanvasNode,
    createCreativeCanvasRoot,
    createExpressionUnitForScene,
    createKeyframeForOwner,
    createProduction,
    createRootSetting,
    createStateForSetting,
    createStoryboardForOwner,
    createStructureChild,
    firstStateForSetting,
  }
}

function creativeCanvasDirectTaskOutputKind(nodeKind: CreativeCanvasDirectKind): ContentCanvasGenerationOutputKind {
  if (nodeKind === 'task_video') return 'video'
  if (nodeKind === 'task_audio') return 'audio'
  if (nodeKind === 'task_text') return 'text'
  return 'image'
}

function creativeCanvasDirectAssetOutputKind(nodeKind: CreativeCanvasDirectKind): Exclude<ContentCanvasGenerationOutputKind, 'text'> {
  if (nodeKind === 'asset_video') return 'video'
  if (nodeKind === 'asset_audio') return 'audio'
  return 'image'
}
