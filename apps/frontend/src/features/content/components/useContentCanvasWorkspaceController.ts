import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { subscribeGenerationJobStatus } from '@/features/jobs/application/generationJobStatusStream'
import { contentCanvasKeys } from '../application/contentCanvasQueryKeys'
import {
  contentCanvasProjectChangedResult,
  invalidateContentCanvasMutationResult,
} from '../application/contentCanvasMutationInvalidation'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import { loadContentCanvasProject } from '../application/loadContentCanvasProject'
import {
  createCandidateFromResourceForContentUnit,
  createCandidateFromContentUnit,
  ensureDefaultContentUnitFromCanvasNode,
  selectContentUnitCandidateFromCanvas,
  updateContentUnitPromptFromCanvas,
  updateExpressionUnitFromCanvas,
  uploadCandidateForContentUnit,
  type ContentCanvasCommandResult,
  type ContentCanvasCreateNodeInput,
  type ContentCanvasExpressionUnitEditorInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasGenerationPromptPreview, ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
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
  type StructureCreateDialogState,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import {
  radialPoint,
  sceneSettingGroupFromNode,
} from './contentCanvasWorkspaceModel'
import {
  contentCanvasCommandFocusState,
  contentUnitNodeForGenerationTask,
} from './contentCanvasWorkspaceCommandModel'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import { promptFromContentNode } from './contentCanvasWorkspaceNodeModel'
import { buildContentCanvasWorkspaceViewModel } from './contentCanvasWorkspaceViewModel'
import {
  mergeContentCanvasCommandCandidates,
  mergeContentCanvasCommandSelections,
  type LocalContentCanvasCandidates,
  withLocalContentCanvasCandidates,
} from './contentCanvasWorkspaceCandidateModel'
import { useContentCanvasWorkspaceSession } from './useContentCanvasWorkspaceSession'
import { useContentCanvasWorkspaceCreationCommands } from './useContentCanvasWorkspaceCreationCommands'

const lastCommittedPromptByNodeId: Record<string, string> = {}

export function useContentCanvasWorkspaceController() {
  const queryClient = useQueryClient()
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [searchParams] = useSearchParams()
  const [settingQuery, setSettingQuery] = useState('')
  const [activeKind, setActiveKind] = useState<SettingKind | 'all'>('all')
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('structure')
  const [activeCanvasNodeId, setActiveCanvasNodeId] = useState<string | null>(null)
  const [activeSettingId, setActiveSettingId] = useState<string | null>(null)
  const [activeProductionId, setActiveProductionId] = useState<string | null>(null)
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selection, setSelection] = useState<InspectorSelectionRef>({ kind: 'scene_moment', nodeId: 'scene-main' })
  const [createSelection, setCreateSelection] = useState<Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset' }> | null>(null)
  const [draftAssetPrompts, setDraftAssetPrompts] = useState(ASSET_PROMPTS)
  const [draftExpressionPrompts, setDraftExpressionPrompts] = useState<Record<string, string>>({})
  const [candidateSelections, setCandidateSelections] = useState<CandidateSelections>({})
  const [localContentUnitCandidates, setLocalContentUnitCandidates] = useState<LocalContentCanvasCandidates>({})
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

  useEffect(() => {
    setCandidateSelections({})
    setLocalContentUnitCandidates({})
  }, [projectId])

  const projectDataWithLocalCandidates = useMemo(
    () => withLocalContentCanvasCandidates(projectQuery.data, localContentUnitCandidates),
    [localContentUnitCandidates, projectQuery.data],
  )
  const hasActiveContentUnitCandidate = useMemo(
    () => contentCanvasProjectHasActiveCandidate(projectDataWithLocalCandidates),
    [projectDataWithLocalCandidates],
  )
  const activeContentUnitCandidateJobIds = useMemo(
    () => contentCanvasProjectActiveCandidateJobIds(projectDataWithLocalCandidates),
    [projectDataWithLocalCandidates],
  )
  const activeContentUnitCandidateJobIdKey = activeContentUnitCandidateJobIds.join(',')

  useEffect(() => {
    if (!projectId || !hasActiveContentUnitCandidate) return undefined
    const timer = window.setInterval(() => {
      invalidateContentCanvasMutationResult(queryClient, contentCanvasProjectChangedResult({
        projectId,
        changedIds: [],
      }))
    }, 3000)
    return () => window.clearInterval(timer)
  }, [hasActiveContentUnitCandidate, projectId, queryClient])

  useEffect(() => {
    if (!projectId || activeContentUnitCandidateJobIds.length === 0) return undefined
    const activeJobIds = new Set(activeContentUnitCandidateJobIds)
    return subscribeGenerationJobStatus((event) => {
      if (event.projectId !== undefined && event.projectId !== projectId) return
      if (!activeJobIds.has(event.jobId)) return
      invalidateContentCanvasMutationResult(queryClient, contentCanvasProjectChangedResult({
        projectId,
        changedIds: [],
      }))
    })
  }, [activeContentUnitCandidateJobIdKey, activeContentUnitCandidateJobIds, projectId, queryClient])

  const viewModel = useMemo(() => buildContentCanvasWorkspaceViewModel({
    projectData: projectDataWithLocalCandidates,
    activeKind,
    activeCanvasNodeId,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    canvasMode,
    manualSceneSettingGroupsBySceneId,
    selection,
    settingQuery,
    draftPromptsByNodeId: { ...draftExpressionPrompts, ...draftAssetPrompts },
  }), [
    activeKind,
    activeCanvasNodeId,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    canvasMode,
    manualSceneSettingGroupsBySceneId,
    projectDataWithLocalCandidates,
    selection,
    settingQuery,
    draftAssetPrompts,
    draftExpressionPrompts,
  ])

  const runCanvasCommand = useCallback(async (
    actionKey: string,
    command: () => Promise<ContentCanvasCommandResult>,
  ) => {
    if (!projectId || !gateway) return undefined
    setPendingCanvasAction(actionKey)
    try {
      const result = await command()
      setLocalContentUnitCandidates((current) => mergeContentCanvasCommandCandidates(current, result))
      setCandidateSelections((current) => mergeContentCanvasCommandSelections(current, result))
      toast.success(result.message)
      const focusState = contentCanvasCommandFocusState(result.focusNodeId)
      if (focusState) {
        if (focusState.activeCanvasNodeId !== undefined) setActiveCanvasNodeId(focusState.activeCanvasNodeId)
        if (focusState.activeSettingId !== undefined) setActiveSettingId(focusState.activeSettingId)
        if (focusState.activeProductionId !== undefined) setActiveProductionId(focusState.activeProductionId)
        if (focusState.activeSceneId !== undefined) setActiveSceneId(focusState.activeSceneId)
        if (focusState.canvasMode) setCanvasMode(focusState.canvasMode)
        setSelection(focusState.selection)
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

  const creationCommands = useContentCanvasWorkspaceCreationCommands({
    gateway,
    graphIndex: viewModel.graphIndex,
    pendingCanvasAction,
    projectId,
    runCanvasCommand,
    setActiveSceneId,
    setActiveSettingId,
    setActiveCanvasNodeId,
    setActiveProductionId,
    setCanvasMode,
    setCreateSelection,
    setSelection,
  })

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
    creationCommands.createRootSetting(input)
    setSettingCreateDialog(null)
  }, [creationCommands])

  const submitStructureCreateDialog = useCallback((input: ContentCanvasCreateNodeInput) => {
    if (!structureCreateDialog) return
    if (structureCreateDialog.kind === 'production') creationCommands.createProduction(input)
    else creationCommands.createStructureChild(structureCreateDialog.parent, input)
    setStructureCreateDialog(null)
  }, [creationCommands, structureCreateDialog])

  const selectScene = useCallback((sceneId: string) => {
    setCanvasMode('structure')
    setActiveCanvasNodeId(sceneId)
    setActiveProductionId(null)
    setActiveSceneId(sceneId)
    setSelection({ kind: 'scene_moment', nodeId: sceneId })
    setCreateSelection(null)
  }, [])

  const selectStructureNode = useCallback((node: TreeNodeData) => {
    if (!node.id) return
    setCanvasMode('structure')
    setActiveCanvasNodeId(node.id)
    if (node.kind === 'production') setActiveProductionId(node.id)
    if (node.kind === 'scene_moment') {
      setActiveProductionId(null)
      setActiveSceneId(node.id)
    }
    if (node.kind === 'setting') setActiveSettingId(node.id)
    setSelection({ kind: selectionKindForContentNodeKind(node.kind), nodeId: node.id })
    setCreateSelection(null)
  }, [])

  const selectSetting = useCallback((setting: ContentCanvasNode) => {
    setActiveSettingId(setting.id)
    setActiveCanvasNodeId(setting.id)
    setCanvasMode('structure')
    setSelection({ kind: 'setting', nodeId: setting.id })
    setCreateSelection(null)
  }, [])

  const selectNode = useCallback((kind: InspectorSelectionRef['kind'], nodeId: string) => {
    setSelection({ kind, nodeId })
    setCreateSelection(null)
  }, [])

  const selectCandidate = useCallback((node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!target) return
    setCandidateSelections((current) => ({
      ...current,
      [target.contentUnitNodeId]: candidate.id,
      [target.contentUnitId]: candidate.id,
    }))
    if (!projectId || !gateway) {
      toast.success('已记录候选选择草稿')
      return
    }
    void runCanvasCommand(`candidate-select:${target.contentUnitNodeId}:${candidate.id}`, () => (
      selectContentUnitCandidateFromCanvas(projectId, target.node, candidate, gateway)
    ))
  }, [gateway, projectId, runCanvasCommand])

  const draftPromptForCandidateNode = useCallback((node: ContentCanvasNode | undefined): string | undefined => {
    if (!node) return undefined
    if (node.kind === 'asset') return draftAssetPrompts[node.id]
    return draftExpressionPrompts[node.id]
  }, [draftAssetPrompts, draftExpressionPrompts])

  const ensureCandidateContentUnitWithPrompt = useCallback(async (node: ContentCanvasNode): Promise<ContentCanvasNode> => {
    if (!projectId || !gateway) throw new Error('内容画布未连接项目工作区')
    const target = contentCanvasGenerationTargetForNode(node)
    if (!target) throw new Error('当前节点没有可生成的制作项')
    const promptDraft = draftPromptForCandidateNode(node)
    const existingPrompt = promptFromContentNode(target.node)
    const promptOverride = promptDraft ?? existingPrompt
    console.info('[content-canvas] ensure candidate content unit prompt', JSON.stringify({
      sourceNodeId: node.id,
      sourceKind: node.kind,
      contentUnitNodeId: target.contentUnitNodeId,
      contentUnitId: target.contentUnitId,
      promptSource: promptDraft !== undefined ? 'draft' : existingPrompt !== undefined ? 'existing' : 'default',
      promptPreview: (promptOverride ?? '').slice(0, 160),
    }))
    const contentUnitNode = await ensureDefaultContentUnitFromCanvasNode(projectId, target.node, gateway, promptOverride)
    if (promptDraft === undefined) return contentUnitNode
    if (promptFromContentNode(contentUnitNode) === promptDraft) return contentUnitNode
    await updateContentUnitPromptFromCanvas(projectId, contentUnitNode, promptDraft, gateway)
    return contentUnitNodeWithEditPrompt(contentUnitNode, promptDraft)
  }, [draftPromptForCandidateNode, gateway, projectId])

  const previewCandidatePromptForNode = useCallback(async (node: ContentCanvasNode | undefined): Promise<ContentCanvasGenerationPromptPreview> => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!node || !target || !projectId || !gateway) return emptyPromptPreview()
    const contentUnitNode = await ensureCandidateContentUnitWithPrompt(node)
    const outputKind = contentUnitGenerationOutputKind(contentUnitNode)
    if (outputKind !== 'image' && outputKind !== 'video') return emptyPromptPreview()
    const preview = await gateway.previewContentUnitGenerationPrompt({
      projectId,
      contentUnitId: contentUnitNode.entityKey,
      candidateId: 'preview',
      outputKind,
      promptText: promptFromContentNode(contentUnitNode),
    })
    console.info('[content-canvas] preview compiled candidate prompt', JSON.stringify({
      sourceNodeId: node.id,
      contentUnitId: contentUnitNode.entityKey,
      textPreview: preview.text.slice(0, 200),
      blockerCount: preview.blockers.length,
      blockers: preview.blockers,
    }))
    return preview
  }, [ensureCandidateContentUnitWithPrompt, gateway, projectId])

  const createCandidateForNode = useCallback((
    node: ContentCanvasNode | undefined,
    options: { modelId?: string; params?: Record<string, string | number | boolean> } = {},
  ) => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!node || !target || !projectId || !gateway) return
    const sourceNode = node
    void runCanvasCommand(`candidate-create:${target.contentUnitNodeId}`, () => (
      ensureCandidateContentUnitWithPrompt(sourceNode)
        .then((contentUnitNode) => createCandidateFromContentUnit(projectId, contentUnitNode, undefined, gateway, options))
    ))
  }, [ensureCandidateContentUnitWithPrompt, gateway, projectId, runCanvasCommand])

  const uploadCandidateForNode = useCallback((node: ContentCanvasNode | undefined, file: File) => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!node || !target || !projectId || !gateway) return
    const sourceNode = node
    void runCanvasCommand(`candidate-upload:${target.contentUnitNodeId}`, () => (
      ensureCandidateContentUnitWithPrompt(sourceNode)
        .then((contentUnitNode) => uploadCandidateForContentUnit(projectId, contentUnitNode, file, undefined, gateway))
    ))
  }, [ensureCandidateContentUnitWithPrompt, gateway, projectId, runCanvasCommand])

  const createResourceCandidateForNode = useCallback((node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource) => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!node || !target || !projectId || !gateway) return
    const sourceNode = node
    void runCanvasCommand(`candidate-resource:${target.contentUnitNodeId}:${resource.id}`, () => (
      ensureCandidateContentUnitWithPrompt(sourceNode)
        .then((contentUnitNode) => createCandidateFromResourceForContentUnit(projectId, contentUnitNode, resource, undefined, gateway))
    ))
  }, [ensureCandidateContentUnitWithPrompt, gateway, projectId, runCanvasCommand])

  const changeAssetPromptDraft = useCallback((assetId: string, prompt: string) => {
    setDraftAssetPrompts((current) => ({ ...current, [assetId]: prompt }))
  }, [])

  const changeExpressionPromptDraft = useCallback((nodeId: string, prompt: string) => {
    setDraftExpressionPrompts((current) => ({ ...current, [nodeId]: prompt }))
  }, [])

  const commitPromptDraft = useCallback((node: ContentCanvasNode | undefined, prompt: string) => {
    const contentUnitNode = contentUnitNodeForGenerationTask(node) ?? (node?.kind === 'content_unit' ? node : undefined)
    const targetNode = contentUnitNode ?? node
    if (!targetNode || !projectId || !gateway) return
    const generationTarget = contentCanvasGenerationTargetForNode(targetNode)
    const currentPrompt = generationTarget ? promptFromContentNode(generationTarget.node) ?? '' : promptFromContentNode(targetNode) ?? ''
    const promptKey = generationTarget?.contentUnitNodeId ?? targetNode.id
    if (prompt === currentPrompt || lastCommittedPromptByNodeId[promptKey] === prompt) return
    lastCommittedPromptByNodeId[promptKey] = prompt
    void runCanvasCommand(`prompt:${targetNode.id}`, () => (
      ensureDefaultContentUnitFromCanvasNode(projectId, targetNode, gateway, prompt)
        .then((ensuredContentUnitNode) => updateContentUnitPromptFromCanvas(projectId, ensuredContentUnitNode, prompt, gateway))
    ))
  }, [gateway, projectId, runCanvasCommand])

  const saveExpressionUnit = useCallback((node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`expression-save:${node.id}`, () => updateExpressionUnitFromCanvas(projectId, node, input, gateway))
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

  useContentCanvasWorkspaceSession({
    activeKind,
    activeCanvasNodeId,
    canvasMode,
    graphIndex: viewModel.graphIndex,
    projectId,
    searchParams,
    selection,
    setActiveKind,
    setActiveCanvasNodeId,
    setActiveProductionId,
    setActiveSceneId,
    setActiveSettingId,
    setCanvasMode,
    setCreateSelection,
    setSelection,
  })

  return {
    activeKind,
    addSettingToActiveScene,
    canvasMode,
    candidateSelections,
    changeAssetPromptDraft,
    changeExpressionPromptDraft,
    closeSettingCreateDialog,
    commitPromptDraft,
    createAssetForState: creationCommands.createAssetForState,
    createExpressionUnitForScene: creationCommands.createExpressionUnitForScene,
    createKeyframeForOwner: creationCommands.createKeyframeForOwner,
    createRootSetting: creationCommands.createRootSetting,
    createProduction: creationCommands.createProduction,
    createSelection,
    createStateForSetting: creationCommands.createStateForSetting,
    createStoryboardForOwner: creationCommands.createStoryboardForOwner,
    createStructureChild: creationCommands.createStructureChild,
    draftAssetPrompts,
    draftExpressionPrompts,
    closeStructureCreateDialog,
    createCandidateForNode,
    previewCandidatePromptForNode,
    createResourceCandidateForNode,
    uploadCandidateForNode,
    moveSceneSettingGroup,
    nodeContextActions: creationCommands.nodeContextActions,
    openSettingCreateDialog,
    openProductionCreateDialog,
    openStructureChildCreateDialog,
    pendingCanvasAction,
    projectId,
    projectQuery,
    runCanvasCommand,
    selectCandidate,
    selectNode,
    selectScene,
    selectStructureNode,
    selectSetting,
    saveExpressionUnit,
    setActiveKind,
    setCanvasMode,
    setSettingQuery,
    settingCreateDialog,
    settingQuery,
    structureCreateDialog,
    submitSettingCreateDialog,
    submitStructureCreateDialog,
    viewModel,
  }
}

