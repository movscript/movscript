import { useCallback } from 'react'
import {
  createChildContentCanvasNode,
  createRootContentCanvasNode,
  type ContentCanvasCommandResult,
  type ContentCanvasCreateNodeInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { contentCanvasWorkspaceIndex } from './contentCanvasWorkspaceGraphModel'
import type {
  ContentCanvasNodePosition,
  InspectorSelection,
  TreeNodeData,
} from './contentCanvasWorkspaceTypes'

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

  return {
    createAssetForFirstStateOfSetting,
    createAssetForState,
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
