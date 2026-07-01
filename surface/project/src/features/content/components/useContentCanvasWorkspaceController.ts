import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Viewport } from '@xyflow/react'

import type { GenerationBackendPreflightResult } from '@movscript/core/generation'
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
  contentCanvasDocumentsHaveUnsavedProjectChanges,
  contentCanvasDocumentGroups,
  contentCanvasDocumentNodeIds,
  contentCanvasDocumentPositions,
  createContentCanvasDocumentGroup,
  createContentCanvasDocument,
  ensureContentCanvasDocumentsState,
  readContentCanvasDocumentsState,
  renameContentCanvasDocument,
  removeContentCanvasDocumentGroups,
  removeContentCanvasDocumentNodesEverywhere,
  removeContentCanvasDocumentNodes,
  saveContentCanvasDocumentsToProject,
  subscribeContentCanvasDocumentsState,
  updateContentCanvasDocumentNodePositions,
} from '../application/contentCanvasDocuments'
import {
  readContentCanvasViewState,
  subscribeContentCanvasViewState,
  updateContentCanvasViewport,
  type ContentCanvasViewStateScope,
} from '../application/contentCanvasViewState'
import { contentCanvasDocumentNodeInputsWithReferences } from '../application/contentCreativeCanvasReferences'
import { resolveContentCanvasProjectEntrySessionState } from '../application/contentCanvasProjectEntrySession'
import { loadContentCanvasProject } from '../application/loadContentCanvasProject'
import {
  createCandidateFromResourceForContentUnit,
  createCandidateFromContentUnit,
  deleteContentCanvasNode,
  ensureDefaultContentUnitFromCanvasNode,
  removeContentUnitCandidateFromCanvas,
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
import {
  generationReferencesFromContentNode,
  promptFromContentNode,
  upsertContentNodeGenerationReference,
} from './contentCanvasWorkspaceNodeModel'
import { buildContentCanvasWorkspaceViewModel, type ContentCanvasWorkspacePreviewInput } from './contentCanvasWorkspaceViewModel'
import {
  mergeContentCanvasCommandCandidates,
  mergeContentCanvasCommandRemovedCandidates,
  mergeContentCanvasCommandSelections,
  type LocalContentCanvasCandidates,
  type LocalContentCanvasRemovedCandidates,
  withLocalContentCanvasCandidates,
} from './contentCanvasWorkspaceCandidateModel'
import { useContentCanvasWorkspaceSession } from './useContentCanvasWorkspaceSession'
import { useContentCanvasWorkspaceCreationCommands } from './useContentCanvasWorkspaceCreationCommands'
import {
  contentCanvasNamespaceVocabularyOptions,
  contentCanvasNextTimelineNamespaceKind,
} from './contentCanvasNamespaceVocabularyModel'
import { useSurfaceHostState } from '../../project/application/surfaceHostStateHooks'
import {
  contentCanvasProjectEntrySessionId,
  type ProjectEntrySessionId,
} from '../../project/application/projectEntrySessionStore'

const CONTENT_CANVAS_PROJECT_QUERY_STALE_MS = 12_000
const CONTENT_CANVAS_ACTIVE_CANDIDATE_REFRESH_MS = 10_000

interface UseContentCanvasWorkspaceControllerInput {
  workspaceMode?: ContentWorkspaceTab
}

type RunCanvasCommandOptions = {
  silentSuccess?: boolean
}

export function useContentCanvasWorkspaceController({
  workspaceMode,
}: UseContentCanvasWorkspaceControllerInput = {}) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const project = useSurfaceHostState((state) => state.currentProject)
  const workspaceRoot = useSurfaceHostState((state) => state.workspaceRoot)
  const projectId = project?.ID
  const projectDir = useMemo(
    () => workspaceRoot?.trim() || project?.workspace_path?.trim() || project?.project_path?.trim() || undefined,
    [project?.project_path, project?.workspace_path, workspaceRoot],
  )
  const [searchParams] = useSearchParams()
  const requestedCanvasId = (searchParams.get('canvasId') ?? searchParams.get('canvas'))?.trim() || undefined
  const projectEntryId = useMemo(
    () => contentCanvasProjectEntryIdForRoute(location.pathname, workspaceMode, requestedCanvasId),
    [location.pathname, requestedCanvasId, workspaceMode],
  )
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
  const [localRemovedContentUnitCandidates, setLocalRemovedContentUnitCandidates] = useState<LocalContentCanvasRemovedCandidates>({})
  const [pendingCanvasAction, setPendingCanvasAction] = useState<string | null>(null)
  const [creativeCanvasSavePending, setCreativeCanvasSavePending] = useState(false)
  const [settingCreateDialog, setSettingCreateDialog] = useState<SettingCreateDialogState | null>(null)
  const [structureCreateDialog, setStructureCreateDialog] = useState<StructureCreateDialogState | null>(null)
  const [canvasDocumentsVersion, setCanvasDocumentsVersion] = useState(0)
  const [canvasViewStateVersion, setCanvasViewStateVersion] = useState(0)
  const lastCommittedPromptByNodeIdRef = useRef<Record<string, string>>({})
  const gateway = useMemo(
    () => projectId ? createElectronContentCanvasWorkspaceGateway(projectId, { projectDir }) : null,
    [projectDir, projectId],
  )

  const projectQuery = useQuery({
    queryKey: contentCanvasKeys.project(projectId, projectDir),
    queryFn: () => loadContentCanvasProject(projectId!, gateway!),
    enabled: Boolean(projectId && gateway),
    staleTime: CONTENT_CANVAS_PROJECT_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    setCandidateSelections({})
    setLocalContentUnitCandidates({})
    setLocalRemovedContentUnitCandidates({})
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

  const canvasDocumentsState = useMemo(
    () => {
      void canvasDocumentsVersion
      return readContentCanvasDocumentsState(projectId)
    },
    [canvasDocumentsVersion, projectId],
  )
  const requestedCreativeCanvasDocument = useMemo(
    () => requestedCanvasId ? canvasDocumentsState?.documents[requestedCanvasId] : undefined,
    [canvasDocumentsState?.documents, requestedCanvasId],
  )
  const creativeCanvasDocument = useMemo(
    () => requestedCreativeCanvasDocument ?? activeContentCanvasDocument(canvasDocumentsState),
    [canvasDocumentsState, requestedCreativeCanvasDocument],
  )
  const creativeCanvasDocumentId = creativeCanvasDocument?.id
  const creativeCanvasViewStateScope = useMemo(
    () => contentCanvasDocumentViewStateScope(creativeCanvasDocumentId),
    [creativeCanvasDocumentId],
  )
  const creativeCanvasViewState = useMemo(
    () => {
      void canvasViewStateVersion
      return readContentCanvasViewState(projectId, creativeCanvasViewStateScope)
    },
    [canvasViewStateVersion, creativeCanvasViewStateScope, projectId],
  )
  useEffect(() => {
    if (!projectId) return undefined
    return subscribeContentCanvasViewState(projectId, creativeCanvasViewStateScope, () => {
      setCanvasViewStateVersion((version) => version + 1)
    })
  }, [creativeCanvasViewStateScope, projectId])
  const creativeCanvasDocuments = useMemo(
    () => Object.values(canvasDocumentsState?.documents ?? {}),
    [canvasDocumentsState?.documents],
  )
  const creativeCanvasHasUnsavedChanges = useMemo(
    () => {
      void canvasDocumentsVersion
      return contentCanvasDocumentsHaveUnsavedProjectChanges(projectId)
    },
    [canvasDocumentsVersion, projectId],
  )
  const creativeCanvasNodeIds = useMemo(
    () => contentCanvasDocumentNodeIds(creativeCanvasDocument),
    [creativeCanvasDocument],
  )
  const creativeCanvasNodePositions = useMemo(
    () => contentCanvasDocumentPositions(creativeCanvasDocument),
    [creativeCanvasDocument],
  )
  const creativeCanvasGroups = useMemo(
    () => contentCanvasDocumentGroups(creativeCanvasDocument),
    [creativeCanvasDocument],
  )

  const projectDataWithLocalCandidates = useMemo(
    () => withLocalContentCanvasCandidates(projectQuery.data, localContentUnitCandidates, localRemovedContentUnitCandidates),
    [localContentUnitCandidates, localRemovedContentUnitCandidates, projectQuery.data],
  )
  const namespaceVocabulary = useMemo(
    () => contentCanvasNamespaceVocabularyOptions(projectDataWithLocalCandidates),
    [projectDataWithLocalCandidates],
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
  const routePreviewTargetNodeId = useMemo(
    () => resolveContentCanvasProjectEntrySessionState({
      hasExplicitSearch: true,
      searchParams,
      snapshot: null,
    })?.activeCanvasNodeId ?? null,
    [searchParams],
  )
  const previewInput = useMemo<ContentCanvasWorkspacePreviewInput | undefined>(
    () => contentCanvasWorkspacePreviewInputForRoute({
      activeCanvasNodeId,
      activeProductionId,
      activeSettingId,
      projectEntryId,
      routePreviewTargetNodeId,
      workspaceTab: workspaceMode ?? workspaceTab,
    }),
    [
      activeCanvasNodeId,
      activeProductionId,
      activeSettingId,
      projectEntryId,
      routePreviewTargetNodeId,
      workspaceMode,
      workspaceTab,
    ],
  )

  useEffect(() => {
    if (!projectId || !hasActiveContentUnitCandidate || activeContentUnitCandidateJobIds.length === 0) return undefined
    const timer = window.setInterval(() => {
      invalidateContentCanvasMutationResult(queryClient, contentCanvasProjectChangedResult({
        projectId,
        changedIds: [],
      }))
    }, CONTENT_CANVAS_ACTIVE_CANDIDATE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [activeContentUnitCandidateJobIdKey, activeContentUnitCandidateJobIds.length, hasActiveContentUnitCandidate, projectId, queryClient])

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
    preview: previewInput,
    selection,
    settingQuery,
  }), [
    activeKind,
    activeCanvasNodeId,
    activeProductionId,
    activeSceneId,
    activeSettingId,
    previewInput,
    projectDataWithLocalCandidates,
    selection,
    settingQuery,
  ])

  const runCanvasCommand = useCallback(async (
    actionKey: string,
    command: () => Promise<ContentCanvasCommandResult>,
    options: RunCanvasCommandOptions = {},
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
      setLocalRemovedContentUnitCandidates((current) => mergeContentCanvasCommandRemovedCandidates(current, result))
      setCandidateSelections((current) => mergeContentCanvasCommandSelections(current, result))
      if (!options.silentSuccess) toast.success(result.message)
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
    namespaceVocabulary,
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
    const parentNode = treeNode.id ? viewModel.graphIndex.nodeById.get(treeNode.id) : undefined
    const nextNamespaceKind = parentNode?.domainCategory === 'timeline_namespace'
      ? contentCanvasNextTimelineNamespaceKind(parentNode, namespaceVocabulary)
      : undefined
    if (treeNode.kind === 'production' || (treeNode.kind === 'segment' && nextNamespaceKind)) {
      setStructureCreateDialog({ kind: 'segment', parent: treeNode })
      return
    }
    if (treeNode.kind === 'segment') {
      setStructureCreateDialog({ kind: 'scene_moment', parent: treeNode })
    }
  }, [namespaceVocabulary, viewModel.graphIndex])

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

  const clearCanvasSelection = useCallback(() => {
    setActiveCanvasNodeId(null)
    setSelection({ kind: 'scene_moment', nodeId: 'scene-main' })
    setCreateSelection(null)
  }, [])

  const commitCreativeCanvasNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    updateContentCanvasDocumentNodePositions(projectId, creativeCanvasDocumentId, { [nodeId]: position })
  }, [creativeCanvasDocumentId, projectId])

  const commitCreativeCanvasNodePositions = useCallback((nodePositions: Record<string, { x: number; y: number }>) => {
    updateContentCanvasDocumentNodePositions(projectId, creativeCanvasDocumentId, nodePositions)
  }, [creativeCanvasDocumentId, projectId])

  const commitCreativeCanvasViewport = useCallback((viewport: Viewport) => {
    updateContentCanvasViewport(projectId, viewport, creativeCanvasViewStateScope)
  }, [creativeCanvasViewStateScope, projectId])

  const clearCreativeCanvasManualPositions = useCallback(() => {
    clearContentCanvasDocumentNodePositions(projectId, creativeCanvasDocumentId)
  }, [creativeCanvasDocumentId, projectId])

  const clearCreativeCanvasManualPositionsForNodes = useCallback((nodeIds: string[]) => {
    removeContentCanvasDocumentNodes(projectId, creativeCanvasDocumentId, nodeIds)
  }, [creativeCanvasDocumentId, projectId])

  const createFreeCreativeCanvasDocument = useCallback((title?: string) => {
    try {
      const next = createContentCanvasDocument(projectId, title !== undefined ? { title } : {})
      const nextCanvasId = next?.activeCanvasId
      if (!nextCanvasId || projectEntryId === 'content_preview' || projectEntryId === 'setting_preview') return
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.set('canvasId', nextCanvasId)
      nextSearchParams.delete('canvas')
      navigate({
        pathname: location.pathname,
        search: `?${nextSearchParams.toString()}`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '内容画布创建失败')
    }
  }, [location.pathname, navigate, projectEntryId, projectId, searchParams])

  const renameFreeCreativeCanvasDocument = useCallback((canvasId: string, title: string) => {
    try {
      renameContentCanvasDocument(projectId, canvasId, title)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '内容画布重命名失败')
    }
  }, [projectId])

  const saveCreativeCanvasDocuments = useCallback(() => {
    if (!projectId || creativeCanvasSavePending) return
    setCreativeCanvasSavePending(true)
    void saveContentCanvasDocumentsToProject(projectId)
      .then((result) => {
        toast.success(result.savedCount === 0
          ? '没有需要保存的内容画布'
          : result.savedCount > 1
            ? `已保存 ${result.savedCount} 个内容画布`
            : '内容画布已保存')
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : '内容画布保存失败')
      })
      .finally(() => setCreativeCanvasSavePending(false))
  }, [creativeCanvasSavePending, projectId])

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

  const removeNodesFromCreativeCanvas = useCallback((nodeIds: string[]) => {
    removeContentCanvasDocumentNodes(projectId, creativeCanvasDocumentId, nodeIds)
    for (const nodeId of nodeIds) clearRemovedCreativeCanvasNodeFocus(nodeId)
  }, [
    clearRemovedCreativeCanvasNodeFocus,
    creativeCanvasDocumentId,
    projectId,
  ])

  const createCreativeCanvasGroup = useCallback((input: Parameters<typeof createContentCanvasDocumentGroup>[2]) => {
    createContentCanvasDocumentGroup(projectId, creativeCanvasDocumentId, input)
  }, [creativeCanvasDocumentId, projectId])

  const removeGroupsFromCreativeCanvas = useCallback((groupIds: string[]) => {
    removeContentCanvasDocumentGroups(projectId, creativeCanvasDocumentId, groupIds)
  }, [creativeCanvasDocumentId, projectId])

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

  const removeCandidate = useCallback((node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!target) return
    setCandidateSelections((current) => {
      if (current[target.contentUnitNodeId] !== candidate.id && current[target.contentUnitId] !== candidate.id) return current
      const next = { ...current }
      if (next[target.contentUnitNodeId] === candidate.id) delete next[target.contentUnitNodeId]
      if (next[target.contentUnitId] === candidate.id) delete next[target.contentUnitId]
      return next
    })
    setLocalRemovedContentUnitCandidates((current) =>
      mergeContentCanvasCommandRemovedCandidates(current, {
        removedCandidates: [{ contentUnitId: target.contentUnitId, candidateId: candidate.id }],
      }))
    if (!projectId || !gateway) {
      toast.success('已从当前画布候选列表移出')
      return
    }
    void runCanvasCommand(`candidate-remove:${target.contentUnitNodeId}:${candidate.id}`, () => (
      removeContentUnitCandidateFromCanvas(projectId, target.node, candidate, gateway)
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
    const promptDraft = draftPromptForCandidateNode(node)
    const previewPromptText = promptDraft ?? promptFromContentNode(target.node) ?? ''
    const outputKind = contentUnitGenerationOutputKind(target.node)
    if (outputKind !== 'image' && outputKind !== 'video') return emptyPromptPreview()
    if (!target.node.sourcePath) {
      return {
        text: previewPromptText,
        compiledText: previewPromptText,
        resourceIds: [],
        referenceAssets: [],
        replacements: [],
        blockers: [],
      }
    }
    const preview = await gateway.previewContentUnitGenerationPrompt({
      projectId,
      contentUnitId: target.contentUnitId,
      candidateId: 'preview',
      outputKind,
      promptText: previewPromptText,
    })
    console.info('[content-canvas] preview compiled candidate prompt', JSON.stringify({
      sourceNodeId: node.id,
      contentUnitId: target.contentUnitId,
      textPreview: preview.text.slice(0, 200),
      blockerCount: preview.blockers.length,
      blockers: preview.blockers,
    }))
    return preview
  }, [draftPromptForCandidateNode, gateway, projectId])

  const preflightCandidateForNode = useCallback(async (
    node: ContentCanvasNode | undefined,
    options: Partial<ContentCanvasCandidateGenerationOptions> = {},
  ): Promise<GenerationBackendPreflightResult> => {
    const target = contentCanvasGenerationTargetForNode(node)
    if (!node || !target || !projectId || !gateway) {
      return blockedGenerationPreflight('content_canvas_context_missing', '内容画布未连接项目工作区')
    }
    const promptDraft = draftPromptForCandidateNode(node)
    const previewPromptText = promptDraft ?? promptFromContentNode(target.node) ?? ''
    const outputKind = contentUnitGenerationOutputKind(target.node)
    if (outputKind !== 'image' && outputKind !== 'video') {
      return blockedGenerationPreflight('unsupported_output_kind', '当前创作片段候选生成只支持图像/视频')
    }
    if (!target.node.sourcePath) {
      return { status: 'ready', ready: true, blockers: [] }
    }
    try {
      return await gateway.preflightContentUnitCandidate({
        projectId,
        contentUnitId: target.contentUnitId,
        candidateId: 'preflight',
        outputKind,
        promptText: previewPromptText,
        ...(options.modelId ? { modelId: options.modelId } : {}),
        ...(options.params ? { params: options.params } : {}),
        ...(options.supportedParams ? { supportedParams: options.supportedParams } : {}),
        ...(options.generationIntent ? { generationIntent: options.generationIntent } : {}),
        ...(options.generationOperationExplicit !== undefined ? { generationOperationExplicit: options.generationOperationExplicit } : {}),
      })
    } catch (error) {
      return blockedGenerationPreflight(
        'content_candidate_preflight_failed',
        error instanceof Error ? error.message : '候选生成预检失败',
      )
    }
  }, [draftPromptForCandidateNode, gateway, projectId])

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
    ), { silentSuccess: true })
  }, [gateway, projectId, runCanvasCommand])

  const commitStructuredPromptDraft = useCallback((node: ContentCanvasNode | undefined, structured: Record<string, unknown>) => {
    const contentUnitNode = contentUnitNodeForGenerationTask(node) ?? (node?.kind === 'content_unit' ? node : undefined)
    const targetNode = contentUnitNode ?? node
    if (!targetNode || !projectId || !gateway) return
    void runCanvasCommand(`prompt-structured:${targetNode.id}`, () => (
      ensureDefaultContentUnitFromCanvasNode(projectId, targetNode, gateway)
        .then((ensuredContentUnitNode) => updateContentUnitStructuredPromptFromCanvas(projectId, ensuredContentUnitNode, structured, gateway))
    ), { silentSuccess: true })
  }, [gateway, projectId, runCanvasCommand])

  const appendGenerationReferenceDraft = useCallback((
    targetNode: ContentCanvasNode | undefined,
    sourceNode: ContentCanvasNode | undefined,
    options: { role?: string; mediaType?: string } = {},
  ) => {
    const contentUnitNode = contentUnitNodeForGenerationTask(targetNode) ?? (targetNode?.kind === 'content_unit' ? targetNode : undefined)
    const writeTargetNode = contentUnitNode ?? targetNode
    if (!writeTargetNode || !sourceNode || !projectId || !gateway) return
    void runCanvasCommand(`generation-reference:${writeTargetNode.id}:${sourceNode.id}`, async () => {
      const ensuredContentUnitNode = await ensureDefaultContentUnitFromCanvasNode(projectId, writeTargetNode, gateway)
      const currentPrompt = promptFromContentNode(ensuredContentUnitNode) ?? promptFromContentNode(writeTargetNode) ?? ''
      const nextReferences = upsertContentNodeGenerationReference(
        generationReferencesFromContentNode(ensuredContentUnitNode),
        sourceNode,
        options,
      )
      return updateContentUnitPromptFromCanvas(projectId, ensuredContentUnitNode, currentPrompt, gateway, {
        generationReferences: nextReferences,
      })
    }, { silentSuccess: true })
  }, [gateway, projectId, runCanvasCommand])

  const commitPromptReferencePoolDraft = useCallback((
    node: ContentCanvasNode | undefined,
    prompt: string,
    generationReferences: Array<Record<string, unknown>>,
  ) => {
    const contentUnitNode = contentUnitNodeForGenerationTask(node) ?? (node?.kind === 'content_unit' ? node : undefined)
    const targetNode = contentUnitNode ?? node
    if (!targetNode || !projectId || !gateway) return
    void runCanvasCommand(`generation-reference-pool:${targetNode.id}`, async () => {
      const ensuredContentUnitNode = await ensureDefaultContentUnitFromCanvasNode(projectId, targetNode, gateway, prompt)
      return updateContentUnitPromptFromCanvas(projectId, ensuredContentUnitNode, prompt, gateway, {
        generationReferences,
      })
    }, { silentSuccess: true })
  }, [gateway, projectId, runCanvasCommand])

  const saveExpressionUnit = useCallback((node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => {
    if (!projectId || !gateway) return
    void runCanvasCommand(`expression-save:${node.id}`, () => updateExpressionUnitFromCanvas(projectId, node, input, gateway))
  }, [gateway, projectId, runCanvasCommand])

  useContentCanvasWorkspaceSession({
    activeKind,
    activeCanvasNodeId,
    graphIndex: viewModel.fullGraphIndex,
    projectEntryId,
    projectId,
    searchParams,
    selection,
    canvasId: creativeCanvasDocumentId,
    canvasTitle: creativeCanvasDocument?.title,
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
    activeCanvasNodeId,
    activeKind,
    activeCreativeCanvasDocument: creativeCanvasDocument,
    addNodeToCreativeCanvas,
    candidateSelections,
    changeAssetPromptDraft,
    changeExpressionPromptDraft,
    closeSettingCreateDialog,
    commitPromptDraft,
    commitPromptReferencePoolDraft,
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
    createCreativeCanvasGroup,
    draftAssetPrompts,
    draftExpressionPrompts,
    appendGenerationReferenceDraft,
    namespaceVocabulary,
    projectEntryId,
    clearCanvasSelection,
    clearCreativeCanvasManualPositions,
    clearCreativeCanvasManualPositionsForNodes,
    createFreeCreativeCanvasDocument,
    creativeCanvasFocusRequest,
    creativeCanvasDocuments,
    creativeCanvasGroups,
    creativeCanvasHasUnsavedChanges,
    creativeCanvasNodeIds,
    creativeCanvasNodePositions,
    creativeCanvasSavePending,
    creativeCanvasViewport: creativeCanvasViewState?.viewport ?? creativeCanvasDocument?.viewport,
    closeStructureCreateDialog,
    createCandidateForNode,
    deleteCreativeCanvasNode,
    previewCandidatePromptForNode,
    preflightCandidateForNode,
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
    removeCandidate,
    removeGroupsFromCreativeCanvas,
    removeNodeFromCreativeCanvas,
    removeNodesFromCreativeCanvas,
    renameFreeCreativeCanvasDocument,
    runCanvasCommand,
    saveCreativeCanvasDocuments,
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

function contentCanvasDocumentViewStateScope(canvasId: string | undefined): ContentCanvasViewStateScope | undefined {
  return canvasId ? { mode: `content-canvas:${canvasId}` } : undefined
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
      const status = normalizedContentCanvasCandidateStatus(candidate)
      return status === 'queued' || status === 'pending' || status === 'running'
    }),
  )
}

