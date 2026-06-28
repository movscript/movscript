import {
  appendContentSourceWorkspaceAssetCandidate,
  appendContentSourceWorkspaceContentUnitCandidate,
  buildContentSourceWorkspaceAudioCuePatch,
  buildContentSourceWorkspaceCandidateCreatePlan,
  buildContentSourceWorkspaceData,
  buildContentSourceWorkspaceEditPromptPatch,
  buildContentSourceWorkspaceExpressionUnitPatch,
  buildContentSourceWorkspaceHierarchyNodeRecord,
  buildContentSourceWorkspaceSelectionPatch,
  buildContentSourceWorkspaceStoryboardTimelinePatch,
  buildContentSourceWorkspaceTransitionPatch,
  createdContentSourceCandidateFromRecord,
  updateContentSourceWorkspaceAssetPrompt,
  updateContentSourceWorkspaceAudioCueState,
  updateContentSourceWorkspaceContentUnitPrompt,
  updateContentSourceWorkspaceContentUnitSelection,
  updateContentSourceWorkspaceExpressionUnitState,
  updateContentSourceWorkspaceHierarchyPlanning,
  type ContentCandidateRecord,
  type ContentSourceWorkspaceAudioCuePatch,
  type ContentSourceWorkspaceData,
  type ContentSourceWorkspaceEditPromptPatch,
  type ContentSourceWorkspaceExpressionUnitPatch,
  type ContentSourceWorkspaceCandidateOutput,
  type ContentSourceWorkspaceSnapshot,
  type ContentSourceWorkspaceStoryboardTimelinePatch,
  type ContentSourceWorkspaceTransitionPatch,
  type CreatedContentSourceCandidate,
} from './sourceWorkspaceData.js'
import { appendChildNode, type AddTarget } from './sourceWorkspaceTree.js'
import type {
  AudioCue,
  ExpressionUnit,
  HierarchyNode,
  HierarchyNodeType,
  HierarchyTransition,
  StoryboardTimeline,
} from './sourceWorkspaceTypes.js'

export type ContentSourceWorkspaceRuntimeStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'demo'
export type ContentSourceWorkspaceSourceSyncStatus = 'clean' | 'dirty' | 'syncing' | 'synced' | 'error'
export type ContentSourceWorkspaceRuntimeReloadPolicy = 'none' | 'reload'
export type ContentSourceWorkspaceRuntimeOperationStatus = 'pending' | 'committed' | 'rolled_back' | 'failed'

export interface ContentSourceWorkspaceRuntimeOperationTarget {
  kind: string
  id?: string
  path?: string
}

export interface ContentSourceWorkspaceRuntimeCommitResult {
  changedPaths?: readonly string[]
  snapshotVersion?: number
  reloadPolicy?: ContentSourceWorkspaceRuntimeReloadPolicy
}

export interface ContentSourceWorkspaceRuntimeOperation<T = ContentSourceWorkspaceRuntimeCommitResult | void> {
  operationId: string
  target: ContentSourceWorkspaceRuntimeOperationTarget
  optimisticPatch: string
  commit: (projectId: number) => Promise<T>
  rollback: () => void
  reloadPolicy: ContentSourceWorkspaceRuntimeReloadPolicy
  changedPaths: readonly string[]
}

export interface ContentSourceWorkspaceRuntimeOperationSnapshot {
  operationId: string
  target: ContentSourceWorkspaceRuntimeOperationTarget
  optimisticPatch: string
  reloadPolicy: ContentSourceWorkspaceRuntimeReloadPolicy
  changedPaths: readonly string[]
  status: ContentSourceWorkspaceRuntimeOperationStatus
  snapshotVersion?: number
  error?: string
}

export interface ContentSourceWorkspaceRuntimeState {
  status: ContentSourceWorkspaceRuntimeStatus
  sourceSyncStatus: ContentSourceWorkspaceSourceSyncStatus
  projectId?: number
  data?: ContentSourceWorkspaceData
  error?: string
  currentOperation?: ContentSourceWorkspaceRuntimeOperationSnapshot
  lastOperation?: ContentSourceWorkspaceRuntimeOperationSnapshot
  failedOperation?: ContentSourceWorkspaceRuntimeOperationSnapshot
}

