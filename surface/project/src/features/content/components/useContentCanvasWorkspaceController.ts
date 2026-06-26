import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Viewport } from '@xyflow/react'

import { toast } from '@movscript/ui/toast'
import { subscribeSurfaceGenerationJobStatus, surfaceRoutePath } from '@movscript/shared'
import { contentCanvasKeys } from '../application/contentCanvasQueryKeys'
import {
  contentCanvasProjectChangedResult,
  invalidateContentCanvasMutationResult,
} from '../application/contentCanvasMutationInvalidation'
import {
  activeContentCanvasDocument,
  addContentCanvasDocumentNodes,
  clearContentCanvasDocumentNodePositions,
  contentCanvasDocumentNodeIds,
  contentCanvasDocumentPositions,
  createContentCanvasDocument,
  ensureContentCanvasDocumentsState,
  readContentCanvasDocumentsState,
  removeContentCanvasDocumentNodesEverywhere,
  removeContentCanvasDocumentNodes,
  selectContentCanvasDocument,
  subscribeContentCanvasDocumentsState,
  updateContentCanvasDocumentNodePositions,
  updateContentCanvasDocumentViewport,
} from '../application/contentCanvasDocuments'
import { contentCanvasDocumentNodeInputsWithReferences } from '../application/contentCreativeCanvasReferences'
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
  updateContentUnitStructuredPromptFromCanvas,
  updateExpressionUnitFromCanvas,
  uploadCandidateForContentUnit,
  type ContentCanvasCommandResult,
  type ContentCanvasCreateNodeInput,
  type ContentCanvasExpressionUnitEditorInput,
} from '../application/contentCanvasCommands'
import type { ContentCanvasGenerationPromptPreview, ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { createElectronContentCanvasWorkspaceGateway } from '../integrations/contentCanvasWorkspaceElectronGateway'
import type { ContentCanvasCandidateGenerationOptions } from './ContentCanvasInspectorParts'
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
import { useSurfaceHostState } from '../../project/application/surfaceHostStateHooks'

interface UseContentCanvasWorkspaceControllerInput {
  workspaceMode?: ContentWorkspaceTab
}

export function useContentCanvasWorkspaceController({
  workspaceMode,
}: UseContentCanvasWorkspaceControllerInput = {}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const project = useSurfaceHostState((state) => state.currentProject)
  const workspaceRoot = useSurfaceHostState((state) => state.workspaceRoot)
  const projectId = project?.ID
  const projectDir = useMemo(
    () => workspaceRoot?.trim() || project?.workspace_path?.trim() || project?.project_path?.trim() || undefined,
    [project?.project_path, project?.workspace_path, workspaceRoot],
  )
  const [searchParams] = useSearchParams()
  const requestedCanvasId = searchParams.get('canvasId') ?? searchParams.get('canvas') ?? undefined
  const [settingQuery, setSettingQuery] = useState('')
  const [activeKind, setActiveKind] = useState<SettingKind | 'all'>('all')
  const [workspaceTab, setWorkspaceTab] = useState<ContentWorkspaceTab>(() => workspaceMode ?? 'preview')
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
  const [canvasDocumentsVersion, setCanvasDocumentsVersion] = useState(0)
  const lastCommittedPromptByNodeIdRef = useRef<Record<string, string>>({})
  const gateway = useMemo(
    () => projectId ? createElectronContentCanvasWorkspaceGateway(projectId, { projectDir }) : null,
    [projectDir, projectId],
  )

  const projectQuery = useQuery({
    queryKey: contentCanvasKeys.project(projectId, projectDir),
    queryFn: () => loadContentCanvasProject(projectId!, gateway!),
    enabled: Boolean(projectId && gateway),
  })

  useEffect(() => {
    setCandidateSelections({})
    setLocalContentUnitCandidates({})
    lastCommittedPromptByNodeIdRef.current = {}
  }, [projectId])

  useEffect(() => {
    if (workspaceMode && workspaceTab !== workspaceMode) setWorkspaceTab(workspaceMode)
  }, [workspaceMode, workspaceTab])

  useEffect(() => {
    if (!projectId) return undefined
    ensureContentCanvasDocumentsState(projectId)
    setCanvasDocumentsVersion((version) => version + 1)
    return subscribeContentCanvasDocumentsState(projectId, () => {
      setCanvasDocumentsVersion((version) => version + 1)
    })
  }, [projectId])

  useEffect(() => {
    if (!projectId || !requestedCanvasId) return
    const current = ensureContentCanvasDocumentsState(projectId)
    if (!current?.documents[requestedCanvasId] || current.activeCanvasId === requestedCanvasId) return
    selectContentCanvasDocument(projectId, requestedCanvasId)
    setCanvasDocumentsVersion((version) => version + 1)
  }, [projectId, requestedCanvasId])

  const canvasDocumentsState = useMemo(
    () => {
      void canvasDocumentsVersion
      return readContentCanvasDocumentsState(projectId)
    },
    [canvasDocumentsVersion, projectId],
  )
  const creativeCanvasDocument = useMemo(
    () => activeContentCanvasDocument(canvasDocumentsState),
    [canvasDocumentsState],
  )
  const creativeCanvasDocumentId = creativeCanvasDocument?.id
  const creativeCanvasDocuments = useMemo(
    () => Object.values(canvasDocumentsState?.documents ?? {}),
    [canvasDocumentsState?.documents],
  )
  const creativeCanvasNodeIds = useMemo(
    () => contentCanvasDocumentNodeIds(creativeCanvasDocument),
    [creativeCanvasDocument],
  )
  const creativeCanvasNodePositions = useMemo(
    () => contentCanvasDocumentPositions(creativeCanvasDocument),
    [creativeCanvasDocument],
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
    if (!projectId) return undefined
    const activeJobIds = new Set(activeContentUnitCandidateJobIds)
    return subscribeSurfaceGenerationJobStatus((event) => {
      const sameProject = event.projectId !== undefined && event.projectId === projectId
      const trackedActiveJob = activeJobIds.has(event.jobId)
      if (!sameProject && !trackedActiveJob) return
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
      addCommandResultNodesToActiveCanvas({
        activeCanvasId: creativeCanvasDocumentId,
        graphIndex: viewModel.graphIndex,
        projectId,
        result,
      })
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
  }, [creativeCanvasDocumentId, gateway, projectId, queryClient, viewModel.graphIndex])

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
    setActiveCanvasNodeId(nodeId)
    if (kind === 'scene_moment') {
      setActiveProductionId(null)
      setActiveSceneId(nodeId)
    }
    if (kind === 'setting') setActiveSettingId(nodeId)
    setSelection({ kind, nodeId })
    setCreateSelection(null)
  }, [])

  const commitCreativeCanvasNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    updateContentCanvasDocumentNodePositions(projectId, creativeCanvasDocumentId, { [nodeId]: position })
  }, [creativeCanvasDocumentId, projectId])

  const commitCreativeCanvasNodePositions = useCallback((nodePositions: Record<string, { x: number; y: number }>) => {
    updateContentCanvasDocumentNodePositions(projectId, creativeCanvasDocumentId, nodePositions)
  }, [creativeCanvasDocumentId, projectId])

  const commitCreativeCanvasViewport = useCallback((viewport: Viewport) => {
    updateContentCanvasDocumentViewport(projectId, creativeCanvasDocumentId, viewport)
  }, [creativeCanvasDocumentId, projectId])

  const clearCreativeCanvasManualPositions = useCallback(() => {
    clearContentCanvasDocumentNodePositions(projectId, creativeCanvasDocumentId)
  }, [creativeCanvasDocumentId, projectId])

  const clearCreativeCanvasManualPositionsForNodes = useCallback((nodeIds: string[]) => {
    removeContentCanvasDocumentNodes(projectId, creativeCanvasDocumentId, nodeIds)
  }, [creativeCanvasDocumentId, projectId])

  const createFreeCreativeCanvasDocument = useCallback(() => {
    createContentCanvasDocument(projectId)
  }, [projectId])

  const selectFreeCreativeCanvasDocument = useCallback((canvasId: string) => {
    selectContentCanvasDocument(projectId, canvasId)
  }, [projectId])

  const addNodeToCreativeCanvas = useCallback((nodeId: string, position?: ContentCanvasNodePosition) => {
    const node = viewModel.graphIndex.nodeById.get(nodeId)
    addContentCanvasDocumentNodes(projectId, creativeCanvasDocumentId, contentCanvasDocumentNodeInputsWithReferences({
      existingNodeIds: creativeCanvasNodeIds,
      graph: viewModel.graph,
      nodeId,
      position,
    }))
    if (node) {
      const focusState = contentCanvasCommandFocusState(node.id)
      if (focusState) {
        if (focusState.activeCanvasNodeId !== undefined) setActiveCanvasNodeId(focusState.activeCanvasNodeId)
        if (focusState.activeSettingId !== undefined) setActiveSettingId(focusState.activeSettingId)
        if (focusState.activeProductionId !== undefined) setActiveProductionId(focusState.activeProductionId)
        if (focusState.activeSceneId !== undefined) setActiveSceneId(focusState.activeSceneId)
        setSelection(focusState.selection)
      }
      setCreativeCanvasFocusRequest((current) => ({ nodeId: node.id, requestId: (current?.requestId ?? 0) + 1 }))
      setCreateSelection(null)
    }
  }, [creativeCanvasDocumentId, creativeCanvasNodeIds, projectId, viewModel.graph, viewModel.graphIndex])

  const clearRemovedCreativeCanvasNodeFocus = useCallback((nodeId: string) => {
    if (activeCanvasNodeId === nodeId) setActiveCanvasNodeId(null)
    if (activeSettingId === nodeId) setActiveSettingId(null)
    if (activeProductionId === nodeId) setActiveProductionId(null)
    if (activeSceneId === nodeId) setActiveSceneId(null)
    if (selection.nodeId === nodeId) setSelection({ kind: 'scene_moment', nodeId: 'scene-main' })
    setCreateSelection(null)
  }, [
    activeCanvasNodeId,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    selection.nodeId,
  ])

  const removeNodeFromCreativeCanvas = useCallback((nodeId: string) => {
    removeContentCanvasDocumentNodes(projectId, creativeCanvasDocumentId, [nodeId])
    clearRemovedCreativeCanvasNodeFocus(nodeId)
  }, [
    clearRemovedCreativeCanvasNodeFocus,
    creativeCanvasDocumentId,
    projectId,
  ])

  const removeNodeFromAllCreativeCanvases = useCallback((nodeId: string) => {
    removeContentCanvasDocumentNodesEverywhere(projectId, [nodeId])
    clearRemovedCreativeCanvasNodeFocus(nodeId)
  }, [clearRemovedCreativeCanvasNodeFocus, projectId])

  const deleteCreativeCanvasNode = useCallback((node: ContentCanvasNode) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`node-delete:${node.id}`, () => deleteContentCanvasNode(projectId, node, gateway))
      .then((result) => {
        if (!result) return
        removeNodeFromAllCreativeCanvases(node.id)
        setCreateSelection(null)
      })
  }, [
    gateway,
    projectId,
    removeNodeFromAllCreativeCanvases,
    runCanvasCommand,
  ])

  const positionForCreativeCanvasChild = useCallback((node: ContentCanvasNode, slot = 1): ContentCanvasNodePosition => {
    const position = creativeCanvasNodePositions[node.id] ?? node.position
    return suggestedContentCanvasChildNodePosition({ position }, slot)
  }, [creativeCanvasNodePositions])

  const openCreativeCanvasCreateChild = useCallback((
    node: ContentCanvasNode,
    childKind: Extract<CreativeCanvasAction, { kind: 'create_child' }>['childKind'],
    position?: ContentCanvasNodePosition,
    input?: ContentCanvasCreateNodeInput,
  ) => {
    setActiveCanvasNodeId(node.id)
    creationCommands.createCreativeCanvasChild(node, childKind, position ?? positionForCreativeCanvasChild(node), input)
  }, [creationCommands, positionForCreativeCanvasChild])

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
    void navigate(surfaceRoutePath('resources', { resourceId }))
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
    options: Partial<ContentCanvasCandidateGenerationOptions> = {},
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

  const createResourceCandidateForNode = useCallback((
    node: ContentCanvasNode | undefined,
    resource: ContentCanvasUploadedResource,
    position?: ContentCanvasNodePosition,
  ) => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!node || !target || !projectId || !gateway) return
    const sourceNode = node
    void runCanvasCommand(`candidate-resource:${target.contentUnitNodeId}:${resource.id}`, () => (
      ensureCandidateContentUnitWithPrompt(sourceNode)
        .then((contentUnitNode) => createCandidateFromResourceForContentUnit(projectId, contentUnitNode, resource, position, gateway))
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

  const commitStructuredPromptDraft = useCallback((node: ContentCanvasNode | undefined, structured: Record<string, unknown>) => {
    const contentUnitNode = contentUnitNodeForGenerationTask(node) ?? (node?.kind === 'content_unit' ? node : undefined)
    const targetNode = contentUnitNode ?? node
    if (!targetNode || !projectId || !gateway) return
    void runCanvasCommand(`prompt-structured:${targetNode.id}`, () => (
      ensureDefaultContentUnitFromCanvasNode(projectId, targetNode, gateway)
        .then((ensuredContentUnitNode) => updateContentUnitStructuredPromptFromCanvas(projectId, ensuredContentUnitNode, structured, gateway))
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
    workspaceMode,
    workspaceTab,
  })

  return {
    activeKind,
    activeCreativeCanvasDocument: creativeCanvasDocument,
    addNodeToCreativeCanvas,
    candidateSelections,
    changeAssetPromptDraft,
    changeExpressionPromptDraft,
    closeSettingCreateDialog,
    commitPromptDraft,
    commitStructuredPromptDraft,
    commitCreativeCanvasNodePosition,
    commitCreativeCanvasNodePositions,
    commitCreativeCanvasViewport,
    createAssetForState: creationCommands.createAssetForState,
    createCreativeCanvasRoot: creationCommands.createCreativeCanvasRoot,
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
    createFreeCreativeCanvasDocument,
    creativeCanvasFocusRequest,
    creativeCanvasDocuments,
    creativeCanvasNodeIds,
    creativeCanvasNodePositions,
    creativeCanvasViewport: creativeCanvasDocument?.viewport,
    closeStructureCreateDialog,
    createCandidateForNode,
    deleteCreativeCanvasNode,
    previewCandidatePromptForNode,
    createResourceCandidateForNode,
    createCreativeCanvasNode: creationCommands.createCreativeCanvasNode,
    uploadCandidateForNode,
    openSettingCreateDialog,
    openCreativeCanvasCreateChild,
    openProductionCreateDialog,
    openStructureChildCreateDialog,
    pendingCanvasAction,
    projectId,
    projectQuery,
    removeNodeFromCreativeCanvas,
    runCanvasCommand,
    selectCandidate,
    selectCandidateNode,
    selectFreeCreativeCanvasDocument,
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

function addCommandResultNodesToActiveCanvas(input: {
  activeCanvasId: string | undefined
  graphIndex: { nodeById: Map<string, ContentCanvasNode> }
  projectId: number | undefined
  result: ContentCanvasCommandResult
}): void {
  const nodeIds = new Set<string>()
  for (const nodeId of input.result.changedNodeIds) nodeIds.add(nodeId)
  for (const nodeId of Object.keys(input.result.nodePositions ?? {})) nodeIds.add(nodeId)
  if (input.result.focusNodeId) nodeIds.add(input.result.focusNodeId)
  if (!nodeIds.size) return
  const nodes = [...nodeIds].flatMap((nodeId) => {
    const node = input.graphIndex.nodeById.get(nodeId)
    if (node) {
      if (contentCanvasCommandResultNodeIsDerived(node)) return []
      return [{
        nodeId,
        kind: node.kind,
        position: input.result.nodePositions?.[nodeId],
      }]
    }
    const kind = contentCanvasNodeKindFromId(nodeId)
    if (!kind || contentCanvasCommandResultNodeIdIsDerived(nodeId, input.result.focusNodeId)) return []
    return [{
      nodeId,
      kind,
      position: input.result.nodePositions?.[nodeId],
    }]
  })
  addContentCanvasDocumentNodes(input.projectId, input.activeCanvasId, nodes)
}

function contentCanvasCommandResultNodeIsDerived(node: ContentCanvasNode): boolean {
  if (node.kind === 'content_unit' && contentCanvasCommandResultNodeIsNakedTask(node)) return false
  return node.kind === 'production'
    || node.kind === 'segment'
    || node.kind === 'setting'
    || node.kind === 'state'
    || node.kind === 'content_unit'
    || node.kind === 'candidate'
    || node.kind === 'selection'
}

function contentCanvasCommandResultNodeIsNakedTask(node: ContentCanvasNode): boolean {
  const modelIntent = node.record.model_intent
  return Boolean(modelIntent
    && typeof modelIntent === 'object'
    && !Array.isArray(modelIntent)
    && (modelIntent as Record<string, unknown>).source === 'content_canvas_naked_task')
}

function contentCanvasCommandResultNodeIdIsDerived(nodeId: string, focusNodeId: string | undefined): boolean {
  const kind = contentCanvasNodeKindFromId(nodeId)
  if (kind === 'content_unit') return focusNodeId !== nodeId
  return kind === 'production'
    || kind === 'segment'
    || kind === 'setting'
    || kind === 'state'
    || kind === 'candidate'
    || kind === 'selection'
}

function contentCanvasNodeKindFromId(nodeId: string): ContentCanvasNode['kind'] | undefined {
  const kind = nodeId.split(':')[0]
  if (kind === 'production'
    || kind === 'segment'
    || kind === 'setting'
    || kind === 'state'
    || kind === 'scene_moment'
    || kind === 'expression_unit'
    || kind === 'asset'
    || kind === 'keyframe'
    || kind === 'storyboard'
    || kind === 'content_unit'
    || kind === 'candidate'
    || kind === 'selection'
    || kind === 'resource') return kind
  return undefined
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