function contentCanvasProjectActiveCandidateJobIds(projectData: ReturnType<typeof withLocalContentCanvasCandidates>): number[] {
  if (!projectData) return []
  const ids = new Set<number>()
  for (const candidates of Object.values(projectData.contentUnitCandidates)) {
    for (const candidate of candidates) {
      const status = normalizedContentCanvasCandidateStatus(candidate)
      if (status !== 'queued' && status !== 'pending' && status !== 'running') continue
      const jobId = numericValue(candidate.producer?.job_id ?? candidate.producer?.jobId)
      if (jobId !== undefined) ids.add(jobId)
    }
  }
  return [...ids].sort((a, b) => a - b)
}

function normalizedContentCanvasCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const derived = derivedContentCanvasCandidateStatus(candidate)
  if (derived === 'failed' || derived === 'canceled' || derived === 'cancelled') return derived
  return candidate.status?.toLowerCase() ?? derived
}

function derivedContentCanvasCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const producer = recordValue(candidate.producer)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  const output = firstRecord(candidate.outputs)
  const outputMetadata = recordValue(output?.metadata)
  const status = scalarText([
    producer?.status,
    producer?.state,
    producer?.phase,
    producer?.result,
    promptSnapshot?.status,
    outputMetadata?.status,
  ])?.toLowerCase()
  if (status && ['failed', 'failure', 'error', 'errored'].includes(status)) return 'failed'
  if (status && ['canceled', 'cancelled'].includes(status)) return status
  if (scalarText([
    producer?.error_message,
    producer?.errorMessage,
    producer?.failure_reason,
    producer?.failureReason,
    producer?.error,
    promptSnapshot?.error_message,
    promptSnapshot?.errorMessage,
    outputMetadata?.error_message,
    outputMetadata?.errorMessage,
    outputMetadata?.error,
  ])) return 'failed'
  return status
}