export interface ContentSourceWorkspaceRuntimePort {
  loadSnapshot(projectId: number): Promise<ContentSourceWorkspaceSnapshot>
  selectContentUnitCandidate(input: {
    projectId: number
    contentUnitId: string
    candidateId: string
    resourceId?: number
    reason: 'content_source_workspace_selection'
  }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  createContentCandidate(input: {
    projectId: number
    contentUnitId: string
    candidateId: string
    source: 'ai_generate' | 'resource_library'
    status: 'queued' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'cancelled' | 'imported'
    producer: Record<string, unknown>
    outputs: ContentSourceWorkspaceCandidateOutput[]
    promptSnapshot: Record<string, unknown>
    createdAt: string
  }): Promise<ContentCandidateRecord>
  updateContentUnitEditPrompt(input: ContentSourceWorkspaceEditPromptPatch & { projectId: number }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  updateExpressionUnit(input: ContentSourceWorkspaceExpressionUnitPatch & { projectId: number }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  updateAudioCue(input: ContentSourceWorkspaceAudioCuePatch & { projectId: number }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  updateEntityTransition(input: ContentSourceWorkspaceTransitionPatch & { projectId: number }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  updateStoryboardTimeline(input: ContentSourceWorkspaceStoryboardTimelinePatch & { projectId: number }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  writeHierarchyNode(input: {
    projectId: number
    targetPath: string
    record: Record<string, unknown>
  }): Promise<ContentSourceWorkspaceRuntimeCommitResult | void>
  interpretWorkspace(projectId: number): Promise<void>
}

export interface ContentSourceWorkspaceRuntime {
  getState(): ContentSourceWorkspaceRuntimeState
  subscribe(listener: (state: ContentSourceWorkspaceRuntimeState) => void): () => void
  showDemo(data: ContentSourceWorkspaceData): void
  loadProject(projectId: number): Promise<void>
  selectCandidate(input: {
    contentUnitId: string
    candidateId: string
    resourceId?: number
  }): Promise<void>
  createCandidate(input: {
    contentUnitId: string
    outputKind: 'image' | 'video' | 'audio' | 'text' | 'storyboard'
    promptText?: string
    assetId?: string
    resourceId?: number
    resourceName?: string
    resourceType?: 'image' | 'video' | 'audio' | 'text' | 'file'
    resourceMimeType?: string
  }): Promise<CreatedContentSourceCandidate | undefined>
  updateEditPrompt(input: {
    contentUnitId: string
    targetPath: string
    text: string
    assetId?: string
  }): Promise<void>
  updateExpressionUnit(unit: ExpressionUnit): Promise<void>
  updateAudioCue(cue: AudioCue): Promise<void>
  updateTransition(input: {
    nodeId: string
    targetPath: string
    transition: HierarchyTransition
  }): Promise<void>
  updateStoryboardTimeline(input: {
    nodeId: string
    targetPath: string
    timeline: StoryboardTimeline
  }): Promise<void>
  createHierarchyNode(input: {
    type: HierarchyNodeType
    id: string
    title: string
    targetPath: string
    parentNode: HierarchyNode
    node: HierarchyNode
  }): Promise<void>
  sync(): Promise<void>
}

export function createContentSourceWorkspaceRuntime(options: {
  port: ContentSourceWorkspaceRuntimePort
  initialState?: Partial<ContentSourceWorkspaceRuntimeState>
}): ContentSourceWorkspaceRuntime {
  let state: ContentSourceWorkspaceRuntimeState = {
    status: 'idle',
    sourceSyncStatus: 'clean',
    ...options.initialState,
  }
  let loadToken = 0
  let operationSequence = 0
  const listeners = new Set<(state: ContentSourceWorkspaceRuntimeState) => void>()

  function setState(patch: Partial<ContentSourceWorkspaceRuntimeState>) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }

  function setData(updater: (data: ContentSourceWorkspaceData) => ContentSourceWorkspaceData) {
    if (!state.data) return
    setState({ data: updater(state.data) })
  }

  function requireWorkspaceProject(): number | undefined {
    if (!state.projectId || state.data?.source !== 'workspace') return undefined
    return state.projectId
  }

  function markDirty() {
    if (state.sourceSyncStatus !== 'syncing') setState({ sourceSyncStatus: 'dirty' })
  }

  function captureError(error: unknown, fallback: string) {
    setState({
      status: 'error',
      sourceSyncStatus: 'error',
      error: error instanceof Error ? error.message : fallback,
    })
  }

  async function commitOptimisticWorkspaceOperation<T>(input: {
    target: ContentSourceWorkspaceRuntimeOperationTarget
    optimisticPatch: string
    changedPaths?: readonly string[]
    reloadPolicy?: ContentSourceWorkspaceRuntimeReloadPolicy
    optimistic: () => void
    commit: (projectId: number) => Promise<T>
    fallback: string
  }): Promise<T | undefined> {
    const previousData = state.data ? cloneContentSourceWorkspaceData(state.data) : undefined
    const operation = createOperation<T>({
      target: input.target,
      optimisticPatch: input.optimisticPatch,
      changedPaths: input.changedPaths ?? [],
      reloadPolicy: input.reloadPolicy,
      commit: input.commit,
      rollback: () => {
        setState({ data: previousData })
      },
    })
    input.optimistic()
    const projectId = requireWorkspaceProject()
    if (!projectId) {
      setState({
        currentOperation: undefined,
        lastOperation: operationSnapshot(operation, 'committed'),
        failedOperation: undefined,
      })
      return undefined
    }
    markDirty()
    setState({
      currentOperation: operationSnapshot(operation, 'pending'),
      failedOperation: undefined,
      error: undefined,
    })
    try {
      const result = await operation.commit(projectId)
      const commitResult = contentSourceWorkspaceCommitResult(result)
      const reloadPolicy = commitResult?.reloadPolicy ?? operation.reloadPolicy
      const changedPaths = commitResult?.changedPaths ?? operation.changedPaths
      if (reloadPolicy === 'reload') await reloadProject(projectId, loadToken)
      setState({
        currentOperation: undefined,
        lastOperation: operationSnapshot({ ...operation, changedPaths, reloadPolicy }, 'committed', {
          snapshotVersion: commitResult?.snapshotVersion,
        }),
        failedOperation: undefined,
      })
      return result
    } catch (error) {
      operation.rollback()
      const failedOperation = operationSnapshot(operation, 'rolled_back', {
        error: error instanceof Error ? error.message : input.fallback,
      })
      setState({
        status: 'error',
        sourceSyncStatus: 'error',
        error: error instanceof Error ? error.message : input.fallback,
        currentOperation: undefined,
        lastOperation: failedOperation,
        failedOperation,
      })
      throw error
    }
  }

  function createOperation<T>(input: {
    target: ContentSourceWorkspaceRuntimeOperationTarget
    optimisticPatch: string
    commit: (projectId: number) => Promise<T>
    rollback: () => void
    changedPaths: readonly string[]
    reloadPolicy?: ContentSourceWorkspaceRuntimeReloadPolicy
  }): ContentSourceWorkspaceRuntimeOperation<T> {
    operationSequence += 1
    return {
      operationId: `content-source-workspace:${operationSequence}:${input.target.kind}`,
      target: input.target,
      optimisticPatch: input.optimisticPatch,
      commit: input.commit,
      rollback: input.rollback,
      reloadPolicy: input.reloadPolicy ?? 'none',
      changedPaths: input.changedPaths,
    }
  }

  function operationSnapshot(
    operation: ContentSourceWorkspaceRuntimeOperation<unknown>,
    status: ContentSourceWorkspaceRuntimeOperationStatus,
    patch: Pick<ContentSourceWorkspaceRuntimeOperationSnapshot, 'error' | 'snapshotVersion'> = {},
  ): ContentSourceWorkspaceRuntimeOperationSnapshot {
    return {
      operationId: operation.operationId,
      target: operation.target,
      optimisticPatch: operation.optimisticPatch,
      reloadPolicy: operation.reloadPolicy,
      changedPaths: operation.changedPaths,
      status,
      ...(patch.snapshotVersion !== undefined ? { snapshotVersion: patch.snapshotVersion } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    }
  }

  async function reloadProject(projectId: number, token: number) {
    const snapshot = await options.port.loadSnapshot(projectId)
    if (token !== loadToken) return
    const data = buildContentSourceWorkspaceData(snapshot)
    setState({
      status: isContentSourceWorkspaceDataEmpty(data) ? 'empty' : 'ready',
      sourceSyncStatus: 'clean',
      projectId,
      data,
      error: undefined,
    })
  }

  return {
    getState() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    showDemo(data) {
      loadToken += 1
      setState({
        status: 'demo',
        sourceSyncStatus: 'clean',
        projectId: undefined,
        data,
        error: undefined,
      })
    },
    async loadProject(projectId) {
      const token = loadToken + 1
      loadToken = token
      setState({
        status: 'loading',
        sourceSyncStatus: 'clean',
        projectId,
        data: undefined,
        error: undefined,
      })
      try {
        await reloadProject(projectId, token)
      } catch (error) {
        if (token === loadToken) {
          setState({
            status: 'error',
            sourceSyncStatus: 'error',
            projectId,
            data: undefined,
            error: error instanceof Error ? error.message : 'workspace_data_load_failed',
          })
        }
      }
    },
    async selectCandidate(input) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: 'content_unit_selection', id: input.contentUnitId },
        optimisticPatch: 'select_content_unit_candidate',
        optimistic: () => setData((data) => updateContentSourceWorkspaceContentUnitSelection(data, input.contentUnitId, input.candidateId)),
        changedPaths: [],
        fallback: 'content_unit_selection_failed',
        commit: (projectId) => options.port.selectContentUnitCandidate({
          projectId,
          ...buildContentSourceWorkspaceSelectionPatch(input),
        }),
      })
    },
    async createCandidate(input) {
      const projectId = requireWorkspaceProject()
      if (!projectId) return undefined
      markDirty()
      const plan = buildContentSourceWorkspaceCandidateCreatePlan(input)
      const operation = createOperation({
        target: { kind: input.assetId ? 'asset_candidate' : 'content_unit_candidate', id: input.assetId ?? input.contentUnitId },
        optimisticPatch: input.assetId ? 'append_asset_candidate_after_commit' : 'append_content_unit_candidate_after_commit',
        changedPaths: [`content_units/${plan.contentUnitId}/candidates/${plan.candidateId}/content_candidate.json`],
        commit: (commitProjectId) => options.port.createContentCandidate({ projectId: commitProjectId, ...plan }),
        rollback: () => undefined,
      })
      setState({
        currentOperation: operationSnapshot(operation, 'pending'),
        failedOperation: undefined,
        error: undefined,
      })
      try {
        const record = await operation.commit(projectId)
        const candidate = createdContentSourceCandidateFromRecord(record, {
          candidateId: plan.candidateId,
          contentUnitId: plan.contentUnitId,
        })
        setData((data) => input.assetId
          ? appendContentSourceWorkspaceAssetCandidate(data, input.assetId!, candidate)
          : appendContentSourceWorkspaceContentUnitCandidate(data, input.contentUnitId, candidate))
        setState({
          currentOperation: undefined,
          lastOperation: operationSnapshot(operation, 'committed'),
          failedOperation: undefined,
        })
        return candidate
      } catch (error) {
        const failedOperation = operationSnapshot(operation, 'failed', {
          error: error instanceof Error ? error.message : (input.assetId ? 'asset_candidate_create_failed' : 'content_candidate_create_failed'),
        })
        captureError(error, input.assetId ? 'asset_candidate_create_failed' : 'content_candidate_create_failed')
        setState({
          currentOperation: undefined,
          lastOperation: failedOperation,
          failedOperation,
        })
        throw error
      }
    },
    async updateEditPrompt(input) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: input.assetId ? 'asset_prompt' : 'content_unit_prompt', id: input.assetId ?? input.contentUnitId, path: input.targetPath },
        optimisticPatch: 'update_edit_prompt',
        optimistic: () => setData((data) => input.assetId
          ? updateContentSourceWorkspaceAssetPrompt(data, input.assetId!, input.text)
          : updateContentSourceWorkspaceContentUnitPrompt(data, input.contentUnitId, input.text)),
        changedPaths: [input.targetPath],
        fallback: 'content_unit_prompt_update_failed',
        commit: (projectId) => options.port.updateContentUnitEditPrompt({
          projectId,
          ...buildContentSourceWorkspaceEditPromptPatch(input),
        }),
      })
    },
    async updateExpressionUnit(unit) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: 'expression_unit', id: unit.id, path: unit.path },
        optimisticPatch: 'update_expression_unit',
        optimistic: () => setData((data) => updateContentSourceWorkspaceExpressionUnitState(data, unit)),
        changedPaths: [unit.path],
        fallback: 'expression_unit_update_failed',
        commit: (projectId) => options.port.updateExpressionUnit({
          projectId,
          ...buildContentSourceWorkspaceExpressionUnitPatch({
            targetPath: unit.path,
            title: unit.title,
            kind: unit.kind,
            slotKind: unit.slotKind,
            text: unit.text,
            summary: unit.summary,
            speaker: unit.speaker,
            note: unit.note,
          }),
        }),
      })
    },
    async updateAudioCue(cue) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: 'audio_cue', id: cue.id, path: cue.path },
        optimisticPatch: 'update_audio_cue',
        optimistic: () => setData((data) => updateContentSourceWorkspaceAudioCueState(data, cue)),
        changedPaths: [cue.path],
        fallback: 'audio_cue_update_failed',
        commit: (projectId) => options.port.updateAudioCue({
          projectId,
          ...buildContentSourceWorkspaceAudioCuePatch({
            targetPath: cue.path,
            title: cue.title,
            cueKind: cue.cueKind,
            promptHint: cue.promptHint,
            expressionUnitRef: cue.expressionUnitRef,
            storyboardRef: cue.storyboardRef,
            timing: cue.timing,
            assetRefs: cue.assetRefs,
          }),
        }),
      })
    },
    async updateTransition(input) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: 'hierarchy_transition', id: input.nodeId, path: input.targetPath },
        optimisticPatch: 'update_hierarchy_transition',
        optimistic: () => setData((data) => updateContentSourceWorkspaceHierarchyPlanning(data, input.nodeId, { transition: input.transition })),
        changedPaths: [input.targetPath],
        fallback: 'entity_transition_update_failed',
        commit: (projectId) => options.port.updateEntityTransition({
          projectId,
          ...buildContentSourceWorkspaceTransitionPatch(input),
        }),
      })
    },
    async updateStoryboardTimeline(input) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: 'storyboard_timeline', id: input.nodeId, path: input.targetPath },
        optimisticPatch: 'update_storyboard_timeline',
        optimistic: () => setData((data) => updateContentSourceWorkspaceHierarchyPlanning(data, input.nodeId, { storyboardTimeline: input.timeline })),
        changedPaths: [input.targetPath],
        fallback: 'storyboard_timeline_update_failed',
        commit: (projectId) => options.port.updateStoryboardTimeline({
          projectId,
          ...buildContentSourceWorkspaceStoryboardTimelinePatch(input),
        }),
      })
    },
    async createHierarchyNode(input) {
      await commitOptimisticWorkspaceOperation({
        target: { kind: input.type, id: input.id, path: input.targetPath },
        optimisticPatch: 'append_hierarchy_node',
        optimistic: () => setData((data) => ({
          ...data,
          hierarchyTree: appendChildNode(data.hierarchyTree, input.parentNode.id, input.node),
        })),
        changedPaths: [input.targetPath],
        fallback: 'hierarchy_node_create_failed',
        commit: (projectId) => options.port.writeHierarchyNode({
          projectId,
          targetPath: input.targetPath,
          record: buildContentSourceWorkspaceHierarchyNodeRecord({
            projectId,
            type: input.type,
            id: input.id,
            title: input.title,
            targetPath: input.targetPath,
            parentNode: input.parentNode,
          }),
        }),
      })
    },
    async sync() {
      const projectId = requireWorkspaceProject()
      if (!projectId || state.sourceSyncStatus === 'syncing') return
      const token = loadToken
      setState({ sourceSyncStatus: 'syncing', error: undefined })
      try {
        await options.port.interpretWorkspace(projectId)
        await reloadProject(projectId, token)
        if (token === loadToken) setState({ sourceSyncStatus: 'synced' })
      } catch (error) {
        setState({
          sourceSyncStatus: 'error',
          error: error instanceof Error ? error.message : 'workspace_sync_failed',
        })
        throw error
      }
    },
  }
}

