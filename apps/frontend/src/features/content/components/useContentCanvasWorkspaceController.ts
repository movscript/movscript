import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Viewport } from '@xyflow/react'

import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { subscribeGenerationJobStatus } from '@/features/jobs/application/generationJobStatusStream'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import { contentCanvasKeys } from '../application/contentCanvasQueryKeys'
import {
  contentCanvasProjectChangedResult,
  invalidateContentCanvasMutationResult,
} from '../application/contentCanvasMutationInvalidation'
import {
  clearContentCanvasNodePositions,
  clearContentCanvasNodePositionsForIds,
  mergeContentCanvasNodePositions,
  readContentCanvasViewState,
  subscribeContentCanvasViewState,
  updateContentCanvasViewport,
  type ContentCanvasViewStateScope,
} from '../application/contentCanvasViewState'
import { loadContentCanvasProject } from '../application/loadContentCanvasProject'
import {
  createCandidateFromResourceForContentUnit,
  createCandidateFromContentUnit,
  deleteContentCanvasNode,
  ensureDefaultContentUnitFromCanvasNode,
  selectCandidateNodeFromCanvas,
  selectContentUnitCandidateFromCanvas,
  suggestedContentCanvasChildNodePosition,
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
  type ContentCanvasNodePosition,
  type ContentWorkspaceTab,
  type InspectorSelection,
  type InspectorSelectionRef,
  type SettingCreateDialogState,
  type SettingKind,
  type StructureCreateDialogState,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import type { CreativeCanvasAction } from '../application/contentCreativeCanvasActions'
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

export function useContentCanvasWorkspaceController() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [searchParams] = useSearchParams()
  const [settingQuery, setSettingQuery] = useState('')
  const [activeKind, setActiveKind] = useState<SettingKind | 'all'>('all')
  const [workspaceTab, setWorkspaceTab] = useState<ContentWorkspaceTab>('preview')
  const [activeCanvasNodeId, setActiveCanvasNodeId] = useState<string | null>(null)
  const [creativeCanvasFocusRequest, setCreativeCanvasFocusRequest] = useState<{ nodeId: string; requestId: number } | null>(null)
  const [activeSettingId, setActiveSettingId] = useState<string | null>(null)
  const [activeProductionId, setActiveProductionId] = useState<string | null>(null)
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selection, setSelection] = useState<InspectorSelectionRef>({ kind: 'scene_moment', nodeId: 'scene-main' })
  const [createSelection, setCreateSelection] = useState<Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset' }> | null>(null)
  const [draftAssetPrompts, setDraftAssetPrompts] = useState(ASSET_PROMPTS)
  const [draftExpressionPrompts, setDraftExpressionPrompts] = useState<Record<string, string>>({})
  const [candidateSelections, setCandidateSelections] = useState<CandidateSelections>({})
  const [localContentUnitCandidates, setLocalContentUnitCandidates] = useState<LocalContentCanvasCandidates>({})
  const [pendingCanvasAction, setPendingCanvasAction] = useState<string | null>(null)
  const [settingCreateDialog, setSettingCreateDialog] = useState<SettingCreateDialogState | null>(null)
  const [structureCreateDialog, setStructureCreateDialog] = useState<StructureCreateDialogState | null>(null)
  const [viewStateVersion, setViewStateVersion] = useState(0)
  const lastCommittedPromptByNodeIdRef = useRef<Record<string, string>>({})
  const creativeCanvasScope = useMemo<ContentCanvasViewStateScope>(() => ({ mode: 'creative' }), [])
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
    lastCommittedPromptByNodeIdRef.current = {}
  }, [projectId])

  useEffect(() => {
    return subscribeContentCanvasViewState(projectId, creativeCanvasScope, () => {
      setViewStateVersion((version) => version + 1)
    })
  }, [creativeCanvasScope, projectId])

  const creativeCanvasViewState = useMemo(
    () => {
      void viewStateVersion
      return readContentCanvasViewState(projectId, creativeCanvasScope)
    },
    [creativeCanvasScope, projectId, viewStateVersion],
  )

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
    selection,
    settingQuery,
  }), [
    activeKind,
    activeCanvasNodeId,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    projectDataWithLocalCandidates,
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
      if (result.nodePositions) {
        mergeContentCanvasNodePositions(projectId, result.nodePositions, creativeCanvasScope)
      }
      setLocalContentUnitCandidates((current) => mergeContentCanvasCommandCandidates(current, result))
      setCandidateSelections((current) => mergeContentCanvasCommandSelections(current, result))
      toast.success(result.message)
      const focusState = contentCanvasCommandFocusState(result.focusNodeId)
      if (focusState) {
        if (focusState.activeCanvasNodeId !== undefined) setActiveCanvasNodeId(focusState.activeCanvasNodeId)
        if (focusState.activeSettingId !== undefined) setActiveSettingId(focusState.activeSettingId)
        if (focusState.activeProductionId !== undefined) setActiveProductionId(focusState.activeProductionId)
        if (focusState.activeSceneId !== undefined) setActiveSceneId(focusState.activeSceneId)
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
  }, [creativeCanvasScope, gateway, projectId, queryClient])

  const creationCommands = useContentCanvasWorkspaceCreationCommands({
    gateway,
    graphIndex: viewModel.graphIndex,
    projectId,
    runCanvasCommand,
    setActiveSceneId,
    setActiveSettingId,
    setCreateSelection,
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
    setActiveCanvasNodeId(sceneId)
    setActiveProductionId(null)
    setActiveSceneId(sceneId)
    setSelection({ kind: 'scene_moment', nodeId: sceneId })
    setCreateSelection(null)
  }, [])

  const selectStructureNode = useCallback((node: TreeNodeData) => {
    const nodeId = node.id
    if (!nodeId) return
    setActiveCanvasNodeId(nodeId)
    setCreativeCanvasFocusRequest((current) => ({ nodeId, requestId: (current?.requestId ?? 0) + 1 }))
    if (node.kind === 'production') setActiveProductionId(nodeId)
    if (node.kind === 'scene_moment') {
      setActiveProductionId(null)
      setActiveSceneId(nodeId)
    }
    if (node.kind === 'setting') setActiveSettingId(nodeId)
    setSelection({ kind: selectionKindForContentNodeKind(node.kind), nodeId })
    setCreateSelection(null)
  }, [])

  const selectSetting = useCallback((setting: ContentCanvasNode) => {
    setActiveSettingId(setting.id)
    setActiveCanvasNodeId(setting.id)
    setSelection({ kind: 'setting', nodeId: setting.id })
    setCreateSelection(null)
  }, [])

  const selectNode = useCallback((kind: InspectorSelectionRef['kind'], nodeId: string) => {
    setSelection({ kind, nodeId })
    setCreateSelection(null)
  }, [])

  const commitCreativeCanvasNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    mergeContentCanvasNodePositions(projectId, { [nodeId]: position }, creativeCanvasScope)
  }, [creativeCanvasScope, projectId])

  const commitCreativeCanvasNodePositions = useCallback((nodePositions: Record<string, { x: number; y: number }>) => {
    mergeContentCanvasNodePositions(projectId, nodePositions, creativeCanvasScope)
  }, [creativeCanvasScope, projectId])

  const commitCreativeCanvasViewport = useCallback((viewport: Viewport) => {
    updateContentCanvasViewport(projectId, viewport, creativeCanvasScope)
  }, [creativeCanvasScope, projectId])

  const clearCreativeCanvasManualPositions = useCallback(() => {
    clearContentCanvasNodePositions(projectId, creativeCanvasScope)
  }, [creativeCanvasScope, projectId])

  const clearCreativeCanvasManualPositionsForNodes = useCallback((nodeIds: string[]) => {
    clearContentCanvasNodePositionsForIds(projectId, nodeIds, creativeCanvasScope)
  }, [creativeCanvasScope, projectId])

  const deleteCreativeCanvasNode = useCallback((node: ContentCanvasNode) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`node-delete:${node.id}`, () => deleteContentCanvasNode(projectId, node, gateway))
      .then((result) => {
        if (!result) return
        clearContentCanvasNodePositionsForIds(projectId, [node.id], creativeCanvasScope)
        if (activeCanvasNodeId === node.id) setActiveCanvasNodeId(null)
        if (activeSettingId === node.id) setActiveSettingId(null)
        if (activeProductionId === node.id) setActiveProductionId(null)
        if (activeSceneId === node.id) setActiveSceneId(null)
        setCreateSelection(null)
      })
  }, [
    activeCanvasNodeId,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    creativeCanvasScope,
    gateway,
    projectId,
    runCanvasCommand,
  ])

  const positionForCreativeCanvasChild = useCallback((node: ContentCanvasNode, slot = 1): ContentCanvasNodePosition => {
    const position = creativeCanvasViewState?.nodePositions?.[node.id] ?? node.position
    return suggestedContentCanvasChildNodePosition({ position }, slot)
  }, [creativeCanvasViewState?.nodePositions])

  const openCreativeCanvasCreateChild = useCallback((node: ContentCanvasNode, childKind: Extract<CreativeCanvasAction, { kind: 'create_child' }>['childKind']) => {
    const childPosition = positionForCreativeCanvasChild(node)
    if (childKind === 'content_unit') {
      if (!projectId || !gateway) return
      void runCanvasCommand(`content-unit:${node.id}`, async () => {
        const contentUnitNode = await ensureDefaultContentUnitFromCanvasNode(projectId, node, gateway)
        return {
          changedNodeIds: [contentUnitNode.id],
          affectedNodeIds: [node.id, contentUnitNode.id],
          focusNodeId: contentUnitNode.id,
          nodePositions: {
            [contentUnitNode.id]: childPosition,
          },
          message: '已确保创作片段',
        }
      })
      return
    }
    if (childKind === 'expression_unit' && node.kind === 'scene_moment') {
      setActiveCanvasNodeId(node.id)
      setActiveSceneId(node.id)
      setCreateSelection({ kind: 'create_expression_unit', parent: node, position: childPosition })
      return
    }
    if (childKind === 'keyframe') {
      if (node.kind === 'scene_moment') setActiveSceneId(node.id)
      setActiveCanvasNodeId(node.id)
      setCreateSelection({ kind: 'create_keyframe', parent: node, position: childPosition })
      return
    }
    if (childKind === 'storyboard') {
      if (node.kind === 'scene_moment') setActiveSceneId(node.id)
      setActiveCanvasNodeId(node.id)
      setCreateSelection({ kind: 'create_storyboard', parent: node, position: childPosition })
      return
    }
    if (childKind === 'state' && node.kind === 'setting') {
      setActiveCanvasNodeId(node.id)
      setActiveSettingId(node.id)
      setCreateSelection({ kind: 'create_state', parent: node, position: childPosition })
      return
    }
    if (childKind === 'asset' && node.kind === 'state') {
      setActiveCanvasNodeId(node.id)
      setCreateSelection({ kind: 'create_asset', parent: node, position: childPosition })
    }
  }, [gateway, positionForCreativeCanvasChild, projectId, runCanvasCommand])

  const selectCandidateNode = useCallback((node: ContentCanvasNode) => {
    if (node.kind !== 'candidate' || !projectId || !gateway) return
    void runCanvasCommand(`candidate-node-select:${node.id}`, () => (
      selectCandidateNodeFromCanvas(projectId, node, gateway)
    ))
  }, [gateway, projectId, runCanvasCommand])

  const openResourceNode = useCallback((node: ContentCanvasNode) => {
    const resourceId = numericValue(node.record.resourceId ?? node.entityKey)
    if (resourceId === undefined) {
      setSelection({ kind: selectionKindForContentNodeKind(node.kind), nodeId: node.id })
      return
    }
    void navigate(withRouteParams(ROUTES.resources, { resourceId }))
  }, [navigate])

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
    if (!target) throw new Error('当前节点没有可生成的创作片段')
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
    if (prompt === currentPrompt || lastCommittedPromptByNodeIdRef.current[promptKey] === prompt) return
    lastCommittedPromptByNodeIdRef.current[promptKey] = prompt
    void runCanvasCommand(`prompt:${targetNode.id}`, () => (
      ensureDefaultContentUnitFromCanvasNode(projectId, targetNode, gateway, prompt)
        .then((ensuredContentUnitNode) => updateContentUnitPromptFromCanvas(projectId, ensuredContentUnitNode, prompt, gateway))
    ))
  }, [gateway, projectId, runCanvasCommand])

  const saveExpressionUnit = useCallback((node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`expression-save:${node.id}`, () => updateExpressionUnitFromCanvas(projectId, node, input, gateway))
  }, [gateway, projectId, runCanvasCommand])

  useContentCanvasWorkspaceSession({
    activeKind,
    activeCanvasNodeId,
    graphIndex: viewModel.graphIndex,
    projectId,
    searchParams,
    selection,
    setActiveKind,
    setActiveCanvasNodeId,
    setActiveProductionId,
    setActiveSceneId,
    setActiveSettingId,
    setCreateSelection,
    setSelection,
    setWorkspaceTab,
    workspaceTab,
  })

  return {
    activeKind,
    candidateSelections,
    changeAssetPromptDraft,
    changeExpressionPromptDraft,
    closeSettingCreateDialog,
    commitPromptDraft,
    commitCreativeCanvasNodePosition,
    commitCreativeCanvasNodePositions,
    commitCreativeCanvasViewport,
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
    clearCreativeCanvasManualPositions,
    clearCreativeCanvasManualPositionsForNodes,
    creativeCanvasFocusRequest,
    creativeCanvasNodePositions: creativeCanvasViewState?.nodePositions ?? {},
    creativeCanvasViewport: creativeCanvasViewState?.viewport,
    closeStructureCreateDialog,
    createCandidateForNode,
    deleteCreativeCanvasNode,
    previewCandidatePromptForNode,
    createResourceCandidateForNode,
    uploadCandidateForNode,
    openSettingCreateDialog,
    openCreativeCanvasCreateChild,
    openProductionCreateDialog,
    openStructureChildCreateDialog,
    pendingCanvasAction,
    projectId,
    projectQuery,
    runCanvasCommand,
    selectCandidate,
    selectCandidateNode,
    selectNode,
    selectScene,
    selectStructureNode,
    selectSetting,
    openResourceNode,
    saveExpressionUnit,
    setActiveKind,
    setWorkspaceTab,
    setSettingQuery,
    settingCreateDialog,
    settingQuery,
    structureCreateDialog,
    submitSettingCreateDialog,
    submitStructureCreateDialog,
    viewModel,
    workspaceTab,
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

function selectionKindForContentNodeKind(kind: TreeNodeData['kind'] | ContentCanvasNode['kind']): InspectorSelectionRef['kind'] {
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