function scalarText(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find(isRecord) : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
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

function contentCanvasWorkspacePreviewInputForRoute(input: {
  activeCanvasNodeId: string | null
  activeProductionId: string | null
  activeSettingId: string | null
  projectEntryId: ProjectEntrySessionId
  routePreviewTargetNodeId: string | null
  workspaceTab: ContentWorkspaceTab
}): ContentCanvasWorkspacePreviewInput | undefined {
  if (input.workspaceTab !== 'preview') return undefined
  if (input.projectEntryId === 'setting_preview') {
    return {
      kind: 'setting',
      targetNodeId: input.routePreviewTargetNodeId ?? input.activeCanvasNodeId ?? input.activeSettingId,
    }
  }
  if (input.projectEntryId === 'content_preview') {
    return {
      kind: 'production',
      targetNodeId: input.routePreviewTargetNodeId ?? input.activeCanvasNodeId ?? input.activeProductionId,
    }
  }
  return undefined
}

function emptyPromptPreview(): ContentCanvasGenerationPromptPreview {
  return { text: '', compiledText: '', resourceIds: [], referenceAssets: [], replacements: [], blockers: [] }
}

function blockedGenerationPreflight(code: string, message: string): GenerationBackendPreflightResult {
  return {
    status: 'blocked',
    ready: false,
    blockers: [{ code, message }],
  }
}

function contentCanvasProjectEntryIdForRoute(
  pathname: string,
  workspaceMode: ContentWorkspaceTab | undefined,
  canvasId: string | undefined,
): ProjectEntrySessionId {
  if (pathname.endsWith('/settings/preview')) return 'setting_preview'
  if (workspaceMode === 'canvas' || pathname.endsWith('/content/canvas')) return contentCanvasProjectEntrySessionId(canvasId)
  return 'content_preview'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