function contentCanvasProjectHasActiveCandidate(projectData: ReturnType<typeof withLocalContentCanvasCandidates>): boolean {
  if (!projectData) return false
  return Object.values(projectData.contentUnitCandidates).some((candidates) =>
    candidates.some((candidate) => {
      const status = candidate.status?.toLowerCase()
      return status === 'queued' || status === 'pending' || status === 'running'
    }),
  )
}

function contentCanvasProjectActiveCandidateJobIds(projectData: ReturnType<typeof withLocalContentCanvasCandidates>): number[] {
  if (!projectData) return []
  const ids = new Set<number>()
  for (const candidates of Object.values(projectData.contentUnitCandidates)) {
    for (const candidate of candidates) {
      const status = candidate.status?.toLowerCase()
      if (status !== 'queued' && status !== 'pending' && status !== 'running') continue
      const jobId = numericValue(candidate.producer?.job_id ?? candidate.producer?.jobId)
      if (jobId !== undefined) ids.add(jobId)
    }
  }
  return [...ids].sort((a, b) => a - b)
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function selectionKindForContentNodeKind(kind: TreeNodeData['kind']): InspectorSelectionRef['kind'] {
  if (kind === 'scene_moment') return 'scene_moment'
  if (kind === 'setting') return 'setting'
  if (kind === 'state') return 'state'
  if (kind === 'asset') return 'asset'
  return 'other'
}

function contentUnitNodeWithEditPrompt(node: ContentCanvasNode, prompt: string): ContentCanvasNode {
  return {
    ...node,
    summary: prompt,
    record: {
      ...node.record,
      edit_prompt: {
        ...(isRecord(node.record.edit_prompt) ? node.record.edit_prompt : {}),
        text: prompt,
      },
    },
  }
}

function contentUnitGenerationOutputKind(node: ContentCanvasNode): 'image' | 'video' | 'audio' | 'text' | 'storyboard' {
  const value = String(node.record.output_kind ?? node.record.outputKind ?? node.subtitle ?? '').toLowerCase()
  if (value.includes('video')) return 'video'
  if (value.includes('audio')) return 'audio'
  if (value.includes('text')) return 'text'
  if (value.includes('storyboard')) return 'storyboard'
  return 'image'
}

function emptyPromptPreview(): ContentCanvasGenerationPromptPreview {
  return { text: '', compiledText: '', resourceIds: [], replacements: [], blockers: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
