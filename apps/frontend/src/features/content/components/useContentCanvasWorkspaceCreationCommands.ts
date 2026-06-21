import { useCallback } from 'react'
import {
  createChildContentCanvasNode,
  createRootContentCanvasNode,
  type ContentCanvasCommandResult,
  type ContentCanvasCreateNodeInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { contentCanvasGraphIndex } from './contentCanvasWorkspaceGraphModel'
import type {
  CanvasMode,
  InspectorSelection,
  InspectorSelectionRef,
  StarCanvasAction,
  TreeNodeData,
} from './contentCanvasWorkspaceTypes'

type RunContentCanvasCommand = (
  actionKey: string,
  command: () => Promise<ContentCanvasCommandResult>,
) => Promise<ContentCanvasCommandResult | undefined>

export function useContentCanvasWorkspaceCreationCommands({
  gateway,
  graphIndex,
  pendingCanvasAction,
  projectId,
  runCanvasCommand,
  setActiveCanvasNodeId,
  setActiveProductionId,
  setActiveSceneId,
  setActiveSettingId,
  setCanvasMode,
  setCreateSelection,
  setSelection,
}: {
  gateway: ContentCanvasWorkspaceGateway | null
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>
  pendingCanvasAction: string | null
  projectId: number | undefined
  runCanvasCommand: RunContentCanvasCommand
  setActiveCanvasNodeId: (nodeId: string | null) => void
  setActiveProductionId: (productionId: string | null) => void
  setActiveSceneId: (sceneId: string | null) => void
  setActiveSettingId: (settingId: string) => void
  setCanvasMode: (mode: CanvasMode) => void
  setCreateSelection: (selection: Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset' }> | null) => void
  setSelection: (selection: InspectorSelectionRef) => void
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

  const createExpressionUnitForScene = useCallback((scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    setActiveSceneId(scene.id)
    void runCanvasCommand(`scene-expression:${scene.id}`, () => createChildContentCanvasNode(projectId, scene, 'expression_unit', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId])

  const createKeyframeForOwner = useCallback((owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    if (owner.kind === 'scene_moment') setActiveSceneId(owner.id)
    void runCanvasCommand(`${owner.kind === 'scene_moment' ? 'scene' : 'expression'}-keyframe:${owner.id}`, () => createChildContentCanvasNode(projectId, owner, 'keyframe', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId])

  const createStoryboardForOwner = useCallback((owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    if (owner.kind === 'scene_moment') setActiveSceneId(owner.id)
    void runCanvasCommand(`${owner.kind === 'scene_moment' ? 'scene' : 'expression'}-storyboard:${owner.id}`, () => createChildContentCanvasNode(projectId, owner, 'storyboard', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSceneId])

  const createStateForSetting = useCallback((setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    setActiveSettingId(setting.id)
    void runCanvasCommand(`setting-state:${setting.id}`, () => createChildContentCanvasNode(projectId, setting, 'state', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand, setActiveSettingId])

  const createAssetForState = useCallback((state: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`state-asset:${state.id}`, () => createChildContentCanvasNode(projectId, state, 'asset', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createAssetForFirstStateOfSetting = useCallback((setting: ContentCanvasNode) => {
    if (!projectId || !gateway) return
    const state = firstStateForSetting(setting)
    if (!state) return
    void runCanvasCommand('setting-asset', () => createChildContentCanvasNode(projectId, state, 'asset', undefined, gateway))
  }, [firstStateForSetting, gateway, projectId, runCanvasCommand])

  const nodeContextActions = useCallback((node: ContentCanvasNode): StarCanvasAction[] => {
    const enterViewAction: StarCanvasAction = {
      label: '进入视图',
      onClick: () => {
        setActiveCanvasNodeId(node.id)
        setCanvasMode('structure')
        if (node.kind === 'production') {
          setActiveProductionId(node.id)
          setActiveSceneId(null)
        }
        if (node.kind === 'scene_moment') {
          setActiveProductionId(null)
          setActiveSceneId(node.id)
        }
        if (node.kind === 'setting') setActiveSettingId(node.id)
        setSelection({ kind: selectionKindForContextNode(node), nodeId: node.id })
        setCreateSelection(null)
      },
    }
    if (node.kind === 'scene_moment') {
      return [
        enterViewAction,
        {
          label: '添加表达单元',
          disabled: !projectId || pendingCanvasAction?.startsWith('scene-expression'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setActiveSceneId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'scene_moment', nodeId: node.id })
            setCreateSelection({ kind: 'create_expression_unit', parent: node })
          },
        },
        {
          label: '添加关键帧',
          disabled: !projectId || pendingCanvasAction?.startsWith('scene-keyframe'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setActiveSceneId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'scene_moment', nodeId: node.id })
            setCreateSelection({ kind: 'create_keyframe', parent: node })
          },
        },
        {
          label: '添加分镜图',
          disabled: !projectId || pendingCanvasAction?.startsWith('scene-storyboard'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setActiveSceneId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'scene_moment', nodeId: node.id })
            setCreateSelection({ kind: 'create_storyboard', parent: node })
          },
        },
      ]
    }
    if (node.kind === 'expression_unit') {
      return [
        enterViewAction,
        {
          label: '添加关键帧',
          disabled: !projectId || pendingCanvasAction?.startsWith('expression-keyframe'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'other', nodeId: node.id })
            setCreateSelection({ kind: 'create_keyframe', parent: node })
          },
        },
        {
          label: '添加分镜图',
          disabled: !projectId || pendingCanvasAction?.startsWith('expression-storyboard'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'other', nodeId: node.id })
            setCreateSelection({ kind: 'create_storyboard', parent: node })
          },
        },
      ]
    }
    if (node.kind === 'setting') {
      return [
        enterViewAction,
        {
          label: '添加状态',
          disabled: !projectId || pendingCanvasAction?.startsWith('setting-state'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setActiveSettingId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'setting', nodeId: node.id })
            setCreateSelection({ kind: 'create_state', parent: node })
          },
        },
      ]
    }
    if (node.kind === 'state') {
      return [
        enterViewAction,
        {
          label: '添加 Asset',
          disabled: !projectId || pendingCanvasAction?.startsWith('state-asset'),
          onClick: () => {
            setActiveCanvasNodeId(node.id)
            setCanvasMode('structure')
            setSelection({ kind: 'state', nodeId: node.id })
            setCreateSelection({ kind: 'create_asset', parent: node })
          },
        },
      ]
    }
    return [enterViewAction]
  }, [pendingCanvasAction, projectId, setActiveCanvasNodeId, setActiveProductionId, setActiveSceneId, setActiveSettingId, setCanvasMode, setCreateSelection, setSelection])

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
    nodeContextActions,
  }
}

function selectionKindForContextNode(node: ContentCanvasNode): InspectorSelectionRef['kind'] {
  if (node.kind === 'scene_moment') return 'scene_moment'
  if (node.kind === 'setting') return 'setting'
  if (node.kind === 'state') return 'state'
  if (node.kind === 'asset') return 'asset'
  return 'other'
}