function contentSourceWorkspaceCommitResult(value: unknown): ContentSourceWorkspaceRuntimeCommitResult | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const changedPaths = Array.isArray(record.changedPaths)
    ? record.changedPaths.filter((path): path is string => typeof path === 'string')
    : undefined
  const snapshotVersion = typeof record.snapshotVersion === 'number' ? record.snapshotVersion : undefined
  const reloadPolicy = record.reloadPolicy === 'reload' || record.reloadPolicy === 'none' ? record.reloadPolicy : undefined
  if (!changedPaths && snapshotVersion === undefined && reloadPolicy === undefined) return undefined
  return {
    ...(changedPaths ? { changedPaths } : {}),
    ...(snapshotVersion !== undefined ? { snapshotVersion } : {}),
    ...(reloadPolicy ? { reloadPolicy } : {}),
  }
}

function isContentSourceWorkspaceDataEmpty(data: ContentSourceWorkspaceData): boolean {
  return data.previewMoments.length === 0
    && Object.values(data.contentUnitCandidates).every((candidates) => candidates.length === 0)
    && Object.keys(data.assetReferenceUnits).length === 0
}

function cloneContentSourceWorkspaceData(data: ContentSourceWorkspaceData): ContentSourceWorkspaceData {
  return JSON.parse(JSON.stringify(data)) as ContentSourceWorkspaceData
}
