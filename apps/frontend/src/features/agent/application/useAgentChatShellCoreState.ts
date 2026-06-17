import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { useAgentChatRecentResources } from '@/features/agent/application/useAgentChatRecentResources'
import { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import { useAgentMentionEditorSync } from '@/features/agent/presentation/useAgentMentionEditorSync'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  agentChatComposerConversationId,
  buildAgentChatModelSelectionForRequest,
  createAgentChatDraftConversationId,
  positiveInteger,
  resolveAgentChatEmptyThreadLabel,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import {
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import {
  agentChatRuntimeReducer,
  createAgentChatRuntimeState,
  selectAgentChatRuntimePendingThreadReadRequests,
  selectAgentChatRuntimePendingThreadResumeRequests,
  type AgentChatCollaborationMode,
  type AgentChatDataSource,
  type AgentChatModelSelection,
  type AgentChatThread,
} from '@movscript/core/agent/chat'
import type { Project, PublicModel } from '@/types'
import type { AgentComposerQueuedInput } from '@/features/agent/application/useAgentChatTurnControls'
import type { AgentChatDataSourceShellLoadResult } from '@/features/agent/application/agentChatDataSourceShellTypes'

interface UseAgentChatShellCoreStateInput {
  collaborationMode: AgentChatCollaborationMode
  composerWorkspaceContextLocked?: boolean
  currentProject?: Project | null
  emptyThreadLabel?: string
  goalModeEnabled: boolean
  loadDataSource: () => Promise<AgentChatDataSourceShellLoadResult>
  modelOptions: PublicModel[]
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  readActiveThreadId?: () => string | null
  resolveModelForRequest: () => AgentChatModelSelection
  selectedModelId?: string | null
  threadScopeKey: string
  userId: string
}

export function useAgentChatShellCoreState({
  collaborationMode,
  composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked = false,
  currentProject,
  emptyThreadLabel,
  goalModeEnabled,
  loadDataSource,
  modelOptions,
  onCollaborationModeChange,
  onGoalModeEnabledChange,
  readActiveThreadId,
  resolveModelForRequest,
  selectedModelId,
  threadScopeKey,
  userId,
}: UseAgentChatShellCoreStateInput) {
  const readActiveThreadIdRef = useRef(readActiveThreadId)
  useEffect(() => {
    readActiveThreadIdRef.current = readActiveThreadId
  }, [readActiveThreadId])
  const readCurrentActiveThreadId = useCallback(
    () => readActiveThreadIdRef.current?.() ?? null,
    [],
  )
  const readRestorableActiveThreadId = useCallback(() => {
    const threadId = readCurrentActiveThreadId()
    if (!threadId) return null
    const registryRecord = useAgentSessionStore.getState().conversationsById[threadId]
    if (registryRecord?.open !== false) return threadId
    return null
  }, [readCurrentActiveThreadId])
  const resetDraftModeSettings = useCallback(() => {
    if (collaborationMode !== 'default') onCollaborationModeChange?.('default')
    if (goalModeEnabled) onGoalModeEnabledChange?.(false)
  }, [collaborationMode, goalModeEnabled, onCollaborationModeChange, onGoalModeEnabledChange])

  const [dataSource, setDataSource] = useState<AgentChatDataSource | undefined>()
  const [endpoint, setEndpoint] = useState<string | undefined>()
  const [runtime, dispatchRuntime] = useReducer(
    agentChatRuntimeReducer,
    undefined,
    () => createAgentChatRuntimeState(readRestorableActiveThreadId()),
  )
  const runtimeRef = useRef(runtime)
  useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])

  const {
    threads,
    activeThreadId,
    pendingUserItems,
    recentCapabilityEvents,
    streamingAgentItems,
    realtimeTranscriptItems,
    realtimeAudioItems,
    threadReadRequests,
    threadReadStates,
  } = runtime
  const pendingThreadReadRequests = useMemo(
    () => selectAgentChatRuntimePendingThreadReadRequests(runtime),
    [runtime],
  )
  const pendingThreadResumeRequests = useMemo(
    () => selectAgentChatRuntimePendingThreadResumeRequests(runtime),
    [runtime],
  )
  const [profilePresetId, setProfilePresetId] = useState<AgentRunProfilePresetId>(DEFAULT_AGENT_RUN_PROFILE_PRESET_ID)
  const [threadModelOverrides, setThreadModelOverrides] = useState<Record<string, string>>({})
  const recentCapabilityEventSequenceRef = useRef(0)
  const activeThreadIdRef = useRef(activeThreadId)
  const shellInstanceIdRef = useRef(`agent_chat_shell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)
  const loadDataSourceRef = useRef(loadDataSource)
  const loadThreadsRef = useRef<() => Promise<void>>(async () => undefined)
  const restoreStoredThreadRef = useRef<() => Promise<void>>(async () => undefined)
  const composerInputRef = useRef<HTMLDivElement | null>(null)
  const composerFileRef = useRef<HTMLInputElement | null>(null)
  const selectedModelSelectionForRequest = useCallback((thread?: AgentChatThread | null): AgentChatModelSelection => {
    return buildAgentChatModelSelectionForRequest({
      baseSelection: resolveModelForRequest(),
      modelIdForOption: publicModelId,
      modelOptions,
      selectedModelId,
      thread,
      threadModelOverrides,
    })
  }, [modelOptions, resolveModelForRequest, selectedModelId, threadModelOverrides])

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [queuedInputs, setQueuedInputs] = useState<AgentComposerQueuedInput[]>([])
  const [queuedInputsCollapsed, setQueuedInputsCollapsed] = useState(true)
  const [stoppingTurn, setStoppingTurn] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftConversationId, setDraftConversationId] = useState(() => createAgentChatDraftConversationId(threadScopeKey))
  useEffect(() => {
    setDraftConversationId(createAgentChatDraftConversationId(threadScopeKey))
  }, [threadScopeKey])

  const composerConversationId = activeThreadId ? agentChatComposerConversationId(threadScopeKey, activeThreadId) : draftConversationId
  const composerWorkspace = useAgentSessionStore((state) => state.getConversationWorkspace(userId, composerConversationId))
  const composerWorkspaceContextLocked = forceComposerWorkspaceContextLocked || Boolean(activeThreadId)
  const recentResources = useAgentChatRecentResources()
  const composer = useAgentComposerController({
    userId,
    conversationId: composerConversationId,
    workspace: composerWorkspace,
    recentResources,
    currentProject,
    fileRef: composerFileRef,
    inputRef: composerInputRef,
    workspaceContextLocked: composerWorkspaceContextLocked,
  })
  const selectedWorkspaceProjectId = positiveInteger(composer.selectedWorkspaceContext.projectId)
  const resolvedEmptyThreadLabel = resolveAgentChatEmptyThreadLabel({
    emptyThreadLabel,
    selectedProjectId: selectedWorkspaceProjectId,
    workspaceProjectOptions: composer.workspaceProjectOptions,
  })

  useEffect(() => {
    loadDataSourceRef.current = loadDataSource
  }, [loadDataSource])

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useAgentMentionEditorSync({
    conversationId: composerConversationId,
    input: composer.input,
    inputRef: composerInputRef,
    resourceAttachmentIndex: composer.resourceAttachmentIndex,
  })

  return {
    activeThreadId,
    activeThreadIdRef,
    composer,
    composerConversationId,
    composerFileRef,
    composerInputRef,
    composerWorkspaceContextLocked,
    dataSource,
    dispatchRuntime,
    endpoint,
    error,
    historyOpen,
    loadDataSourceRef,
    loadThreadsRef,
    loading,
    pendingThreadReadRequests,
    pendingThreadResumeRequests,
    pendingUserItems,
    profilePresetId,
    queuedInputs,
    queuedInputsCollapsed,
    readCurrentActiveThreadId,
    readRestorableActiveThreadId,
    realtimeAudioItems,
    realtimeTranscriptItems,
    recentCapabilityEventSequenceRef,
    recentCapabilityEvents,
    resetDraftModeSettings,
    resolvedEmptyThreadLabel,
    restoreStoredThreadRef,
    runtime,
    runtimeRef,
    selectedModelSelectionForRequest,
    sending,
    setActiveThreadIdRefValue: (threadId: string | null) => {
      activeThreadIdRef.current = threadId
    },
    setDataSource,
    setDraftConversationId,
    setEndpoint,
    setError,
    setHistoryOpen,
    setLoading,
    setProfilePresetId,
    setQueuedInputs,
    setQueuedInputsCollapsed,
    setSending,
    setStoppingTurn,
    setThreadModelOverrides,
    shellInstanceIdRef,
    stoppingTurn,
    streamingAgentItems,
    threadModelOverrides,
    threadReadRequests,
    threadReadStates,
    threads,
  }
}
