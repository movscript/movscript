import { useCallback } from 'react'
import { allocateMovScriptEntityId } from '@movscript/domain'
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
import {
  contentCanvasNextTimelineNamespaceKind,
  contentCanvasSettingChildInput,
  contentCanvasTimelineChildInput,
  type ContentCanvasNamespaceVocabularyOptions,
} from './contentCanvasNamespaceVocabularyModel'
import {
  DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE,
  contentCanvasTimelineProfileRootKind,
} from '../domain/contentCanvasTimelineProfiles'

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
  namespaceVocabulary,
  runCanvasCommand,
  setActiveSceneId,
  setActiveSettingId,
  setCreateSelection,
}: {
  gateway: ContentCanvasWorkspaceGateway | null
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
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
    void runCanvasCommand('root-setting', () => createRootContentCanvasNode(projectId, 'setting', {
      input: withCanvasAllocatedId(input, 'setting', graphIndex),
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand])

  const createProduction = useCallback((input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand('structure-production', () => createRootContentCanvasNode(projectId, 'production', {
      input: timelineRootInput(withCanvasAllocatedId(input, 'production', graphIndex)),
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand])

  const createCreativeCanvasRoot = useCallback((rootKind: CreativeCanvasRootKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    const nextInput = input ? withCanvasAllocatedId(input, rootKind, graphIndex) : input
    void runCanvasCommand(`creative-root:${rootKind}`, () => createRootContentCanvasNode(projectId, rootKind, {
      input: rootKind === 'production' ? timelineRootInput(nextInput) : nextInput,
      position,
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand])

  const createCreativeCanvasNode = useCallback((nodeKind: CreativeCanvasDirectKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    if (nodeKind.startsWith('task_')) {
      const nextInput = input ? withCanvasAllocatedId(input, 'content_unit', graphIndex) : input
      void runCanvasCommand(`creative-node:${nodeKind}`, () => (
        createNakedGenerationTaskCanvasNode(projectId, creativeCanvasDirectTaskOutputKind(nodeKind), { input: nextInput, position }, gateway)
      ))
      return
    }
    if (nodeKind === 'scene_moment') {
      const nextInput = input ? withCanvasAllocatedId(input, 'scene_moment', graphIndex) : input
      void runCanvasCommand(`creative-node:${nodeKind}`, () => createSceneMomentCanvasNode(projectId, { input: nextInput, position }, gateway))
      return
    }
    if (nodeKind === 'keyframe' || nodeKind === 'storyboard') {
      const ownerNode = input?.targetOwnerNodeId ? graphIndex.nodeById.get(input.targetOwnerNodeId) : undefined
      if (!ownerNode || (ownerNode.kind !== 'scene_moment' && ownerNode.kind !== 'expression_unit')) return
      if (ownerNode.kind === 'scene_moment') setActiveSceneId(ownerNode.id)
      const nextInput = withCanvasAllocatedId(input ?? { id: '', title: '' }, nodeKind, graphIndex)
      void runCanvasCommand(`creative-node:${nodeKind}:${ownerNode.id}`, () => (
        createChildContentCanvasNode(projectId, ownerNode, nodeKind, { input: nextInput, position }, gateway)
      ))
      return
    }
    const nextInput = withCanvasAllocatedId({
      ...(input ?? { id: '', title: '' }),
      outputKind: creativeCanvasDirectAssetOutputKind(nodeKind),
    }, 'asset', graphIndex)
    void runCanvasCommand(`creative-node:${nodeKind}`, () => (
      createAssetCanvasNode(projectId, {
        input: nextInput,
        position,
      }, gateway)
    ))
  }, [gateway, graphIndex, projectId, runCanvasCommand, setActiveSceneId])

  const createStructureChild = useCallback((treeNode: TreeNodeData, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway || !treeNode.id) return
    const parentNode = graphIndex.nodeById.get(treeNode.id)
    if (!parentNode) return
    const nextNamespaceKind = parentNode.domainCategory === 'timeline_namespace'
      ? contentCanvasNextTimelineNamespaceKind(parentNode, namespaceVocabulary)
      : undefined
    const shouldCreateTimelineNamespace = parentNode.kind === 'production'
      || (parentNode.kind === 'segment' && Boolean(nextNamespaceKind))
    if (shouldCreateTimelineNamespace) {
      const childInput = contentCanvasTimelineChildInput(parentNode, 'segment', input, namespaceVocabulary)
      if (!childInput) return
      const nextInput = withCanvasAllocatedId(
        childInput,
        'segment',
        graphIndex,
      )
      void runCanvasCommand(`structure-segment:${parentNode.id}`, () => createChildContentCanvasNode(projectId, parentNode, 'segment', {
        input: nextInput,
      }, gateway))
      return
    }
    if (parentNode.kind === 'segment') {
      const childInput = contentCanvasTimelineChildInput(parentNode, 'scene_moment', input, namespaceVocabulary)
      if (!childInput) return
      const nextInput = withCanvasAllocatedId(
        childInput,
        'scene_moment',
        graphIndex,
      )
      void runCanvasCommand(`structure-scene:${parentNode.id}`, () => createChildContentCanvasNode(projectId, parentNode, 'scene_moment', {
        input: nextInput,
      }, gateway))
    }
  }, [gateway, graphIndex, namespaceVocabulary, projectId, runCanvasCommand])

  const createExpressionUnitForScene = useCallback((scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    setActiveSceneId(scene.id)
    void runCanvasCommand(`scene-expression:${scene.id}`, () => createChildContentCanvasNode(projectId, scene, 'expression_unit', {
      input: withCanvasAllocatedId(input, 'expression_unit', graphIndex),
      position,
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand, setActiveSceneId])

  const createKeyframeForOwner = useCallback((owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    if (owner.kind === 'scene_moment') setActiveSceneId(owner.id)
    void runCanvasCommand(`${owner.kind === 'scene_moment' ? 'scene' : 'expression'}-keyframe:${owner.id}`, () => createChildContentCanvasNode(projectId, owner, 'keyframe', {
      input: withCanvasAllocatedId(input, 'keyframe', graphIndex),
      position,
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand, setActiveSceneId])

  const createStoryboardForOwner = useCallback((owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    if (owner.kind === 'scene_moment') setActiveSceneId(owner.id)
    void runCanvasCommand(`${owner.kind === 'scene_moment' ? 'scene' : 'expression'}-storyboard:${owner.id}`, () => createChildContentCanvasNode(projectId, owner, 'storyboard', {
      input: withCanvasAllocatedId(input, 'storyboard', graphIndex),
      position,
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand, setActiveSceneId])

  const createStateForSetting = useCallback((setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    setActiveSettingId(setting.id)
    const childInput = contentCanvasSettingChildInput(setting, input, namespaceVocabulary)
    if (!childInput) return
    const nextInput = withCanvasAllocatedId(
      childInput,
      'setting_state',
      graphIndex,
    )
    void runCanvasCommand(`setting-state:${setting.id}`, () => createChildContentCanvasNode(projectId, setting, 'state', {
      input: nextInput,
      position,
    }, gateway))
  }, [gateway, graphIndex, namespaceVocabulary, projectId, runCanvasCommand, setActiveSettingId])

  const createAssetForState = useCallback((state: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`state-asset:${state.id}`, () => createChildContentCanvasNode(projectId, state, 'asset', {
      input: withCanvasAllocatedId(input, 'asset', graphIndex),
      position,
    }, gateway))
  }, [gateway, graphIndex, projectId, runCanvasCommand])

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
    const childInput = childKind === 'segment' || childKind === 'scene_moment'
      ? contentCanvasTimelineChildInput(node, childKind, input, namespaceVocabulary)
      : input
    const nextInput = childInput ? withCanvasAllocatedId(childInput, canvasEntityKindForCreateChild(childKind), graphIndex) : childInput
    void runCanvasCommand(`creative-child:${childKind}:${node.id}`, () => createChildContentCanvasNode(projectId, node, childKind, {
      input: nextInput,
      position,
    }, gateway))
  }, [gateway, graphIndex, namespaceVocabulary, projectId, runCanvasCommand, setActiveSceneId, setActiveSettingId])

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

function timelineRootInput(input?: ContentCanvasCreateNodeInput): ContentCanvasCreateNodeInput {
  const nextInput = input ?? { id: '', title: '' }
  if (nextInput.legacyTimelineMount) return nextInput
  const timelineProfile = nextInput.timelineProfile?.trim() || DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE
  return {
    ...nextInput,
    timelineProfile,
    timelineNamespaceKind: nextInput.timelineNamespaceKind?.trim()
      || contentCanvasTimelineProfileRootKind(timelineProfile),
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

function withCanvasAllocatedId(
  input: ContentCanvasCreateNodeInput,
  entityKind: string,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): ContentCanvasCreateNodeInput {
  if (input.id?.trim()) return input
  return {
    ...input,
    id: allocateMovScriptEntityId({
      entityKind,
      title: input.title,
      existingIds: canvasExistingEntityIds(entityKind, graphIndex),
    }),
  }
}

function canvasExistingEntityIds(
  entityKind: string,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): string[] {
  const nodeKind = entityKind === 'setting_state' ? 'state' : entityKind
  return [...graphIndex.nodeById.values()]
    .filter((node) => node.kind === nodeKind)
    .flatMap((node) => [node.entityKey, node.record.id, node.record.ID])
    .map((value) => {
      if (typeof value === 'string') return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    })
    .filter(Boolean)
}

function canvasEntityKindForCreateChild(childKind: CreativeCanvasChildKind): string {
  if (childKind === 'state') return 'setting_state'
  return childKind
}
