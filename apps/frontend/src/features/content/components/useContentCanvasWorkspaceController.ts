import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { contentCanvasKeys } from '../application/contentCanvasQueryKeys'
import {
  contentCanvasProjectChangedResult,
  invalidateContentCanvasMutationResult,
} from '../application/contentCanvasMutationInvalidation'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import { loadContentCanvasProject } from '../application/loadContentCanvasProject'
import {
  createChildContentCanvasNode,
  createRootContentCanvasNode,
  selectContentUnitCandidateFromCanvas,
  updateContentUnitPromptFromCanvas,
  type ContentCanvasCommandResult,
  type ContentCanvasCreateNodeInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { createElectronContentCanvasWorkspaceGateway } from '../integrations/contentCanvasWorkspaceElectronGateway'
import {
  ASSET_PROMPTS,
  type CandidateSelections,
  type CanvasMode,
  type InspectorSelection,
  type InspectorSelectionRef,
  type SceneSettingGroup,
  type SettingCreateDialogState,
  type SettingKind,
  type StarCanvasAction,
  type StructureCreateDialogState,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import {
  radialPoint,
  sceneSettingGroupFromNode,
} from './contentCanvasWorkspaceModel'
import { buildContentCanvasWorkspaceViewModel } from './contentCanvasWorkspaceViewModel'

export function useContentCanvasWorkspaceController() {
  const queryClient = useQueryClient()
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [settingQuery, setSettingQuery] = useState('')
  const [activeKind, setActiveKind] = useState<SettingKind | 'all'>('all')
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('scene_moment')
  const [activeSettingId, setActiveSettingId] = useState<string | null>(null)
  const [activeProductionId, setActiveProductionId] = useState<string | null>(null)
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selection, setSelection] = useState<InspectorSelectionRef>({ kind: 'scene_moment', nodeId: 'scene-main' })
  const [createSelection, setCreateSelection] = useState<Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_state' | 'create_asset' | 'create_keyframe' }> | null>(null)
  const [draftAssetPrompts, setDraftAssetPrompts] = useState(ASSET_PROMPTS)
  const [draftExpressionPrompts, setDraftExpressionPrompts] = useState<Record<string, string>>({})
  const [candidateSelections, setCandidateSelections] = useState<CandidateSelections>({})
  const [manualSceneSettingGroupsBySceneId, setManualSceneSettingGroupsBySceneId] = useState<Record<string, SceneSettingGroup[]>>({})
  const [pendingCanvasAction, setPendingCanvasAction] = useState<string | null>(null)
  const [settingCreateDialog, setSettingCreateDialog] = useState<SettingCreateDialogState | null>(null)
  const [structureCreateDialog, setStructureCreateDialog] = useState<StructureCreateDialogState | null>(null)
  const gateway = useMemo(
    () => projectId ? createElectronContentCanvasWorkspaceGateway(projectId) : null,
    [projectId],
  )

  const projectQuery = useQuery({
    queryKey: contentCanvasKeys.project(projectId),
    queryFn: () => loadContentCanvasProject(projectId!, gateway!),
    enabled: Boolean(projectId && gateway),
  })

  const viewModel = useMemo(() => buildContentCanvasWorkspaceViewModel({
    projectData: projectQuery.data,
    activeKind,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    canvasMode,
    manualSceneSettingGroupsBySceneId,
    selection,
    settingQuery,
  }), [
    activeKind,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    canvasMode,
    manualSceneSettingGroupsBySceneId,
    projectQuery.data,
    selection,
    settingQuery,
  ])

  const runCanvasCommand = useCallback(async (
    actionKey: string,
    command: () => Promise<ContentCanvasCommandResult>,
  ) => {
    if (!projectId || !gateway) return undefined
    setPendingCanvasAction(actionKey)
    try {
      const result = await command()
      toast.success(result.message)
      if (result.focusNodeId?.startsWith('setting:')) {
        setActiveSettingId(result.focusNodeId)
        setCanvasMode('setting')
        setSelection({ kind: 'setting', nodeId: result.focusNodeId })
        setCreateSelection(null)
      } else if (result.focusNodeId?.startsWith('scene_moment:')) {
        setActiveProductionId(null)
        setActiveSceneId(result.focusNodeId)
        setCanvasMode('scene_moment')
        setSelection({ kind: 'scene_moment', nodeId: result.focusNodeId })
        setCreateSelection(null)
      } else if (result.focusNodeId?.startsWith('state:')) {
        setCanvasMode('setting')
        setSelection({ kind: 'state', nodeId: result.focusNodeId })
        setCreateSelection(null)
      } else if (result.focusNodeId?.startsWith('asset:')) {
        setCanvasMode('setting')
        setSelection({ kind: 'asset', nodeId: result.focusNodeId })
        setCreateSelection(null)
      } else if (result.focusNodeId?.startsWith('expression_unit:')) {
        setCanvasMode('scene_moment')
        setSelection({ kind: 'other', nodeId: result.focusNodeId })
        setCreateSelection(null)
      } else if (result.focusNodeId) {
        setSelection({ kind: 'other', nodeId: result.focusNodeId })
        setCreateSelection(null)
      }
      invalidateContentCanvasMutationResult(queryClient, contentCanvasProjectChangedResult({
        projectId,
        changedIds: result.changedNodeIds,
      }))
      return result
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '内容画布操作失败')
      return undefined
    } finally {
      setPendingCanvasAction(null)
    }
  }, [gateway, projectId, queryClient])

  const firstStateForSetting = useCallback((setting: ContentCanvasNode) => (
    viewModel.graphIndex.childNodesByHierarchy.get(setting.id)?.find((node) => node.kind === 'state')
  ), [viewModel.graphIndex])

  const addSettingToActiveScene = useCallback((setting: ContentCanvasNode, position?: ContentCanvasNodePosition) => {
    if (!viewModel.activeScene) return
    const scene = viewModel.activeScene
    const sceneKey = scene.id
    const optimisticGroup = sceneSettingGroupFromNode(
      setting,
      viewModel.graphIndex,
      position ?? radialPoint(viewModel.sceneSettingGroups.length, viewModel.sceneSettingGroups.length + 1, 295, 172, Math.PI / 6),
    )
    setManualSceneSettingGroupsBySceneId((currentByScene) => {
      const current = currentByScene[sceneKey] ?? []
      const existingIndex = current.findIndex((group) => group.setting.id === setting.id)
      const nextGroups = existingIndex < 0
        ? [...current, optimisticGroup]
        : current.map((group, index) => index === existingIndex ? optimisticGroup : group)
      return { ...currentByScene, [sceneKey]: nextGroups }
    })
    setSelection({ kind: 'setting', nodeId: setting.id })
  }, [
    manualSceneSettingGroupsBySceneId,
    viewModel.activeScene,
    viewModel.graphIndex,
    viewModel.sceneSettingGroups.length,
  ])

  const sceneCanvasActions = useMemo<StarCanvasAction[]>(() => ([]), [])

  const settingCanvasActions = useMemo<StarCanvasAction[]>(() => ([
    {
      label: '放入 Scene Moment',
      disabled: !viewModel.activeScene || !viewModel.activeSetting || pendingCanvasAction?.startsWith('scene-setting'),
      onClick: viewModel.activeSetting ? () => addSettingToActiveScene(viewModel.activeSetting!) : undefined,
    },
    {
      label: '添加素材',
      disabled: !projectId || !gateway || !viewModel.activeSetting || !firstStateForSetting(viewModel.activeSetting) || pendingCanvasAction === 'setting-asset',
      onClick: viewModel.activeSetting && firstStateForSetting(viewModel.activeSetting) && projectId && gateway
        ? () => void runCanvasCommand('setting-asset', () => createChildContentCanvasNode(projectId, firstStateForSetting(viewModel.activeSetting!)!, 'asset', undefined, gateway))
        : undefined,
    },
  ]), [addSettingToActiveScene, firstStateForSetting, gateway, pendingCanvasAction, projectId, runCanvasCommand, viewModel.activeScene, viewModel.activeSetting])

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
    const parentNode = viewModel.graphIndex.nodeById.get(treeNode.id)
    if (!parentNode) return
    if (parentNode.kind === 'production') {
      void runCanvasCommand(`structure-segment:${parentNode.id}`, () => createChildContentCanvasNode(projectId, parentNode, 'segment', { input }, gateway))
    }
    if (parentNode.kind === 'segment') {
      void runCanvasCommand(`structure-scene:${parentNode.id}`, () => createChildContentCanvasNode(projectId, parentNode, 'scene_moment', { input }, gateway))
    }
  }, [gateway, projectId, runCanvasCommand, viewModel.graphIndex])

  const createExpressionUnitForScene = useCallback((scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    setActiveSceneId(scene.id)
    void runCanvasCommand(`scene-expression:${scene.id}`, () => createChildContentCanvasNode(projectId, scene, 'expression_unit', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createStateForSetting = useCallback((setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    setActiveSettingId(setting.id)
    void runCanvasCommand(`setting-state:${setting.id}`, () => createChildContentCanvasNode(projectId, setting, 'state', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createAssetForState = useCallback((state: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`state-asset:${state.id}`, () => createChildContentCanvasNode(projectId, state, 'asset', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const createKeyframeForShot = useCallback((shot: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`shot-keyframe:${shot.id}`, () => createChildContentCanvasNode(projectId, shot, 'keyframe', { input }, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const nodeContextActions = useCallback((node: ContentCanvasNode): StarCanvasAction[] => {
    if (node.kind === 'scene_moment') {
      return [{
        label: '添加表达单元',
        disabled: !projectId || pendingCanvasAction?.startsWith('scene-expression'),
        onClick: () => {
          setActiveSceneId(node.id)
          setCanvasMode('scene_moment')
          setSelection({ kind: 'scene_moment', nodeId: node.id })
          setCreateSelection({ kind: 'create_expression_unit', parent: node })
        },
      }]
    }
    if (node.kind === 'setting') {
      return [{
        label: '添加状态',
        disabled: !projectId || pendingCanvasAction?.startsWith('setting-state'),
        onClick: () => {
          setActiveSettingId(node.id)
          setCanvasMode('setting')
          setSelection({ kind: 'setting', nodeId: node.id })
          setCreateSelection({ kind: 'create_state', parent: node })
        },
      }]
    }
    if (node.kind === 'state') {
      return [{
        label: '添加 Asset',
        disabled: !projectId || pendingCanvasAction?.startsWith('state-asset'),
        onClick: () => {
          setCanvasMode('setting')
          setSelection({ kind: 'state', nodeId: node.id })
          setCreateSelection({ kind: 'create_asset', parent: node })
        },
      }]
    }
    if (node.kind === 'shot') {
      return [{
        label: '添加关键帧',
        disabled: !projectId || pendingCanvasAction?.startsWith('shot-keyframe'),
        onClick: () => {
          setCanvasMode('scene_moment')
          setSelection({ kind: 'other', nodeId: node.id })
          setCreateSelection({ kind: 'create_keyframe', parent: node })
        },
      }]
    }
    return []
  }, [pendingCanvasAction, projectId])

  const openProductionCreateDialog = useCallback(() => {
    setStructureCreateDialog({ kind: 'production' })
  }, [])

  const openSettingCreateDialog = useCallback(() => {
    setSettingCreateDialog({ kind: 'setting' })
  }, [])

  const openStructureChildCreateDialog = useCallback((treeNode: TreeNodeData) => {
    if (treeNode.kind === 'production') {
      setStructureCreateDialog({ kind: 'segment', parent: treeNode })
    }
    if (treeNode.kind === 'segment') {
      setStructureCreateDialog({ kind: 'scene_moment', parent: treeNode })
    }
  }, [])

  const closeStructureCreateDialog = useCallback(() => {
    setStructureCreateDialog(null)
  }, [])

  const closeSettingCreateDialog = useCallback(() => {
    setSettingCreateDialog(null)
  }, [])

  const submitSettingCreateDialog = useCallback((input: ContentCanvasCreateNodeInput) => {
    createRootSetting(input)
    setSettingCreateDialog(null)
  }, [createRootSetting])

  const submitStructureCreateDialog = useCallback((input: ContentCanvasCreateNodeInput) => {
    if (!structureCreateDialog) return
    if (structureCreateDialog.kind === 'production') createProduction(input)
    else createStructureChild(structureCreateDialog.parent, input)
    setStructureCreateDialog(null)
  }, [createProduction, createStructureChild, structureCreateDialog])

  const selectScene = useCallback((sceneId: string) => {
    setCanvasMode('scene_moment')
    setActiveProductionId(null)
    setActiveSceneId(sceneId)
    setSelection({ kind: 'scene_moment', nodeId: sceneId })
    setCreateSelection(null)
  }, [])

  const selectStructureNode = useCallback((node: TreeNodeData) => {
    if (!node.id) return
    if (node.kind === 'production') {
      setCanvasMode('scene_moment')
      setActiveProductionId(node.id)
      setSelection({ kind: 'other', nodeId: node.id })
      setCreateSelection(null)
      return
    }
    if (node.kind === 'scene_moment') {
      setCanvasMode('scene_moment')
      setActiveProductionId(null)
      setActiveSceneId(node.id)
      setSelection({ kind: 'scene_moment', nodeId: node.id })
      setCreateSelection(null)
    }
  }, [])

  const selectSetting = useCallback((setting: ContentCanvasNode) => {
    setActiveSettingId(setting.id)
    setCanvasMode('setting')
    setSelection({ kind: 'setting', nodeId: setting.id })
    setCreateSelection(null)
  }, [])

  const selectNode = useCallback((kind: InspectorSelectionRef['kind'], nodeId: string) => {
    setSelection({ kind, nodeId })
    setCreateSelection(null)
  }, [])

  const selectCandidate = useCallback((node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => {
    if (!node) return
    setCandidateSelections((current) => ({ ...current, [node.id]: candidate.id }))
    const contentUnitNode = contentUnitNodeForGenerationTask(node) ?? (node.kind === 'content_unit' ? node : undefined)
    if (!projectId || !gateway || !contentUnitNode) {
      toast.success('已记录候选选择草稿')
      return
    }
    void runCanvasCommand(`candidate-select:${contentUnitNode.id}:${candidate.id}`, () => (
      selectContentUnitCandidateFromCanvas(projectId, contentUnitNode, candidate, gateway)
    ))
  }, [gateway, projectId, runCanvasCommand])

  const changeAssetPromptDraft = useCallback((assetId: string, prompt: string) => {
    setDraftAssetPrompts((current) => ({ ...current, [assetId]: prompt }))
  }, [])

  const changeExpressionPromptDraft = useCallback((nodeId: string, prompt: string) => {
    setDraftExpressionPrompts((current) => ({ ...current, [nodeId]: prompt }))
  }, [])

  const commitPromptDraft = useCallback((node: ContentCanvasNode | undefined, prompt: string) => {
    const contentUnitNode = contentUnitNodeForGenerationTask(node) ?? (node?.kind === 'content_unit' ? node : undefined)
    if (!contentUnitNode || !projectId || !gateway) return
    void runCanvasCommand(`prompt:${contentUnitNode.id}`, () => updateContentUnitPromptFromCanvas(projectId, contentUnitNode, prompt, gateway))
  }, [gateway, projectId, runCanvasCommand])

  const moveSceneSettingGroup = useCallback((group: SceneSettingGroup, position: ContentCanvasNodePosition) => {
    const sceneKey = viewModel.activeScene?.id ?? 'default'
    setManualSceneSettingGroupsBySceneId((currentByScene) => {
      const current = currentByScene[sceneKey] ?? []
      const nextGroup = { ...group, x: position.x, y: position.y }
      const existingIndex = current.findIndex((item) => item.setting.id === group.setting.id)
      const nextGroups = existingIndex < 0
        ? [...current, nextGroup]
        : current.map((item, index) => index === existingIndex ? nextGroup : item)
      return { ...currentByScene, [sceneKey]: nextGroups }
    })
  }, [viewModel.activeScene?.id])

  return {
    activeKind,
    addSettingToActiveScene,
    canvasMode,
    candidateSelections,
    changeAssetPromptDraft,
    changeExpressionPromptDraft,
    closeSettingCreateDialog,
    commitPromptDraft,
    createAssetForState,
    createExpressionUnitForScene,
    createKeyframeForShot,
    createRootSetting,
    createProduction,
    createSelection,
    createStateForSetting,
    createStructureChild,
    draftAssetPrompts,
    draftExpressionPrompts,
    closeStructureCreateDialog,
    moveSceneSettingGroup,
    nodeContextActions,
    openSettingCreateDialog,
    openProductionCreateDialog,
    openStructureChildCreateDialog,
    pendingCanvasAction,
    projectId,
    projectQuery,
    runCanvasCommand,
    sceneCanvasActions,
    selectCandidate,
    selectNode,
    selectScene,
    selectStructureNode,
    selectSetting,
    setActiveKind,
    setCanvasMode,
    setSettingQuery,
    settingCanvasActions,
    settingCreateDialog,
    settingQuery,
    structureCreateDialog,
    submitSettingCreateDialog,
    submitStructureCreateDialog,
    viewModel,
  }
}

function contentUnitNodeForGenerationTask(node: ContentCanvasNode | undefined): ContentCanvasNode | undefined {
  const task = node?.generationTask
  if (!task) return undefined
  return {
    id: task.nodeId,
    entityKey: task.id,
    kind: 'content_unit',
    title: task.title,
    subtitle: task.outputKind,
    summary: task.prompt,
    status: task.status === 'needs_candidate' || task.status === 'stale' ? 'active' : 'ready',
    metrics: [
      `制作项 ${task.outputKind}`,
      task.candidates.length ? `候选 ${task.candidates.length}` : undefined,
      task.selectedCandidate ? '已选择候选' : undefined,
    ].filter((item): item is string => Boolean(item)),
    sourcePath: task.sourcePath,
    record: task.record,
    candidates: task.candidates,
    position: node?.position ?? { x: 0, y: 0 },
  }
}
