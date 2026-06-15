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

export interface ContentSourceWorkspaceRuntimeState {
  status: ContentSourceWorkspaceRuntimeStatus
  sourceSyncStatus: ContentSourceWorkspaceSourceSyncStatus
  projectId?: number
  data?: ContentSourceWorkspaceData
  error?: string
}

export interface ContentSourceWorkspaceRuntimePort {
  loadSnapshot(projectId: number): Promise<ContentSourceWorkspaceSnapshot>
  selectContentUnitCandidate(input: {
    projectId: number
    contentUnitId: string
    candidateId: string
    resourceId?: number
    reason: 'content_source_workspace_selection'
  }): Promise<void>
  createContentCandidate(input: {
    projectId: number
    contentUnitId: string
    candidateId: string
    source: 'ai_generate' | 'resource_library'
    status: 'queued' | 'imported'
    producer: Record<string, unknown>
    outputs: ContentSourceWorkspaceCandidateOutput[]
    promptSnapshot: Record<string, unknown>
    createdAt: string
  }): Promise<ContentCandidateRecord>
  updateContentUnitEditPrompt(input: ContentSourceWorkspaceEditPromptPatch & { projectId: number }): Promise<void>
  updateExpressionUnit(input: ContentSourceWorkspaceExpressionUnitPatch & { projectId: number }): Promise<void>
  updateAudioCue(input: ContentSourceWorkspaceAudioCuePatch & { projectId: number }): Promise<void>
  updateEntityTransition(input: ContentSourceWorkspaceTransitionPatch & { projectId: number }): Promise<void>
  updateStoryboardTimeline(input: ContentSourceWorkspaceStoryboardTimelinePatch & { projectId: number }): Promise<void>
  writeHierarchyNode(input: {
    projectId: number
    targetPath: string
    record: Record<string, unknown>
  }): Promise<void>
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
    optimistic: () => void
    commit: (projectId: number) => Promise<T>
    fallback: string
  }): Promise<T | undefined> {
    const previousData = state.data ? cloneContentSourceWorkspaceData(state.data) : undefined
    input.optimistic()
    const projectId = requireWorkspaceProject()
    if (!projectId) return undefined
    markDirty()
    try {
      return await input.commit(projectId)
    } catch (error) {
      setState({
        data: previousData,
        status: 'error',
        sourceSyncStatus: 'error',
        error: error instanceof Error ? error.message : input.fallback,
      })
      throw error
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
        optimistic: () => setData((data) => updateContentSourceWorkspaceContentUnitSelection(data, input.contentUnitId, input.candidateId)),
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
      try {
        const record = await options.port.createContentCandidate({ projectId, ...plan })
        const candidate = createdContentSourceCandidateFromRecord(record, {
          candidateId: plan.candidateId,
          contentUnitId: plan.contentUnitId,
        })
        setData((data) => input.assetId
          ? appendContentSourceWorkspaceAssetCandidate(data, input.assetId!, candidate)
          : appendContentSourceWorkspaceContentUnitCandidate(data, input.contentUnitId, candidate))
        return candidate
      } catch (error) {
        captureError(error, input.assetId ? 'asset_candidate_create_failed' : 'content_candidate_create_failed')
        throw error
      }
    },
    async updateEditPrompt(input) {
      await commitOptimisticWorkspaceOperation({
        optimistic: () => setData((data) => input.assetId
          ? updateContentSourceWorkspaceAssetPrompt(data, input.assetId!, input.text)
          : updateContentSourceWorkspaceContentUnitPrompt(data, input.contentUnitId, input.text)),
        fallback: 'content_unit_prompt_update_failed',
        commit: (projectId) => options.port.updateContentUnitEditPrompt({
          projectId,
          ...buildContentSourceWorkspaceEditPromptPatch(input),
        }),
      })
    },
    async updateExpressionUnit(unit) {
      await commitOptimisticWorkspaceOperation({
        optimistic: () => setData((data) => updateContentSourceWorkspaceExpressionUnitState(data, unit)),
        fallback: 'expression_unit_update_failed',
        commit: (projectId) => options.port.updateExpressionUnit({
          projectId,
          ...buildContentSourceWorkspaceExpressionUnitPatch({
            targetPath: unit.path,
            title: unit.title,
            kind: unit.kind,
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
        optimistic: () => setData((data) => updateContentSourceWorkspaceAudioCueState(data, cue)),
        fallback: 'audio_cue_update_failed',
        commit: (projectId) => options.port.updateAudioCue({
          projectId,
          ...buildContentSourceWorkspaceAudioCuePatch({
            targetPath: cue.path,
            title: cue.title,
            cueKind: cue.cueKind,
            promptHint: cue.promptHint,
            shotRef: cue.shotRef,
            storyboardRef: cue.storyboardRef,
            timing: cue.timing,
            assetRefs: cue.assetRefs,
          }),
        }),
      })
    },
    async updateTransition(input) {
      await commitOptimisticWorkspaceOperation({
        optimistic: () => setData((data) => updateContentSourceWorkspaceHierarchyPlanning(data, input.nodeId, { transition: input.transition })),
        fallback: 'entity_transition_update_failed',
        commit: (projectId) => options.port.updateEntityTransition({
          projectId,
          ...buildContentSourceWorkspaceTransitionPatch(input),
        }),
      })
    },
    async updateStoryboardTimeline(input) {
      await commitOptimisticWorkspaceOperation({
        optimistic: () => setData((data) => updateContentSourceWorkspaceHierarchyPlanning(data, input.nodeId, { storyboardTimeline: input.timeline })),
        fallback: 'storyboard_timeline_update_failed',
        commit: (projectId) => options.port.updateStoryboardTimeline({
          projectId,
          ...buildContentSourceWorkspaceStoryboardTimelinePatch(input),
        }),
      })
    },
    async createHierarchyNode(input) {
      await commitOptimisticWorkspaceOperation({
        optimistic: () => setData((data) => ({
          ...data,
          hierarchyTree: appendChildNode(data.hierarchyTree, input.parentNode.id, input.node),
        })),
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

function isContentSourceWorkspaceDataEmpty(data: ContentSourceWorkspaceData): boolean {
  return data.previewMoments.length === 0
    && Object.keys(data.assetReferenceUnits).length === 0
}

function cloneContentSourceWorkspaceData(data: ContentSourceWorkspaceData): ContentSourceWorkspaceData {
  return JSON.parse(JSON.stringify(data)) as ContentSourceWorkspaceData
}
