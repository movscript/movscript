import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type UIEvent } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  AgentBody,
  Button,
  AgentConversationItem,
  AgentConversationTabsPanel,
  AgentEmpty,
  AgentHeader,
  AgentMain,
  AgentShell,
  AgentThreadFill,
} from '@movscript/ui'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { ProviderControls } from '@/features/agent/components/ProviderControls'
import { AgentChatRecentCapabilityEventCard } from '@/features/agent/components/agent-chat-events/AgentChatRecentCapabilityEventCard'
import { AgentPinnedStatusShelf, type AgentPinnedStatusSummaryItem } from '@/features/agent/components/AgentPinnedStatusShelf'
import { AgentChatServerRequestCard } from '@/features/agent/components/agent-chat-items/AgentChatServerRequestCard'
import { AgentChatThreadItemView } from '@/features/agent/components/agent-chat-items/AgentChatThreadItemView'
import { publicModelId } from '@/shared/domain/modelDisplay'
import {
  agentChatPendingServerRequestMatchesResolvedEvent,
  agentChatPendingServerRequestEntryKey,
  agentChatThreadIdForServerRequest,
  dropAgentChatPendingServerRequests,
  ensureAgentChatThreadReadyForTurn,
  upsertAgentChatPendingServerRequest,
} from '@movscript/core/agent/chat'
import {
  AGENT_PANEL_WORKSPACE_EVENT,
  AGENT_PANEL_DECISION_REQUEST_EVENT,
  AGENT_PANEL_NEW_CONVERSATION_EVENT,
  AGENT_PANEL_THREAD_EVENT,
  consumeAgentPanelDecisionRequest,
  consumeAgentPanelWorkspace,
  consumeAgentPanelNewConversation,
  consumeAgentPanelThread,
  notifyAgentPanelRunSettled,
  type AgentPanelDecisionRequestPayload,
  type AgentPanelThreadPayload,
  type AgentPanelWorkspacePayload,
  type AgentPanelNewConversationPayload,
} from '@/features/agent/application/agentPanelBridge'
import {
  agentChatInputsFromTextAndAttachments,
  agentChatQueuedInputSummary,
  agentChatTextInput,
  buildAgentChatRuntimeThreadReadInput,
  legacySessionIdFromAgentChatThread,
  agentChatServerRequestResponseForAction,
  type AgentChatDataSource,
  type AgentChatCollaborationMode,
  type AgentChatModelSelection,
  type AgentChatNotification,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type AgentChatThreadControlOptions,
  type AgentThreadExecutionSettings,
  type AgentChatThread,
  type AgentChatThreadReadInput,
  type AgentChatThreadItem,
  type AgentChatInput,
  type AgentChatQueuedInputPreviewItem,
} from '@movscript/core/agent/chat'
import {
  agentChatRuntimeReducer,
  AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE,
  buildAgentChatVisibleItemWindow,
  createAgentChatRuntimeState,
  selectAgentChatRuntimePendingThreadResumeRequests,
  selectAgentChatRuntimePendingThreadReadRequests,
  selectAgentChatRuntimeView,
  type AgentChatRuntimePendingServerRequest,
  type AgentChatRuntimeRecentCapabilityEvent,
} from '@movscript/core/agent/chat'
import { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import { useAgentMentionEditorSync } from '@/features/agent/presentation/useAgentMentionEditorSync'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import {
  agentConversationRegistryRecordFromChatThread,
  type AgentConversationRegistryRecord,
} from '@movscript/core/agent'
import {
  AGENT_RUN_PROFILE_PRESETS,
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import { api } from '@/shared/infrastructure/api'
import type { MovScriptWorkspaceContext, ProviderKind, ProviderProtocol } from '@/shared/infrastructure/providerConfigStore'
import type { Project, PublicModel, RawResource } from '@/types'

const AGENT_CHAT_OLDER_ITEMS_SCROLL_THRESHOLD_PX = 96
const AGENT_CHAT_THREAD_LIST_PAGE_SIZE = 20
const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest[]>()
const sourceThreadListCache = new Map<string, {
  loaded: boolean
  nextCursor: string | null
  threads: AgentChatThread[]
}>()

interface AgentComposerQueuedInput extends AgentChatQueuedInputPreviewItem {
  threadId: string
  inputs: AgentChatInput[]
  attachments: ReturnType<typeof useAgentComposerController>['composerAttachments']
  workspaceContext: ReturnType<typeof useAgentComposerController>['selectedWorkspaceContext']
  profilePresetId: AgentRunProfilePresetId
  clientUserMessageId: string
}

function persistentServerRequestScopeKey(threadScopeKey: string): string {
  return threadScopeKey
}

function storePersistentServerRequest(
  scopeKey: string,
  request: AgentChatServerRequest,
  resolve: (response: AgentChatServerRequestResponse | undefined) => void,
): (response: AgentChatServerRequestResponse | undefined) => void {
  const persistentResolve = (response: AgentChatServerRequestResponse | undefined) => {
    removePersistentServerRequest(scopeKey, request)
    resolve(response)
  }
  const current = persistentPendingServerRequests.get(scopeKey) ?? []
  persistentPendingServerRequests.set(
    scopeKey,
    upsertAgentChatPendingServerRequest(current, request, persistentResolve),
  )
  return persistentResolve
}

function removePersistentServerRequest(scopeKey: string, request: AgentChatServerRequest): void {
  const current = persistentPendingServerRequests.get(scopeKey)
  if (!current) return
  const requestKey = agentChatPendingServerRequestEntryKey({ request })
  const next = current.filter((entry) => agentChatPendingServerRequestEntryKey(entry) !== requestKey)
  if (next.length === 0) persistentPendingServerRequests.delete(scopeKey)
  else persistentPendingServerRequests.set(scopeKey, next)
}

function dropPersistentServerRequests(
  scopeKey: string,
  shouldDrop: (entry: AgentChatRuntimePendingServerRequest) => boolean,
): void {
  const current = persistentPendingServerRequests.get(scopeKey)
  if (!current) return
  const next = dropAgentChatPendingServerRequests(current, shouldDrop)
  if (next.length === 0) persistentPendingServerRequests.delete(scopeKey)
  else persistentPendingServerRequests.set(scopeKey, next)
}

function applyPersistentServerRequestNotification(scopeKey: string, notification: AgentChatNotification): void {
  const event = notification.event
  if (event?.type === 'serverRequestResolved') {
    dropPersistentServerRequests(scopeKey, (entry) => agentChatPendingServerRequestMatchesResolvedEvent(entry.request, event))
    return
  }
  if (event?.type === 'threadLifecycle') {
    if (event.action === 'unarchived') return
    dropPersistentServerRequests(scopeKey, (entry) => entry.request.threadId === event.threadId)
    return
  }
  if (notification.method !== 'turn/completed') return
  const params = recordValue(notification.params)
  const threadId = stringValue(params?.threadId)
  const turn = recordValue(params?.turn)
  const turnId = stringValue(turn?.id)
  if (!threadId || !turnId) return
  dropPersistentServerRequests(scopeKey, (entry) => {
    if (entry.request.threadId !== threadId) return false
    return !entry.request.turnId || entry.request.turnId === turnId
  })
}

export interface AgentChatDataSourceShellLoadResult {
  dataSource?: AgentChatDataSource
  endpoint?: string
}

export interface AgentChatDataSourceShellProps {
  userId: string
  loadDataSource: () => Promise<AgentChatDataSourceShellLoadResult>
  loadDataSourceForNewThread?: (input: AgentPanelNewConversationPayload) => Promise<AgentChatDataSourceShellLoadResult>
  provider?: ProviderKind
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: ProviderProtocol
  threadScopeKey: string
  readActiveThreadId?: () => string | null
  openThreadEventName: string
  providerLabel: string
  threadListLabel: string
  emptyThreadListLabel: string
  emptyThreadLabel?: string
  unavailableLabel: string
  composerPlaceholder: string
  newThreadLabel: string
  resolveModelForRequest?: () => AgentChatModelSelection
  modelOptions?: PublicModel[]
  currentProject?: Project | null
  selectedModelId?: number | null
  onSelectedModelChange?: (modelId: number | null) => void
  collaborationMode?: AgentChatCollaborationMode
  goalModeEnabled?: boolean
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showThreadList?: boolean
  autoLoadThreads?: boolean
  showCollapse?: boolean
  onCollapse?: () => void
}

type StartThreadInput = AgentPanelNewConversationPayload & {
  runProfile?: AgentRunProfileSelection
  useDraftModeSettings?: boolean
}
type StartThreadResult = {
  thread: AgentChatThread
  dataSource: AgentChatDataSource
}

function draftThreadControlOptions(input: {
  collaborationMode: AgentChatCollaborationMode
  goalModeEnabled: boolean
}): AgentChatThreadControlOptions {
  return {
    ...(input.collaborationMode === 'plan' ? { collaborationMode: input.collaborationMode } : {}),
    ...(input.goalModeEnabled ? { goalModeEnabled: true } : {}),
  }
}

export function AgentChatDataSourceShell({
  userId,
  loadDataSource,
  loadDataSourceForNewThread,
  provider,
  providerId,
  providerInstanceId,
  providerProtocol,
  threadScopeKey,
  readActiveThreadId,
  openThreadEventName,
  providerLabel,
  threadListLabel,
  emptyThreadListLabel,
  emptyThreadLabel,
  unavailableLabel,
  composerPlaceholder,
  resolveModelForRequest = () => ({}),
  modelOptions = [],
  currentProject = null,
  selectedModelId,
  onSelectedModelChange,
  collaborationMode = 'default',
  goalModeEnabled = false,
  onCollaborationModeChange,
  onGoalModeEnabledChange,
  host,
  surface = 'panel',
  showThreadList = surface !== 'page',
  autoLoadThreads = true,
}: AgentChatDataSourceShellProps) {
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
  const inFlightThreadResumeIdsRef = useRef(new Set<string>())
  const pendingThreadResumeRequests = useMemo(
    () => selectAgentChatRuntimePendingThreadResumeRequests(runtime),
    [runtime],
  )
  const [profilePresetId, setProfilePresetId] = useState<AgentRunProfilePresetId>(DEFAULT_AGENT_RUN_PROFILE_PRESET_ID)
  const [threadModelOverrides, setThreadModelOverrides] = useState<Record<string, string>>({})
  const conversationsById = useAgentSessionStore((state) => state.conversationsById)
  const recentCapabilityEventSequenceRef = useRef(0)
  const activeThreadIdRef = useRef(activeThreadId)
  const shellInstanceIdRef = useRef(`agent_chat_shell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)
  const loadDataSourceRef = useRef(loadDataSource)
  const loadThreadsRef = useRef<() => Promise<void>>(async () => undefined)
  const restoreStoredThreadRef = useRef<() => Promise<void>>(async () => undefined)
  const composerInputRef = useRef<HTMLDivElement | null>(null)
  const composerFileRef = useRef<HTMLInputElement | null>(null)
  const selectedModelSelectionForRequest = useCallback((thread?: AgentChatThread | null): AgentChatModelSelection => {
    const threadModel = (thread?.id ? threadModelOverrides[thread.id] : undefined)
      || thread?.executionSettings?.model?.trim()
      || undefined
    const selectedModel = selectedModelId === undefined || selectedModelId === null
      ? modelOptions[0]
      : modelOptions.find((model) => model.id === selectedModelId) ?? modelOptions[0]
    const model = selectedModel ? publicModelId(selectedModel) : undefined
    return {
      ...resolveModelForRequest(),
      ...(threadModel || model ? { model: threadModel ?? model } : {}),
    }
  }, [modelOptions, resolveModelForRequest, selectedModelId, threadModelOverrides])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [queuedInputs, setQueuedInputs] = useState<AgentComposerQueuedInput[]>([])
  const [queuedInputsCollapsed, setQueuedInputsCollapsed] = useState(true)
  const [stoppingTurn, setStoppingTurn] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceThreadList, setSourceThreadList] = useState<AgentChatThread[]>(() => readSourceThreadListCache(threadScopeKey).threads)
  const [sourceThreadListLoaded, setSourceThreadListLoaded] = useState(() => readSourceThreadListCache(threadScopeKey).loaded)
  const [threadListNextCursor, setThreadListNextCursor] = useState<string | null>(() => readSourceThreadListCache(threadScopeKey).nextCursor)
  const [threadListLoadingMore, setThreadListLoadingMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const olderItemsScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const suppressNextAutoScrollRef = useRef(false)
  const [visibleThreadItemCount, setVisibleThreadItemCount] = useState(AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE)
  const [draftConversationId, setDraftConversationId] = useState(() => createAgentChatDraftConversationId(threadScopeKey))
  useEffect(() => {
    setDraftConversationId(createAgentChatDraftConversationId(threadScopeKey))
  }, [threadScopeKey])
  const composerConversationId = activeThreadId ? agentChatComposerConversationId(threadScopeKey, activeThreadId) : draftConversationId
  const composerWorkspace = useAgentSessionStore((state) => state.getConversationWorkspace(userId, composerConversationId))
  const composerWorkspaceContextLocked = Boolean(activeThreadId)
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((response) => response.data),
  })

  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])
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
  const selectedWorkspaceProjectLabel = selectedWorkspaceProjectId !== undefined
    ? composer.workspaceProjectOptions.find((option) => option.value === String(selectedWorkspaceProjectId))?.label ?? `项目 #${selectedWorkspaceProjectId}`
    : undefined
  const resolvedEmptyThreadLabel = selectedWorkspaceProjectLabel?.trim()
    ? `我们在${selectedWorkspaceProjectLabel.trim()}中做些什么？`
    : emptyThreadLabel

  const setActiveThreadIdValue = useCallback((threadId: string | null) => {
    activeThreadIdRef.current = threadId
    dispatchRuntime({ type: 'setActiveThreadId', threadId })
  }, [])
  const persistentRequestScopeKey = persistentServerRequestScopeKey(threadScopeKey)
  const replayPersistentServerRequests = useCallback(() => {
    const entries = persistentPendingServerRequests.get(persistentRequestScopeKey) ?? []
    if (entries.length === 0) return
    dispatchRuntime({
      type: 'updatePendingServerRequests',
      update: (current) => {
        let next = current
        const currentKeys = new Set(current.map(agentChatPendingServerRequestEntryKey))
        for (const entry of entries) {
          const entryKey = agentChatPendingServerRequestEntryKey(entry)
          if (currentKeys.has(entryKey)) continue
          currentKeys.add(entryKey)
          next = upsertAgentChatPendingServerRequest(next, entry.request, entry.resolve)
        }
        return next
      },
    })
  }, [persistentRequestScopeKey])

  useEffect(() => {
    loadDataSourceRef.current = loadDataSource
  }, [loadDataSource])

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
    notifyAgentChatDataSourceActiveThread({
      eventName: openThreadEventName,
      sourceId: shellInstanceIdRef.current,
      threadId: activeThreadId,
    })
  }, [activeThreadId, openThreadEventName])

  useAgentMentionEditorSync({
    conversationId: composerConversationId,
    input: composer.input,
    inputRef: composerInputRef,
    resourceAttachmentIndex: composer.resourceAttachmentIndex,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDataSource(undefined)
    setEndpoint(undefined)
    recentCapabilityEventSequenceRef.current = 0
    setSending(false)
    setQueuedInputs([])
    setStoppingTurn(false)
    const cachedThreadList = readSourceThreadListCache(threadScopeKey)
    setSourceThreadList(cachedThreadList.threads)
    setSourceThreadListLoaded(cachedThreadList.loaded)
    setThreadListNextCursor(cachedThreadList.nextCursor)
    setThreadListLoadingMore(false)
    const storedThreadId = readRestorableActiveThreadId()
    activeThreadIdRef.current = storedThreadId
    dispatchRuntime({ type: 'reset', activeThreadId: storedThreadId })
    void loadDataSourceRef.current()
      .then((result) => {
        if (cancelled) return
        setDataSource(result.dataSource)
        setEndpoint(result.endpoint)
        if (!result.dataSource) setLoading(false)
      })
      .catch((nextError) => {
        if (cancelled) return
        setError(errorMessage(nextError))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [readRestorableActiveThreadId])

  const upsertThread = useCallback((thread: AgentChatThread) => {
    dispatchRuntime({ type: 'upsertThread', thread })
  }, [])

  const upsertThreadReadResult = useCallback((thread: AgentChatThread, input: AgentChatThreadReadInput) => {
    dispatchRuntime({ type: 'upsertThreadReadResult', thread, input })
  }, [])

  const conversationPatchInputForThread = useCallback((threadId: string, open: boolean) => ({
    userId,
    ...(provider ? { provider } : {}),
    ...(providerId?.trim() ? { providerId: providerId.trim() } : {}),
    ...(providerInstanceId?.trim() ? { providerInstanceId: providerInstanceId.trim() } : {}),
    ...(providerProtocol?.trim() ? { providerProtocol } : {}),
    providerThreadId: threadId,
    open,
    archived: false,
    updatedAt: Date.now(),
  }), [provider, providerId, providerInstanceId, providerProtocol, userId])

  const providerIdentity = useMemo(() => ({
    provider,
    providerId: providerId?.trim(),
    providerInstanceId: providerInstanceId?.trim(),
    providerProtocol,
  }), [provider, providerId, providerInstanceId, providerProtocol])

  const closedThreadIds = useMemo(() => new Set(
    Object.values(conversationsById)
      .filter((record) => record.userId === userId && record.open === false && agentConversationRecordMatchesProviderIdentity(record, providerIdentity))
      .map((record) => record.providerThreadId),
  ), [conversationsById, providerIdentity, userId])
  const openThreadIds = useMemo(() => new Set(
    Object.values(conversationsById)
      .filter((record) => record.userId === userId && record.open !== false && agentConversationRecordMatchesProviderIdentity(record, providerIdentity))
      .map((record) => record.providerThreadId),
  ), [conversationsById, providerIdentity, userId])
  const threadOrderIndex = useMemo(
    () => new Map(Object.values(conversationsById)
      .filter((record) => record.userId === userId && record.open !== false && agentConversationRecordMatchesProviderIdentity(record, providerIdentity))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record, index) => [record.providerThreadId, index])),
    [conversationsById, providerIdentity, userId],
  )

  const registerThreadConversation = useCallback((thread: Pick<AgentChatThread, 'id' | 'name' | 'preview' | 'status' | 'createdAt' | 'updatedAt' | 'cwd'>, input?: {
    workspaceContext?: MovScriptWorkspaceContext
    projectId?: number
  }) => {
    const threadId = thread.id.trim()
    if (!threadId) return
    const sessionId = legacySessionIdFromAgentChatThread(thread as AgentChatThread)
    useAgentSessionStore.getState().upsertConversation(agentConversationRegistryRecordFromChatThread({
      userId,
      ...(provider ? { provider } : {}),
      ...(providerId?.trim() ? { providerId: providerId.trim() } : {}),
      ...(providerInstanceId?.trim() ? { providerInstanceId: providerInstanceId.trim() } : {}),
      ...(providerProtocol?.trim() ? { providerProtocol } : {}),
      ...(sessionId ? { providerSessionId: sessionId } : {}),
      thread,
      ...(input?.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
      ...(typeof input?.projectId === 'number' ? { projectId: input.projectId } : {}),
    }))
  }, [provider, providerId, providerInstanceId, providerProtocol, userId])

  const markThreadOpen = useCallback((threadId: string) => {
    const store = useAgentSessionStore.getState()
    const conversationId = store.upsertConversation(conversationPatchInputForThread(threadId, true))
    store.setConversationOpen(userId, conversationId, true)
    store.setActiveConversation(userId, conversationId)
  }, [conversationPatchInputForThread, userId])

  const markThreadClosed = useCallback((threadId: string, clearActive: boolean) => {
    const activeThreadClosed = readCurrentActiveThreadId() === threadId
    const store = useAgentSessionStore.getState()
    const conversationId = store.upsertConversation(conversationPatchInputForThread(threadId, false))
    store.setConversationOpen(userId, conversationId, false)
    if (clearActive || activeThreadClosed) {
      store.setActiveConversation(userId, null)
    }
  }, [conversationPatchInputForThread, readCurrentActiveThreadId, userId])

  const clearUnavailableActiveThread = useCallback((threadId: string) => {
    if (activeThreadIdRef.current === threadId) setActiveThreadIdValue(null)
    markThreadClosed(threadId, true)
  }, [markThreadClosed, setActiveThreadIdValue])

  const clearUnavailableStoredThread = useCallback((threadId: string): boolean => {
    const store = useAgentSessionStore.getState()
    const conversationId = agentChatComposerConversationId(threadScopeKey, threadId)
    const workspace = store.getConversationWorkspace(userId, conversationId)
    const emptyWorkspace = agentChatConversationWorkspaceIsEmpty(workspace)

    if (!emptyWorkspace) {
      const draftConversationId = agentChatComposerConversationId(threadScopeKey, null)
      store.updateConversationWorkspace(userId, draftConversationId, workspace)
    }

    if (activeThreadIdRef.current === threadId) setActiveThreadIdValue(null)
    store.removeProviderSessionConversation(userId, threadId)
    dispatchRuntime({ type: 'removeThread', threadId })
    return emptyWorkspace
  }, [setActiveThreadIdValue, threadScopeKey, userId])

  const readHistoryThread = useCallback(async (threadId: string) => {
    if (!dataSource) throw new Error('Agent data source is not available')
    const input = buildAgentChatRuntimeThreadReadInput(runtimeRef.current, threadId)
    const thread = await dataSource.readThread(threadId, input)
    return { thread, input }
  }, [dataSource])

  const writeSourceThreadList = useCallback((threads: AgentChatThread[], nextCursor: string | null) => {
    setSourceThreadList(threads)
    setSourceThreadListLoaded(true)
    setThreadListNextCursor(nextCursor)
    sourceThreadListCache.set(threadScopeKey, {
      loaded: true,
      nextCursor,
      threads,
    })
  }, [threadScopeKey])

  const fetchFirstThreadListPage = useCallback(async () => {
    if (!dataSource) return []
    const response = await dataSource.listThreads({ limit: AGENT_CHAT_THREAD_LIST_PAGE_SIZE })
    writeSourceThreadList(response.threads, response.nextCursor ?? null)
    return response.threads
  }, [dataSource, writeSourceThreadList])

  const loadThreads = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      const nextThreads = await fetchFirstThreadListPage()
      const stored = readRestorableActiveThreadId()
      if (!stored) {
        const firstOpenThread = nextThreads.find((thread) => agentChatSourceThreadHasContent(thread) && !closedThreadIds.has(thread.id))
        if (!firstOpenThread) {
          setActiveThreadIdValue(null)
          return
        }
        setActiveThreadIdValue(firstOpenThread.id)
        markThreadOpen(firstOpenThread.id)
        try {
          const { thread, input } = await readHistoryThread(firstOpenThread.id)
          registerThreadConversation(thread)
          upsertThreadReadResult(thread, input)
        } catch (readError) {
          if (!isUnavailableThreadReadError(readError)) throw readError
          const removedEmptyConversation = clearUnavailableStoredThread(firstOpenThread.id)
          if (removedEmptyConversation) setError(errorMessage(readError))
        }
        return
      }
      setActiveThreadIdValue(stored)
      markThreadOpen(stored)
      try {
        const { thread, input } = await readHistoryThread(stored)
        upsertThreadReadResult(thread, input)
      } catch (readError) {
        if (!isUnavailableThreadReadError(readError)) throw readError
        const removedEmptyConversation = clearUnavailableStoredThread(stored)
        if (removedEmptyConversation) setError(errorMessage(readError))
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [clearUnavailableStoredThread, closedThreadIds, dataSource, fetchFirstThreadListPage, markThreadOpen, readRestorableActiveThreadId, readHistoryThread, registerThreadConversation, setActiveThreadIdValue, upsertThreadReadResult])

  const refreshThreadList = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      await fetchFirstThreadListPage()
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [dataSource, fetchFirstThreadListPage])

  const loadMoreThreads = useCallback(async () => {
    if (!dataSource || !threadListNextCursor || threadListLoadingMore) return
    setThreadListLoadingMore(true)
    setError(null)
    try {
      const response = await dataSource.listThreads({
        limit: AGENT_CHAT_THREAD_LIST_PAGE_SIZE,
        cursor: threadListNextCursor,
      })
      setThreadListNextCursor(response.nextCursor ?? null)
      setSourceThreadList((current) => {
        const next = mergeAgentChatThreadListPage(current, response.threads)
        sourceThreadListCache.set(threadScopeKey, {
          loaded: true,
          nextCursor: response.nextCursor ?? null,
          threads: next,
        })
        return next
      })
      setSourceThreadListLoaded(true)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setThreadListLoadingMore(false)
    }
  }, [dataSource, threadListLoadingMore, threadListNextCursor, threadScopeKey])

  const restoreStoredThread = useCallback(async () => {
    if (!dataSource) return
    const stored = readRestorableActiveThreadId()
    if (!stored) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setActiveThreadIdValue(stored)
    dispatchRuntime({ type: 'upsertThread', thread: provisionalAgentChatThread(stored, dataSource) })
    try {
      const { thread, input } = await readHistoryThread(stored)
      registerThreadConversation(thread)
      upsertThreadReadResult(thread, input)
    } catch (nextError) {
      if (isUnavailableThreadReadError(nextError)) {
        clearUnavailableStoredThread(stored)
      } else {
        setError(errorMessage(nextError))
      }
    } finally {
      setLoading(false)
    }
  }, [clearUnavailableStoredThread, dataSource, readRestorableActiveThreadId, readHistoryThread, setActiveThreadIdValue, upsertThreadReadResult])

  useEffect(() => {
    loadThreadsRef.current = loadThreads
  }, [loadThreads])

  useEffect(() => {
    restoreStoredThreadRef.current = restoreStoredThread
  }, [restoreStoredThread])

  useEffect(() => {
    if (!dataSource || surface !== 'panel' || !historyOpen || sourceThreadListLoaded || loading) return
    void refreshThreadList()
  }, [dataSource, historyOpen, loading, refreshThreadList, sourceThreadListLoaded, surface])

  const openThread = useCallback(async (threadId: string) => {
    if (!dataSource) return
    setActiveThreadIdValue(threadId)
    markThreadOpen(threadId)
    setError(null)
    try {
      const { thread, input } = await readHistoryThread(threadId)
      registerThreadConversation(thread)
      upsertThreadReadResult(thread, input)
      setHistoryOpen(false)
    } catch (nextError) {
      if (isUnavailableThreadReadError(nextError)) {
        clearUnavailableActiveThread(threadId)
        dispatchRuntime({ type: 'removeThread', threadId })
      }
      setError(errorMessage(nextError))
    }
  }, [clearUnavailableActiveThread, dataSource, markThreadOpen, readHistoryThread, setActiveThreadIdValue, upsertThreadReadResult])

  useEffect(() => {
    function handleOpenThread(event: Event) {
      const detail = (event as CustomEvent<{ threadId?: string; sourceId?: string }>).detail
      if (detail?.sourceId === shellInstanceIdRef.current) return
      const threadId = detail?.threadId?.trim()
      if (!threadId) return
      void openThread(threadId)
    }
    window.addEventListener(openThreadEventName, handleOpenThread)
    return () => window.removeEventListener(openThreadEventName, handleOpenThread)
  }, [openThread, openThreadEventName])

  useEffect(() => {
    if (!dataSource) return undefined

    function openFromPayload(payload: AgentPanelThreadPayload | undefined) {
      const threadId = payload?.threadId?.trim()
      if (!threadId) return
      void openThread(threadId)
    }

    for (let payload = consumeAgentPanelThread(); payload; payload = consumeAgentPanelThread()) {
      openFromPayload(payload)
    }

    function handlePanelThreadOpen(event: Event) {
      const detail = (event as CustomEvent<AgentPanelThreadPayload>).detail
      openFromPayload(consumeAgentPanelThread() ?? detail)
    }

    window.addEventListener(AGENT_PANEL_THREAD_EVENT, handlePanelThreadOpen)
    return () => window.removeEventListener(AGENT_PANEL_THREAD_EVENT, handlePanelThreadOpen)
  }, [dataSource, openThread])

  const createDraftConversation = useCallback((input: AgentPanelNewConversationPayload = {}) => {
    const workspaceContext = workspaceContextFromNewConversationPayload(input)
    const draftId = createAgentChatDraftConversationId(threadScopeKey)
    setDraftConversationId(draftId)
    setActiveThreadIdValue(null)
    useAgentSessionStore.getState().setActiveConversation(userId, draftId)
    setHistoryOpen(false)
    setError(null)
    useAgentSessionStore.getState().updateConversationWorkspace(userId, draftId, {
      input: '',
      attachments: [],
      ...(workspaceContext ? { workspaceContext } : {}),
    })
    clearAgentChatComposerEditor(composerInputRef.current)
    return draftId
  }, [setActiveThreadIdValue, threadScopeKey, userId])

  const startThreadResult = useCallback(async (input: StartThreadInput = {}): Promise<StartThreadResult | null> => {
    if (!dataSource) return null
    const operationId = beginAgentPerformanceOperation({
      kind: 'conversation_create',
      meta: {
        provider: dataSource.provider,
        hasWorkspaceContext: Boolean(input.workspaceContext),
      },
    })
    const startedMs = performanceNow()
    setError(null)
    markAgentPerformancePhase(operationId, 'conversation_create_start')
    try {
      let nextDataSource = dataSource
      if (input.workspaceContext && loadDataSourceForNewThread) {
        markAgentPerformancePhase(operationId, 'ensure_provider_session_start')
        const result = await loadDataSourceForNewThread(input)
        markAgentPerformancePhase(operationId, 'ensure_provider_session_done', {
          details: {
            endpointChanged: Boolean(result.endpoint && result.endpoint !== endpoint),
          },
        })
        if (result.dataSource) {
          nextDataSource = result.dataSource
          setDataSource(result.dataSource)
          setEndpoint(result.endpoint)
        }
      }
      const {
        workspaceContext,
        useDraftModeSettings,
        ...threadInput
      } = input
      const runProfile = threadInput.runProfile ?? agentRunProfilePresetById(profilePresetId)
      markAgentPerformancePhase(operationId, 'provider_session_thread_start_request_start')
      const thread = await nextDataSource.startThread({
        ...threadInput,
        runProfile,
        ...(useDraftModeSettings ? draftThreadControlOptions({ collaborationMode, goalModeEnabled }) : {}),
        ...selectedModelSelectionForRequest(),
      })
      markAgentPerformancePhase(operationId, 'provider_session_thread_start_request_done', {
        details: {
          threadId: thread.id,
          sessionId: legacySessionIdFromAgentChatThread(thread) || undefined,
        },
      })
      markAgentPerformancePhase(operationId, 'provider_session_conversation_create_start')
      registerThreadConversation(thread, {
        ...(workspaceContext ? { workspaceContext } : {}),
        ...(typeof threadInput.projectId === 'number' ? { projectId: threadInput.projectId } : {}),
      })
      upsertThread(thread)
      setActiveThreadIdValue(thread.id)
      markThreadOpen(thread.id)
      setHistoryOpen(false)
      markAgentPerformancePhase(operationId, 'provider_session_conversation_create_done')
      recordAgentPerformanceMetric({
        name: 'frontend_agent_conversation_create_duration_ms',
        value: Math.max(0, performanceNow() - startedMs),
        unit: 'ms',
        labels: {
          provider: dataSource.provider,
          status: 'success',
        },
      })
      finishAgentPerformanceOperation(operationId, 'success', { threadId: thread.id })
      return { thread, dataSource: nextDataSource }
    } catch (nextError) {
      setError(errorMessage(nextError))
      recordAgentPerformanceMetric({
        name: 'frontend_agent_conversation_create_duration_ms',
        value: Math.max(0, performanceNow() - startedMs),
        unit: 'ms',
        labels: {
          provider: dataSource.provider,
          status: 'error',
        },
      })
      finishAgentPerformanceOperation(operationId, 'error', { error: errorMessage(nextError) })
      return null
    }
  }, [collaborationMode, dataSource, endpoint, goalModeEnabled, loadDataSourceForNewThread, markThreadOpen, profilePresetId, registerThreadConversation, selectedModelSelectionForRequest, setActiveThreadIdValue, upsertThread, userId])
  const startWorkspaceTask = useCallback(async (payload: AgentPanelWorkspacePayload) => {
    if (!dataSource) return
    const normalizedTitle = payload.title?.trim()
    const runProfile = agentRunProfilePresetById(profilePresetId)
    const started = await startThreadResult({
      ...(normalizedTitle ? { title: normalizedTitle } : {}),
      ...(typeof payload.projectId === 'number' ? { projectId: payload.projectId } : {}),
      runProfile,
    })
    if (!started) return
    const { thread, dataSource: taskDataSource } = started
    const threadSessionId = legacySessionIdFromAgentChatThread(thread)
    try {
      const turn = payload.autoSend && payload.message.trim()
        ? await taskDataSource.startTextTurn({
            threadId: thread.id,
            text: payload.message,
            runProfile,
            ...selectedModelSelectionForRequest(thread),
          })
        : undefined
      if (payload.requestId) {
        notifyAgentPanelRunSettled({
          requestId: payload.requestId,
          status: 'completed',
          thread: {
            id: thread.id,
            sessionId: threadSessionId,
          },
          ...(turn ? {
            run: {
              id: turn.id,
              threadId: thread.id,
              sessionId: threadSessionId,
              status: turn.status,
              error: turn.error?.message ?? null,
            },
          } : {}),
        })
      }
    } catch (nextError) {
      if (payload.requestId) {
        notifyAgentPanelRunSettled({
          requestId: payload.requestId,
          status: 'error',
          thread: {
            id: thread.id,
            sessionId: threadSessionId,
          },
          error: errorMessage(nextError),
        })
      }
      throw nextError
    }
  }, [dataSource, profilePresetId, selectedModelSelectionForRequest, startThreadResult])

  const handleServerRequest = useCallback((request: AgentChatServerRequest) => {
    if (request.method === 'attestation/generate') {
      return agentChatServerRequestResponseForAction(request, { type: 'reject' })
    }
    const requestThreadId = agentChatThreadIdForServerRequest(activeThreadIdRef.current, request)
    if (requestThreadId) {
      setActiveThreadIdValue(requestThreadId)
      markThreadOpen(requestThreadId)
    }
    return new Promise<AgentChatServerRequestResponse | undefined>((resolve) => {
      const persistentResolve = storePersistentServerRequest(persistentRequestScopeKey, request, resolve)
      dispatchRuntime({ type: 'enqueueServerRequest', request, resolve: persistentResolve })
    })
  }, [markThreadOpen, persistentRequestScopeKey, setActiveThreadIdValue])

  const handleLocalDecisionRequest = useCallback((payload: AgentPanelDecisionRequestPayload | undefined) => {
    if (!payload?.request) return
    const request = payload.request
    const requestThreadId = agentChatThreadIdForServerRequest(activeThreadIdRef.current, request)
    if (requestThreadId) {
      setActiveThreadIdValue(requestThreadId)
      markThreadOpen(requestThreadId)
    }
    const resolve = (response: AgentChatServerRequestResponse | undefined) => {
      void Promise.resolve(payload.onResolve?.(response)).catch((error) => {
        console.error('[agent-panel] decision request resolver failed', error)
      })
    }
    const persistentResolve = storePersistentServerRequest(persistentRequestScopeKey, request, resolve)
    dispatchRuntime({ type: 'enqueueServerRequest', request, resolve: persistentResolve })
  }, [markThreadOpen, persistentRequestScopeKey, setActiveThreadIdValue])

  useEffect(() => {
    function replayPendingDecisionRequests() {
      for (let payload = consumeAgentPanelDecisionRequest(); payload; payload = consumeAgentPanelDecisionRequest()) {
        handleLocalDecisionRequest(payload)
      }
    }

    function handleDecisionRequestEvent(event: Event) {
      const detail = (event as CustomEvent<AgentPanelDecisionRequestPayload>).detail
      handleLocalDecisionRequest(consumeAgentPanelDecisionRequest() ?? detail)
    }

    replayPendingDecisionRequests()
    window.addEventListener(AGENT_PANEL_DECISION_REQUEST_EVENT, handleDecisionRequestEvent)
    return () => window.removeEventListener(AGENT_PANEL_DECISION_REQUEST_EVENT, handleDecisionRequestEvent)
  }, [handleLocalDecisionRequest])

  useEffect(() => {
    replayPersistentServerRequests()
  }, [activeThreadId, dataSource, replayPersistentServerRequests])

  const handleNotification = useCallback((notification: AgentChatNotification) => {
    applyPersistentServerRequestNotification(persistentRequestScopeKey, notification)
    dispatchRuntime({
      type: 'applyNotification',
      notification,
      nowMs: Date.now(),
      recentEventSequence: ++recentCapabilityEventSequenceRef.current,
    })
  }, [persistentRequestScopeKey])

  useEffect(() => {
    if (!dataSource?.subscribeServerRequests) return undefined
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    void Promise.resolve(dataSource.subscribeServerRequests({
      signal: controller.signal,
      onServerRequest: handleServerRequest,
      onNotification: handleNotification,
    })).then((cleanup) => {
      if (typeof cleanup === 'function') dispose = cleanup
    })
    return () => {
      controller.abort()
      dispose?.()
    }
  }, [dataSource, handleNotification, handleServerRequest])

  useEffect(() => {
    if (!dataSource) return undefined

    function startFromPayload(payload: AgentPanelNewConversationPayload | undefined) {
      const workspaceContext = workspaceContextFromNewConversationPayload(payload)
      resetDraftModeSettings()
      createDraftConversation({
        ...(payload?.title?.trim() ? { title: payload.title.trim() } : {}),
        ...(typeof payload?.projectId === 'number' ? { projectId: payload.projectId } : {}),
        ...(workspaceContext ? { workspaceContext } : {}),
      })
    }

    for (let payload = consumeAgentPanelNewConversation(); payload; payload = consumeAgentPanelNewConversation()) {
      startFromPayload(payload)
    }

    function handleNewConversation(event: Event) {
      const detail = (event as CustomEvent<AgentPanelNewConversationPayload>).detail
      startFromPayload(consumeAgentPanelNewConversation() ?? detail)
    }

    window.addEventListener(AGENT_PANEL_NEW_CONVERSATION_EVENT, handleNewConversation)
    return () => window.removeEventListener(AGENT_PANEL_NEW_CONVERSATION_EVENT, handleNewConversation)
  }, [createDraftConversation, dataSource, resetDraftModeSettings])

  useEffect(() => {
    if (!dataSource) return undefined

    function startFromPayload(payload: AgentPanelWorkspacePayload | undefined) {
      if (!payload) return
      void startWorkspaceTask(payload).catch((nextError) => setError(errorMessage(nextError)))
    }

    for (let payload = consumeAgentPanelWorkspace(); payload; payload = consumeAgentPanelWorkspace()) {
      startFromPayload(payload)
    }

    function handleWorkspace(event: Event) {
      const detail = (event as CustomEvent<AgentPanelWorkspacePayload>).detail
      startFromPayload(consumeAgentPanelWorkspace() ?? detail)
    }

    window.addEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
    return () => window.removeEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
  }, [dataSource, startWorkspaceTask])

  useEffect(() => {
    debugAgentChatShellLoad('thread-load-effect', {
      autoLoadThreads,
      hasDataSource: Boolean(dataSource),
      threadScopeKey,
      surface,
      showThreadList,
    })
    if (autoLoadThreads) {
      void loadThreadsRef.current()
      return
    }
    void restoreStoredThreadRef.current()
  }, [autoLoadThreads, dataSource])

  useEffect(() => {
    if (!dataSource || !activeThreadId || !dataSource.subscribeThread) return undefined
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    void Promise.resolve(dataSource.subscribeThread({
      threadId: activeThreadId,
      signal: controller.signal,
      onNotification: handleNotification,
      onServerRequest: dataSource.subscribeServerRequests && dataSource.serverRequestSubscriptionMode !== 'globalWithThreadFallback'
        ? undefined
        : handleServerRequest,
    })).then((cleanup) => {
      if (typeof cleanup === 'function') dispose = cleanup
    })
    return () => {
      controller.abort()
      dispose?.()
    }
  }, [activeThreadId, dataSource, handleNotification, handleServerRequest])

  useEffect(() => {
    if (!dataSource || pendingThreadReadRequests.length === 0) return
    for (const request of pendingThreadReadRequests) {
      dispatchRuntime({ type: 'beginThreadReadRequest', requestId: request.id })
      void dataSource.readThread(request.threadId, request.input)
        .then((thread) => upsertThreadReadResult(thread, request.input))
        .catch((nextError) => setError(errorMessage(nextError)))
        .finally(() => dispatchRuntime({ type: 'completeThreadReadRequest', requestId: request.id }))
    }
  }, [dataSource, pendingThreadReadRequests, upsertThreadReadResult])

  useEffect(() => {
    if (!dataSource?.resumeThread || pendingThreadResumeRequests.length === 0) return
    for (const request of pendingThreadResumeRequests) {
      if (inFlightThreadResumeIdsRef.current.has(request.threadId)) continue
      if (closedThreadIds.has(request.threadId)) {
        dispatchRuntime({ type: 'clearThreadResumeRequest', requestId: request.id })
        continue
      }
      inFlightThreadResumeIdsRef.current.add(request.threadId)
      dispatchRuntime({ type: 'beginThreadResumeRequest', requestId: request.id })
      const thread = runtimeRef.current.threads.find((item) => item.id === request.threadId)
      void dataSource.resumeThread({
        threadId: request.threadId,
        runProfile: agentRunProfilePresetById(profilePresetId),
        ...(thread?.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
        ...selectedModelSelectionForRequest(thread),
      })
        .then((resumedThread) => {
          dispatchRuntime({ type: 'completeThreadResumeRequest', requestId: request.id, thread: resumedThread })
        })
        .catch((nextError) => {
          const message = errorMessage(nextError)
          setError(message)
          dispatchRuntime({ type: 'completeThreadResumeRequest', requestId: request.id, error: message })
        })
        .finally(() => {
          inFlightThreadResumeIdsRef.current.delete(request.threadId)
        })
    }
  }, [closedThreadIds, dataSource, pendingThreadResumeRequests, profilePresetId, selectedModelSelectionForRequest])

  useLayoutEffect(() => {
    const anchor = olderItemsScrollAnchorRef.current
    const thread = scrollRef.current
    if (!anchor || !thread) return
    olderItemsScrollAnchorRef.current = null
    suppressNextAutoScrollRef.current = true
    thread.scrollTop = anchor.scrollTop + Math.max(0, thread.scrollHeight - anchor.scrollHeight)
  }, [threads, visibleThreadItemCount])

  useEffect(() => {
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false
      return
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threads, pendingUserItems, streamingAgentItems, realtimeTranscriptItems, realtimeAudioItems, activeThreadId])

  const {
    activeThread,
    activeTurn,
    visibleItems: runtimeVisibleItems,
    visiblePendingServerRequests,
    visibleStatusItems,
  } = useMemo(() => selectAgentChatRuntimeView(runtime), [runtime])
  useEffect(() => {
    setVisibleThreadItemCount(AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE)
  }, [activeThreadId])
  const visibleItemWindow = useMemo(() => buildAgentChatVisibleItemWindow({
    items: runtimeVisibleItems,
    visibleCount: visibleThreadItemCount,
    keepItem: (item) => item.streaming,
  }), [runtimeVisibleItems, visibleThreadItemCount])
  const visibleItems = visibleItemWindow.visibleItems
  const activeThreadReadState = activeThreadId ? threadReadStates[activeThreadId] : undefined
  const olderThreadReadPending = Boolean(activeThreadId && threadReadRequests.some((request) => (
    request.threadId === activeThreadId
    && (request.input.direction ?? 'newer') === 'older'
  )))
  const canFetchEarlierThreadItems = Boolean(
    activeThreadId
    && activeThreadReadState
    && !activeThreadReadState.hasCompleteHistory
    && visibleItemWindow.hiddenCount === 0
    && !olderThreadReadPending,
  )
  const canShowOlderThreadItems = visibleItemWindow.hiddenCount > 0 || canFetchEarlierThreadItems
  const showOlderThreadItems = useCallback(() => {
    const thread = scrollRef.current
    if (thread) {
      olderItemsScrollAnchorRef.current = {
        scrollHeight: thread.scrollHeight,
        scrollTop: thread.scrollTop,
      }
    }
    if (visibleItemWindow.hiddenCount === 0) {
      if (activeThreadId && canFetchEarlierThreadItems) {
        dispatchRuntime({ type: 'requestThreadRead', threadId: activeThreadId, direction: 'older' })
      }
      return
    }
    const previousScrollHeight = thread?.scrollHeight ?? 0
    const previousScrollTop = thread?.scrollTop ?? 0
    setVisibleThreadItemCount(visibleItemWindow.nextVisibleCount)
    requestAnimationFrame(() => {
      if (!thread) return
      thread.scrollTop = previousScrollTop + Math.max(0, thread.scrollHeight - previousScrollHeight)
    })
  }, [activeThreadId, canFetchEarlierThreadItems, visibleItemWindow.hiddenCount, visibleItemWindow.nextVisibleCount])
  const handleThreadScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!canShowOlderThreadItems) return
    if (event.currentTarget.scrollTop > AGENT_CHAT_OLDER_ITEMS_SCROLL_THRESHOLD_PX) return
    showOlderThreadItems()
  }, [canShowOlderThreadItems, showOlderThreadItems])
  const activeThreadModelValue = useMemo(() => {
    const model = (activeThreadId ? threadModelOverrides[activeThreadId] : undefined)
      || activeThread?.executionSettings?.model
      || undefined
    if (!model) return selectedModelId
    return modelOptions.find((option) => publicModelId(option) === model)?.id ?? selectedModelId
  }, [activeThread?.executionSettings?.model, activeThreadId, modelOptions, selectedModelId, threadModelOverrides])
  useEffect(() => {
    const nextProfilePresetId = agentRunProfilePresetIdFromExecutionSettings(activeThread?.executionSettings)
    if (nextProfilePresetId) setProfilePresetId(nextProfilePresetId)
  }, [
    activeThread?.executionSettings?.approvalPolicy,
    activeThread?.executionSettings?.approvalsReviewer,
    activeThread?.executionSettings?.permissions,
  ])
  const handleModelChange = useCallback((modelId: number | null) => {
    onSelectedModelChange?.(modelId)
    if (!activeThreadId) return
    const model = modelId === null ? undefined : modelOptions.find((option) => option.id === modelId)
    setThreadModelOverrides((current) => {
      const next = { ...current }
      if (!model) {
        delete next[activeThreadId]
      } else {
        next[activeThreadId] = publicModelId(model)
      }
      return next
    })
  }, [activeThreadId, modelOptions, onSelectedModelChange])
  const applyThreadExecutionSettings = useCallback((threadId: string, settings: unknown) => {
    const executionSettings = recordValue(settings)
    if (!executionSettings) return
    dispatchRuntime({
      type: 'updateThreads',
      update: (current) => current.map((item) => item.id === threadId
        ? {
            ...item,
            updatedAt: Math.max(item.updatedAt, Math.floor(Date.now() / 1000)),
            executionSettings: {
              ...item.executionSettings,
              ...executionSettings,
            },
          }
        : item),
    })
  }, [])
  const syncThreadRunProfileSettingsForTurn = useCallback(async (
    syncDataSource: AgentChatDataSource,
    thread: AgentChatThread,
    runProfile: AgentRunProfileSelection,
  ) => {
    if (!syncDataSource.updateThreadSettings || thread.status === 'notLoaded') return
    if (!agentThreadNeedsRunProfileSettingsSync(thread, runProfile)) return
    const settings = await syncDataSource.updateThreadSettings({
      threadId: thread.id,
      runProfile,
      ...(thread.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
      ...selectedModelSelectionForRequest(thread),
    })
    applyThreadExecutionSettings(thread.id, settings)
  }, [applyThreadExecutionSettings, selectedModelSelectionForRequest])
  const handleProfilePresetChange = useCallback((nextProfilePresetId: AgentRunProfilePresetId) => {
    const previousProfilePresetId = profilePresetId
    setProfilePresetId(nextProfilePresetId)
    if (!dataSource?.updateThreadSettings || !activeThreadId || activeTurn) return
    const thread = runtimeRef.current.threads.find((item) => item.id === activeThreadId)
    if (!thread || thread.status === 'notLoaded') return
    void dataSource.updateThreadSettings({
      threadId: activeThreadId,
      runProfile: agentRunProfilePresetById(nextProfilePresetId),
      ...(thread?.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
      ...selectedModelSelectionForRequest(thread),
    })
      .then((settings) => {
        applyThreadExecutionSettings(activeThreadId, settings)
      })
      .catch((nextError) => {
        setProfilePresetId(previousProfilePresetId)
        setError(errorMessage(nextError))
      })
  }, [activeThreadId, activeTurn, applyThreadExecutionSettings, dataSource, profilePresetId, selectedModelSelectionForRequest])
  const hasComposerActionLayer = visiblePendingServerRequests.length > 0
  const hasThreadBodyContent = Boolean(
    visibleItems.length
    || recentCapabilityEvents.length
    || error,
  )
  const hasChatContent = hasThreadBodyContent || hasComposerActionLayer

  useEffect(() => {
    if (!dataSource || !activeThreadId || activeThread || visiblePendingServerRequests.length === 0) return
    dispatchRuntime({ type: 'requestThreadRead', threadId: activeThreadId })
  }, [activeThread, activeThreadId, dataSource, visiblePendingServerRequests.length])

  const canSend = Boolean(
    dataSource
    && (composer.input.trim() || composer.composerAttachments.length > 0)
    && !sending
    && !composer.uploading
    && (!activeTurn || dataSource.startTurn || dataSource.startTextTurn),
  )
  const canStopActiveTurn = Boolean(activeTurn && dataSource?.interruptTurn && !stoppingTurn)
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  const shellClassName = surface === 'page'
    ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell'
    : 'ai-agent-panel-shell'
  const deleteQueuedInput = useCallback((id: string) => {
    const removed = queuedInputs.find((item) => item.id === id)
    if (removed) composer.revokeAttachmentPreviewUrls(removed.attachments)
    setQueuedInputs((current) => current.filter((item) => item.id !== id))
  }, [composer, queuedInputs])
  const editQueuedInput = useCallback((id: string) => {
    const item = queuedInputs.find((candidate) => candidate.id === id)
    if (!item || item.status === 'sending') return
    setQueuedInputs((current) => current.map((candidate) => candidate.id === id
      ? { ...candidate, status: 'editing', error: null }
      : candidate))
  }, [queuedInputs])
  const updateQueuedInputText = useCallback((id: string, text: string) => {
    setQueuedInputs((current) => current.map((candidate) => {
      if (candidate.id !== id || candidate.status === 'sending') return candidate
      return {
        ...candidate,
        text,
        inputs: agentChatQueuedInputsWithText(candidate.inputs, text),
        status: 'draft',
        error: null,
      }
    }))
  }, [])
  const cancelQueuedInputEdit = useCallback((id: string) => {
    setQueuedInputs((current) => current.map((candidate) => candidate.id === id && candidate.status === 'editing'
      ? { ...candidate, status: 'draft' }
      : candidate))
  }, [])
  const steerQueuedInputNow = useCallback(async (id: string) => {
    if (!dataSource?.steerTurn || !activeThread || !activeTurn) return
    const item = queuedInputs.find((candidate) => candidate.id === id)
    if (!item || item.status === 'sending') return
    if (item.threadId !== activeThread.id) {
      setQueuedInputs((current) => current.map((candidate) => candidate.id === id
        ? { ...candidate, status: 'failed', error: 'This queued message belongs to another thread.' }
        : candidate))
      return
    }
    setQueuedInputs((current) => current.map((candidate) => candidate.id === id
      ? { ...candidate, status: 'sending', error: null }
      : candidate))
    try {
      await dataSource.steerTurn({
        threadId: item.threadId,
        turnId: activeTurn.id,
        clientUserMessageId: item.clientUserMessageId,
        inputs: item.inputs,
      })
      composer.revokeAttachmentPreviewUrls(item.attachments)
      setQueuedInputs((current) => current.filter((candidate) => candidate.id !== id))
    } catch (nextError) {
      setQueuedInputs((current) => current.map((candidate) => candidate.id === id
        ? { ...candidate, status: 'failed', error: errorMessage(nextError) }
        : candidate))
    }
  }, [activeThread, activeTurn, composer, dataSource, queuedInputs])
  const sendMessage = useCallback(async (nextProfilePresetId: AgentRunProfilePresetId = profilePresetId) => {
    if (!dataSource || sending) return
    const runProfile = agentRunProfilePresetById(nextProfilePresetId)
    const composerInput = composer.getInput()
    const text = composerInput.trim()
    const sentAttachments = composer.composerAttachments
    const inputs = agentChatInputsFromTextAndAttachments(text, sentAttachments)
    if (inputs.length === 0) return
    const previousWorkspace = {
      input: composerInput,
      attachments: composer.attachments,
      workspaceContext: composer.selectedWorkspaceContext,
    }
    let restoreConversationId = composerConversationId
    const sourceConversationId = composerConversationId
    setSending(true)
    setError(null)
    try {
      const selectedWorkspaceProjectId = typeof composer.selectedWorkspaceContext.projectId === 'number'
        ? composer.selectedWorkspaceContext.projectId
        : undefined
      let thread = activeThread
      let turnDataSource = dataSource
      let firstTurnDraftControls: AgentChatThreadControlOptions | undefined
      if (thread?.status === 'notLoaded') {
        thread = await ensureAgentChatThreadReadyForTurn({
          dataSource,
          thread,
          runProfile,
          modelSelection: selectedModelSelectionForRequest(thread),
        })
        upsertThread(thread)
      }
      if (!thread) {
        firstTurnDraftControls = draftThreadControlOptions({ collaborationMode, goalModeEnabled })
        const started = await startThreadResult({
          runProfile,
          useDraftModeSettings: true,
          workspaceContext: composer.selectedWorkspaceContext,
          ...(selectedWorkspaceProjectId !== undefined ? { projectId: selectedWorkspaceProjectId } : {}),
        })
        if (!started) return
        thread = started.thread
        turnDataSource = started.dataSource
      }
      if (firstTurnDraftControls?.goalModeEnabled && turnDataSource.setThreadGoal && !activeTurn) {
        await turnDataSource.setThreadGoal({
          threadId: thread.id,
          objective: text || composer.composerAttachments.map((attachment) => attachment.name).filter(Boolean).join(', ') || composerPlaceholder,
          status: 'active',
        })
      }
      restoreConversationId = agentChatComposerConversationId(threadScopeKey, thread.id)
      if (sourceConversationId !== restoreConversationId) {
        useAgentSessionStore.getState().clearConversationWorkspace(userId, sourceConversationId)
      }
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, {
        input: '',
        attachments: [],
        workspaceContext: composer.selectedWorkspaceContext,
      })
      composer.updateWorkspace({ input: '', attachments: [] })
      clearAgentChatComposerEditor(composerInputRef.current)
      const clientUserMessageId = `agent_user_${Date.now()}`
      if (activeTurn) {
        setQueuedInputs((current) => [
          ...current,
          {
            id: `queued_input_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            threadId: thread.id,
            text,
            inputs,
            attachments: sentAttachments,
            workspaceContext: composer.selectedWorkspaceContext,
            profilePresetId: nextProfilePresetId,
            clientUserMessageId,
            status: 'draft',
            error: null,
            createdAt: Date.now(),
          },
        ])
        setQueuedInputsCollapsed(false)
        return
      }
      dispatchRuntime({
        type: 'appendPendingUserItem',
        item: {
          threadId: thread.id,
          item: {
            type: 'userMessage',
            id: clientUserMessageId,
            clientId: clientUserMessageId,
            content: inputs,
          },
        },
      })
      if (!firstTurnDraftControls) {
        await syncThreadRunProfileSettingsForTurn(turnDataSource, thread, runProfile)
      }
      if (turnDataSource.startTurn) {
        await turnDataSource.startTurn({
          threadId: thread.id,
          clientUserMessageId,
          inputs,
          runProfile,
          ...firstTurnDraftControls,
          ...selectedModelSelectionForRequest(thread),
        })
      } else {
        await turnDataSource.startTextTurn({
          threadId: thread.id,
          clientUserMessageId,
          text,
          runProfile,
          ...firstTurnDraftControls,
          ...selectedModelSelectionForRequest(thread),
        })
      }
      composer.revokeAttachmentPreviewUrls(sentAttachments)
    } catch (nextError) {
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, previousWorkspace)
      composer.updateWorkspace(previousWorkspace)
      setError(errorMessage(nextError))
    } finally {
      setSending(false)
    }
  }, [activeThread, activeTurn, collaborationMode, composer, composerConversationId, composerPlaceholder, dataSource, goalModeEnabled, profilePresetId, selectedModelSelectionForRequest, sending, startThreadResult, syncThreadRunProfileSettingsForTurn, threadScopeKey, userId])
  const submitQueuedInputsAsTurn = useCallback(async (ids: string[]) => {
    if (!dataSource || sending) return
    const idSet = new Set(ids)
    const items = queuedInputs
      .filter((candidate) => idSet.has(candidate.id) && candidate.status === 'draft')
      .sort((a, b) => a.createdAt - b.createdAt)
    const firstItem = items[0]
    if (!firstItem) return
    const threadId = firstItem.threadId
    const threadItems = items.filter((item) => item.threadId === threadId)
    const thread = runtimeRef.current.threads.find((candidate) => candidate.id === threadId)
    if (!thread || thread.status === 'notLoaded') return
    const runProfile = agentRunProfilePresetById(firstItem.profilePresetId)
    const clientUserMessageId = threadItems.length === 1
      ? threadItems[0].clientUserMessageId
      : `queued_batch_${Date.now()}`
    const inputs = threadItems.flatMap((item) => item.inputs)
    const text = threadItems.map((item) => item.text || agentChatQueuedInputSummary(item)).filter(Boolean).join('\n\n')
    const sendingIds = new Set(threadItems.map((item) => item.id))
    setSending(true)
    setQueuedInputs((current) => current.map((candidate) => sendingIds.has(candidate.id)
      ? { ...candidate, status: 'sending', error: null }
      : candidate))
    try {
      await syncThreadRunProfileSettingsForTurn(dataSource, thread, runProfile)
      if (dataSource.startTurn) {
        await dataSource.startTurn({
          threadId,
          clientUserMessageId,
          inputs,
          runProfile,
          ...selectedModelSelectionForRequest(thread),
        })
      } else {
        await dataSource.startTextTurn({
          threadId,
          clientUserMessageId,
          text,
          runProfile,
          ...selectedModelSelectionForRequest(thread),
        })
      }
      for (const item of threadItems) composer.revokeAttachmentPreviewUrls(item.attachments)
      setQueuedInputs((current) => current.filter((candidate) => !sendingIds.has(candidate.id)))
    } catch (nextError) {
      setQueuedInputs((current) => current.map((candidate) => sendingIds.has(candidate.id)
        ? { ...candidate, status: 'failed', error: errorMessage(nextError) }
        : candidate))
    } finally {
      setSending(false)
    }
  }, [composer, dataSource, queuedInputs, selectedModelSelectionForRequest, sending, syncThreadRunProfileSettingsForTurn])
  const submitQueuedInputAsTurn = useCallback(async (id: string) => {
    await submitQueuedInputsAsTurn([id])
  }, [submitQueuedInputsAsTurn])

  useEffect(() => {
    if (!activeThread || activeTurn || sending) return
    const nextQueuedInputs = queuedInputs.filter((item) => item.threadId === activeThread.id && item.status === 'draft')
    if (nextQueuedInputs.length === 0) return
    void submitQueuedInputsAsTurn(nextQueuedInputs.map((item) => item.id))
  }, [activeThread, activeTurn, queuedInputs, sending, submitQueuedInputsAsTurn])

  const stopActiveTurn = useCallback(async () => {
    if (!dataSource?.interruptTurn || !activeThread || !activeTurn || stoppingTurn) return
    setStoppingTurn(true)
    setError(null)
    try {
      await dataSource.interruptTurn({
        threadId: activeThread.id,
        turnId: activeTurn.id,
        reason: `Interrupted from ${providerLabel}.`,
      })
      const input = buildAgentChatRuntimeThreadReadInput(runtimeRef.current, activeThread.id)
      const thread = await dataSource.readThread(activeThread.id, input)
      upsertThreadReadResult(thread, input)
      const nextQueuedInputs = queuedInputs.filter((item) => item.threadId === activeThread.id && item.status === 'draft')
      if (nextQueuedInputs.length > 0) void submitQueuedInputsAsTurn(nextQueuedInputs.map((item) => item.id))
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setStoppingTurn(false)
    }
  }, [activeThread, activeTurn, dataSource, providerLabel, queuedInputs, stoppingTurn, submitQueuedInputsAsTurn, upsertThreadReadResult])

  useEffect(() => {
    function handleAgentChatEscapeKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (!activeTurn || !dataSource?.interruptTurn || stoppingTurn) return
      event.preventDefault()
      void stopActiveTurn()
    }

    window.addEventListener('keydown', handleAgentChatEscapeKey)
    return () => window.removeEventListener('keydown', handleAgentChatEscapeKey)
  }, [activeTurn, dataSource?.interruptTurn, stopActiveTurn, stoppingTurn])

  const resolveServerRequest = useCallback((request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => {
    dispatchRuntime({ type: 'resolveServerRequest', request, response })
  }, [])

  const renameThread = useCallback(async (threadId: string, name: string) => {
    if (!dataSource?.renameThread) return
    setError(null)
    try {
      const response = await dataSource.renameThread({ threadId, name })
      if (isAgentChatThread(response)) upsertThread(response)
      else {
        dispatchRuntime({
          type: 'updateThreads',
          update: (current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Date.now() } : thread),
        })
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [dataSource, upsertThread])

  const sourceOpenThreads = useMemo(() => (
    sourceThreadList.filter((thread) => agentChatSourceThreadHasContent(thread) && !closedThreadIds.has(thread.id))
  ), [closedThreadIds, sourceThreadList])
  const registryOpenThreads = useMemo(() => (
    dataSource
      ? Object.values(conversationsById)
        .filter((record) => (
          record.userId === userId
          && Boolean(record.providerThreadId.trim())
          && record.open !== false
          && !record.archived
          && agentConversationRecordMatchesProviderIdentity(record, providerIdentity)
        ))
        .map((record) => agentChatThreadFromRegistryRecord(record, dataSource))
      : []
  ), [conversationsById, dataSource, providerIdentity, userId])
  const openThreadCandidates = useMemo(() => {
    const next = new Map<string, AgentChatThread>()
    for (const thread of registryOpenThreads) next.set(thread.id, thread)
    for (const thread of sourceOpenThreads) {
      if (thread.id === activeThreadId || openThreadIds.has(thread.id)) next.set(thread.id, thread)
    }
    for (const thread of threads) {
      if (closedThreadIds.has(thread.id)) continue
      if (thread.id === activeThreadId || openThreadIds.has(thread.id)) next.set(thread.id, thread)
    }
    return Array.from(next.values())
  }, [activeThreadId, closedThreadIds, openThreadIds, registryOpenThreads, sourceOpenThreads, threads])

  const closeThreadTab = useCallback(async (threadId: string) => {
    const thread = runtimeRef.current.threads.find((item) => item.id === threadId)
    if (thread && agentChatThreadIsRunning(thread)) {
      setError('Stop the running turn before closing this tab.')
      return
    }
    if (threadId !== activeThreadId) {
      markThreadClosed(threadId, false)
      return
    }

    const openThreads = openThreadCandidates
    const closingIndex = openThreads.findIndex((item) => item.id === threadId)
    const remainingThreads = openThreads.filter((item) => item.id !== threadId)
    const nextThread = remainingThreads[Math.max(0, closingIndex - 1)] ?? remainingThreads[0]

    markThreadClosed(threadId, !nextThread)
    if (!nextThread) {
      setActiveThreadIdValue(null)
      return
    }

    setActiveThreadIdValue(nextThread.id)
    markThreadOpen(nextThread.id)
    setError(null)
    try {
      const { thread: nextThreadResult, input } = await readHistoryThread(nextThread.id)
      upsertThreadReadResult(nextThreadResult, input)
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadId, markThreadClosed, markThreadOpen, openThreadCandidates, readHistoryThread, setActiveThreadIdValue, upsertThreadReadResult])

  const reorderThreadTab = useCallback((_draggedId: string, _targetId: string, _position: 'before' | 'after') => {
    // Tab order is registry-derived. Drag persistence belongs in the core registry once product sorting rules are finalized.
  }, [])

  const threadTabs = useMemo(() => openThreadCandidates
    .map((thread, index) => ({ thread, index }))
    .sort((a, b) => {
      const aOrder = threadOrderIndex.get(a.thread.id) ?? Number.MAX_SAFE_INTEGER
      const bOrder = threadOrderIndex.get(b.thread.id) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || a.index - b.index
    })
    .map(({ thread }) => ({
      id: thread.id,
      title: thread.name || thread.preview || 'Untitled thread',
      messageCount: thread.turns.reduce((count, turn) => count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length, 0),
      sessionState: agentChatThreadProviderSessionState(thread),
      ...(dataSource?.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
    })), [dataSource?.renameThread, openThreadCandidates, renameThread, threadOrderIndex])
  const closedHistoryThreads = useMemo(() => {
    const closedIds = closedThreadIds
    return sourceThreadList.filter((thread) => agentChatSourceThreadHasContent(thread) && closedIds.has(thread.id))
  }, [closedThreadIds, sourceThreadList])
  if (!dataSource) {
    return (
      <AgentShell density="compact" className={shellClassName}>
        <AgentMain className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'} data-agent-chat-host={resolvedHost}>
          <AgentEmpty role="status" aria-live="polite">
            <span>{error || unavailableLabel}</span>
          </AgentEmpty>
        </AgentMain>
      </AgentShell>
    )
  }

  return (
    <AgentShell density="compact" data-agent-chat-host={resolvedHost} className={shellClassName}>
      <AgentMain
        className={surface === 'page'
          ? `agent-page-chat-main${!hasChatContent ? ' agent-page-chat-main--empty' : ''}`
          : 'ai-agent-panel-main'}
        data-agent-chat-host={resolvedHost}
      >
          {surface === 'panel' ? (
            <section
              className="ai-agent-panel-content-card"
              data-empty-conversation={!hasChatContent ? 'true' : undefined}
              data-history-open={historyOpen ? 'true' : undefined}
            >
              <AgentHeader className="ai-agent-panel-chat-header">
                <div className="ai-agent-panel-chat-toolbar">
                  <div className="ai-agent-panel-chat-toolbar-tabs">
                    <AgentConversationTabsPanel
                      activeConversationId={activeThreadId ?? '__draft__'}
                      conversations={threadTabs}
                      endAccessory={(
                        <ProviderControls
                          historyOpen={historyOpen}
                          onNewConversation={() => {
                            resetDraftModeSettings()
                            createDraftConversation()
                          }}
                          onToggleHistory={() => setHistoryOpen((open) => !open)}
                          showNewConversation
                        />
                      )}
                      onCloseConversation={(threadId) => {
                        void closeThreadTab(threadId)
                      }}
                      onCloseTabContextMenu={() => undefined}
                      onOpenKeyboardMenu={() => undefined}
                      onOpenMenu={() => undefined}
                      onReorderConversation={reorderThreadTab}
                      onSelectConversation={(threadId) => void openThread(threadId)}
                      conversationTabsLabel={threadListLabel}
                      closeConversationLabel="Close conversation"
                      archiveConversationLabel="Archive conversation"
                      renameConversationLabel="Rename conversation"
                    />
                  </div>
                </div>
              </AgentHeader>
              <AgentChatDataSourceThreadBody
                emptyThreadLabel={resolvedEmptyThreadLabel}
                error={error}
                recentCapabilityEvents={recentCapabilityEvents}
                scrollRef={scrollRef}
                statusItems={visibleStatusItems}
                hiddenItemCount={visibleItemWindow.hiddenCount}
                canLoadEarlierItems={canShowOlderThreadItems}
                visibleItems={visibleItems}
                onScroll={handleThreadScroll}
                onShowOlderItems={showOlderThreadItems}
              />
            </section>
          ) : (
            <section className={`agent-page-chat-thread-shell${!hasChatContent ? ' agent-page-chat-thread-shell--empty' : ''}`} aria-label={composerPlaceholder}>
	              {!hasChatContent && resolvedEmptyThreadLabel ? (
	                <div className="agent-page-chat-empty">
	                  <h1 className="agent-page-chat-empty-title">{resolvedEmptyThreadLabel}</h1>
	                </div>
	              ) : (
                <div className="agent-page-chat-thread">
                  <AgentChatDataSourceThreadBody
                    emptyThreadLabel={resolvedEmptyThreadLabel}
                    error={error}
                    recentCapabilityEvents={recentCapabilityEvents}
                    scrollRef={scrollRef}
                    statusItems={visibleStatusItems}
                    hiddenItemCount={visibleItemWindow.hiddenCount}
                    canLoadEarlierItems={canShowOlderThreadItems}
                    visibleItems={visibleItems}
                    onScroll={handleThreadScroll}
                    onShowOlderItems={showOlderThreadItems}
                  />
                </div>
              )}
            </section>
          )}
          <div className={surface === 'page'
            ? `agent-page-chat-composer relative z-30${!hasChatContent ? ' agent-page-chat-empty-composer' : ''}`
            : 'ai-agent-panel-composer-wrap relative z-30'}
          >
            <AgentComposerActionLayer
              pendingServerRequests={visiblePendingServerRequests}
              onResolveServerRequest={resolveServerRequest}
            />
            <AgentComposerSection
              answeringPendingInput={false}
              addMentionTrigger={composer.addMentionTrigger}
              buildingSendWorkspace={false}
              canSend={canSend}
              canAnswerPendingInputWithText={false}
              canStopActiveRun={canStopActiveTurn}
              chrome="flush"
              composerAttachmentEntries={composer.composerAttachmentEntries}
              composerAttachmentsCount={composer.composerAttachments.length}
              composerInput={composer.input}
              composerPlaceholder={composerPlaceholder}
              debugBeforeSend={false}
              draggingFiles={composer.draggingFiles}
              fileRef={composerFileRef}
              inputRef={composerInputRef}
              loading={sending}
              mentionRangeActive={!!composer.mentionRange}
              mentionResults={composer.mentionResults}
              modelOptions={modelOptions}
              modelValue={activeThreadModelValue}
              collaborationMode={collaborationMode}
              goalModeEnabled={goalModeEnabled}
              goalState={activeThread?.goal ?? null}
              queuedInputs={queuedInputs}
              queuedInputsCollapsed={queuedInputsCollapsed}
              queuedInputSteerEnabled={Boolean(activeTurn && dataSource.steerTurn)}
              pendingActiveRunInputQueue={[]}
              profilePresetId={profilePresetId}
              stoppingActiveRun={stoppingTurn}
              uploadedFileCount={composer.uploadedFileCount}
              uploading={composer.uploading}
              uploadingFileNames={composer.uploadingFileNames}
              workspaceProjectOptions={composer.workspaceProjectOptions}
              workspaceProjectLocked={composerWorkspaceContextLocked}
              workspaceProjectValue={composer.workspaceProjectValue}
              workspaceProjectsLoading={composer.workspaceProjectsLoading}
              onAcceptMention={() => {
                if (composer.mentionRange && composer.mentionResults.length > 0) {
                  composer.insertResourceMention(composer.mentionResults[0])
                  return true
                }
                return false
              }}
              onComposerDragEnter={composer.handleComposerDragEnter}
              onComposerDragLeave={composer.handleComposerDragLeave}
              onComposerDragOver={composer.handleComposerDragOver}
              onComposerDrop={(event) => void composer.handleComposerDrop(event)}
              onComposerPaste={(event) => void composer.handleComposerPaste(event)}
              onDebugBeforeSendChange={() => undefined}
              onInputChange={composer.updateInputDraft}
              onMentionEscape={() => composer.setMentionRange(null)}
              onMentionSelect={composer.insertResourceMention}
              onMentionState={composer.updateMentionState}
              onCollaborationModeChange={onCollaborationModeChange}
              onGoalModeEnabledChange={onGoalModeEnabledChange}
              onModelChange={handleModelChange}
              onProfilePresetChange={handleProfilePresetChange}
              onQueuedInputCollapseChange={setQueuedInputsCollapsed}
              onQueuedInputDelete={deleteQueuedInput}
              onQueuedInputEdit={editQueuedInput}
              onQueuedInputEditCancel={cancelQueuedInputEdit}
              onQueuedInputSteerNow={(id) => void steerQueuedInputNow(id)}
              onQueuedInputTextChange={updateQueuedInputText}
              onRemoveAttachment={composer.removeAttachment}
              onSend={(profilePresetId) => void sendMessage(profilePresetId)}
              onStopActiveRun={() => void stopActiveTurn()}
              onUploadFiles={(files) => void composer.uploadFiles(files)}
              onWorkspaceProjectChange={composer.changeWorkspaceProject}
              showApprovalPresetSelector
              showAttachmentTools
              showDebugPreview={false}
              showMentionTools
	            />
	          </div>
	          {surface === 'panel' && historyOpen ? (
            <AgentChatDataSourceHistoryPanel
              dataSourceLabel={dataSource.label}
              emptyThreadListLabel={emptyThreadListLabel}
              endpoint={endpoint}
              hasMoreThreadPages={Boolean(threadListNextCursor)}
              historyThreads={closedHistoryThreads}
              loading={loading}
              loadingMore={threadListLoadingMore}
              threadListLabel={threadListLabel}
              onLoadMoreThreads={loadMoreThreads}
              onLoadThreads={refreshThreadList}
              onOpenThread={openThread}
            />
          ) : null}
        </AgentMain>
    </AgentShell>
  )
}

function clearAgentChatComposerEditor(editor: HTMLDivElement | null): void {
  if (!editor) return
  editor.textContent = ''
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
}

function agentChatConversationWorkspaceIsEmpty(workspace: { input?: string; attachments?: unknown[] } | undefined): boolean {
  return !workspace?.input?.trim() && (workspace?.attachments?.length ?? 0) === 0
}

function agentChatComposerConversationId(threadScopeKey: string, threadId: string | null): string {
  return `${threadScopeKey}:${threadId ?? 'draft'}`
}

function createAgentChatDraftConversationId(threadScopeKey: string): string {
  return `${threadScopeKey}:draft:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isAgentChatThread(value: unknown): value is AgentChatThread {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as AgentChatThread).id === 'string'
    && Array.isArray((value as AgentChatThread).turns),
  )
}

function agentChatThreadIsRunning(thread: AgentChatThread): boolean {
  return thread.status === 'running' || thread.turns.some((turn) => turn.status === 'inProgress')
}

function readSourceThreadListCache(threadScopeKey: string): {
  loaded: boolean
  nextCursor: string | null
  threads: AgentChatThread[]
} {
  return sourceThreadListCache.get(threadScopeKey) ?? {
    loaded: false,
    nextCursor: null,
    threads: [],
  }
}

function agentChatSourceThreadHasContent(thread: Pick<AgentChatThread, 'name' | 'preview' | 'turns'>): boolean {
  if (thread.name?.trim() || thread.preview?.trim()) return true
  return thread.turns.some((turn) => turn.items.some((item) => item.type === 'userMessage' || item.type === 'agentMessage'))
}

function agentConversationRecordMatchesProviderIdentity(
  record: AgentConversationRegistryRecord,
  identity: {
    provider?: string
    providerId?: string
    providerInstanceId?: string
    providerProtocol?: string
  },
): boolean {
  const recordHasProviderIdentity = Boolean(record.provider || record.providerId || record.providerInstanceId || record.providerProtocol)
  if (!recordHasProviderIdentity) return true
  if (record.provider && identity.provider && record.provider !== identity.provider) return false
  if (record.providerId && identity.providerId && record.providerId !== identity.providerId) return false
  if (record.providerInstanceId && identity.providerInstanceId && record.providerInstanceId !== identity.providerInstanceId) return false
  if (record.providerProtocol && identity.providerProtocol && record.providerProtocol !== identity.providerProtocol) return false
  return true
}

function agentChatQueuedInputsWithText(inputs: AgentChatInput[], text: string): AgentChatInput[] {
  const trimmedText = text.trim()
  const nonTextInputs = inputs.filter((input) => input.type !== 'text')
  if (!trimmedText) return nonTextInputs
  return [agentChatTextInput(trimmedText), ...nonTextInputs]
}

function AgentChatDataSourceThreadBody({
  canLoadEarlierItems,
  emptyThreadLabel,
  error,
  hiddenItemCount,
  recentCapabilityEvents,
  scrollRef,
  statusItems,
  visibleItems,
  onScroll,
  onShowOlderItems,
}: {
  canLoadEarlierItems: boolean
  emptyThreadLabel?: string
  error: string | null
  hiddenItemCount: number
  recentCapabilityEvents: AgentChatRuntimeRecentCapabilityEvent[]
  scrollRef: { current: HTMLDivElement | null }
  statusItems: AgentPinnedStatusSummaryItem[]
  visibleItems: Array<{ viewId: string; item: AgentChatThreadItem; streaming: boolean }>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onShowOlderItems: () => void
}) {
  return (
    <AgentBody className="ai-agent-panel-thread-body">
      <AgentPinnedStatusShelf statusItems={statusItems} defaultExpanded={false} />
      <AgentThreadFill ref={(node) => { scrollRef.current = node }} className="ms-agent-chat-thread-fill" onScroll={onScroll}>
        {error ? (
          <div className="ms-agent-chat-thread-error">{error}</div>
        ) : null}
        {recentCapabilityEvents.length > 0 ? (
          <div className="ms-agent-chat-capability-events" data-testid="agent-chat-capability-events">
            {recentCapabilityEvents.map((item) => (
              <AgentChatRecentCapabilityEventCard key={item.id} event={item.event} />
            ))}
          </div>
        ) : null}
        {canLoadEarlierItems ? (
          <div className="ai-agent-panel-thread-window-control">
            <Button type="button" size="xs" variant="ghost" onClick={onShowOlderItems}>
              {hiddenItemCount > 0 ? `Load earlier items (${hiddenItemCount})` : 'Load earlier items'}
            </Button>
          </div>
        ) : null}
        <div className="ms-agent-chat-thread-items">
          {visibleItems.map((item) => (
            <AgentChatThreadItemView key={item.viewId} item={item.item} streaming={item.streaming} />
          ))}
          {!visibleItems.length && emptyThreadLabel ? (
            <AgentEmpty>
              <span>{emptyThreadLabel}</span>
            </AgentEmpty>
          ) : null}
        </div>
      </AgentThreadFill>
    </AgentBody>
  )
}

function AgentChatDataSourceHistoryPanel({
  dataSourceLabel,
  emptyThreadListLabel,
  endpoint,
  hasMoreThreadPages,
  historyThreads,
  loading,
  loadingMore,
  threadListLabel,
  onLoadMoreThreads,
  onLoadThreads,
  onOpenThread,
}: {
  dataSourceLabel: string
  emptyThreadListLabel: string
  endpoint?: string
  hasMoreThreadPages: boolean
  historyThreads: AgentChatThread[]
  loading: boolean
  loadingMore: boolean
  threadListLabel: string
  onLoadMoreThreads: () => Promise<void>
  onLoadThreads: () => Promise<void>
  onOpenThread: (threadId: string) => Promise<void>
}) {
  return (
    <section className="ai-agent-panel-empty-history" aria-label={threadListLabel}>
      <div className="ai-agent-panel-empty-history-header">
        <span>{threadListLabel}</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ai-agent-panel-empty-history-more"
          disabled={loading}
          onClick={() => void onLoadThreads()}
        >
          Refresh
        </Button>
      </div>
      <div className="ai-agent-panel-empty-history-list">
        {loading && historyThreads.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            <Loader2 size={14} className="animate-spin" />
            <span className="ml-2">Loading</span>
          </div>
        ) : historyThreads.length === 0 ? (
          <div className="ai-agent-panel-empty-history-empty">
            {emptyThreadListLabel}
          </div>
        ) : historyThreads.map((thread) => (
          <AgentConversationItem
            key={thread.id}
            title={thread.name || thread.preview || 'Untitled thread'}
            description={thread.preview || endpoint || dataSourceLabel}
            meta={formatAgentChatTime(thread.updatedAt)}
            className="ai-agent-panel-empty-history-item"
            onClick={() => void onOpenThread(thread.id)}
          />
        ))}
      </div>
      {hasMoreThreadPages ? (
        <div className="ai-agent-panel-empty-history-more-row">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="ai-agent-panel-empty-history-more"
            disabled={loadingMore}
            onClick={() => void onLoadMoreThreads()}
          >
            {loadingMore ? 'Loading' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function AgentComposerActionLayer({
  pendingServerRequests,
  onResolveServerRequest,
}: {
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  onResolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
}) {
  const [page, setPage] = useState(0)
  const pageCount = pendingServerRequests.length
  const safePage = clampPage(page, pageCount)
  const entry = pendingServerRequests[safePage]

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  if (!entry) return null
  const previousPage = Math.max(0, safePage - 1)
  const nextPage = Math.min(pageCount - 1, safePage + 1)
  return (
    <div
      className="ms-agent-chat-action-layer"
      data-testid="agent-composer-action-layer"
      aria-live="polite"
    >
      <div className="ms-agent-chat-action-layer__surface">
        {pageCount > 1 ? (
          <div className="ms-agent-chat-action-layer__pager">
            <button
              type="button"
              className="ms-agent-run-interaction-pager__button"
              disabled={safePage <= 0}
              onClick={() => setPage(previousPage)}
              aria-label="Previous tool request"
              title="Previous tool request"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="ms-agent-run-interaction-pager__count">{safePage + 1}/{pageCount}</span>
            <button
              type="button"
              className="ms-agent-run-interaction-pager__button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(nextPage)}
              aria-label="Next tool request"
              title="Next tool request"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        ) : null}
        <AgentChatServerRequestCard
          key={agentChatPendingServerRequestEntryKey(entry)}
          request={entry.request}
          onApprove={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approve' }))}
          onApproveForSession={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveForSession' }))}
          onApproveWithExecPolicyAmendment={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveWithExecPolicyAmendment' }))}
          onApproveWithNetworkPolicyAmendment={(amendmentIndex) => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveWithNetworkPolicyAmendment', amendmentIndex }))}
          onApproveWithStrictAutoReview={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'approveWithStrictAutoReview' }))}
          onAnswer={(response) => onResolveServerRequest(entry.request, response)}
          onCancel={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'cancel' }))}
          onReject={() => onResolveServerRequest(entry.request, agentChatServerRequestResponseForAction(entry.request, { type: 'reject' }))}
        />
      </div>
    </div>
  )
}

function clampPage(page: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  if (!Number.isFinite(page)) return 0
  return Math.min(Math.max(0, Math.floor(page)), itemCount - 1)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function workspaceContextFromNewConversationPayload(
  payload: AgentPanelNewConversationPayload | undefined,
): MovScriptWorkspaceContext | undefined {
  if (payload?.workspaceContext) return payload.workspaceContext
  const projectId = positiveInteger(payload?.projectId)
  return projectId === undefined ? undefined : {
    scope: 'project',
    projectId,
  }
}

function agentRunProfilePresetIdFromExecutionSettings(settings: AgentThreadExecutionSettings | undefined): AgentRunProfilePresetId | undefined {
  const permissions = stringValue(settings?.permissions)
  if (!permissions) return undefined
  const approvalPolicy = stringValue(settings?.approvalPolicy)
  const approvalsReviewer = stringValue(settings?.approvalsReviewer)
  const exactPreset = AGENT_RUN_PROFILE_PRESETS.find((preset) => (
    preset.permissionProfileId === permissions
    && (!approvalPolicy || preset.approvalPolicy === approvalPolicy)
    && (!approvalsReviewer || preset.approvalsReviewer === approvalsReviewer)
  ))
  return exactPreset?.id ?? AGENT_RUN_PROFILE_PRESETS.find((preset) => preset.permissionProfileId === permissions)?.id
}

function agentThreadNeedsRunProfileSettingsSync(thread: AgentChatThread, runProfile: AgentRunProfileSelection): boolean {
  const settings = thread.executionSettings
  return stringValue(settings?.permissions) !== runProfile.permissionProfileId
    || stringValue(settings?.approvalPolicy) !== runProfile.approvalPolicy
    || stringValue(settings?.approvalsReviewer) !== runProfile.approvalsReviewer
}

function isUnavailableThreadReadError(error: unknown): boolean {
  const message = errorMessage(error)
  return /\bthread not found:/i.test(message)
    || /\bthread not loaded:/i.test(message)
    || /\bno rollout found for thread id\b/i.test(message)
}

function mergeAgentChatThreadListPage(current: AgentChatThread[], page: AgentChatThread[]): AgentChatThread[] {
  const existingIds = new Set(current.map((thread) => thread.id))
  return [
    ...current,
    ...page.filter((thread) => !existingIds.has(thread.id)),
  ].sort((left, right) => right.updatedAt - left.updatedAt)
}

function agentChatThreadFromRegistryRecord(record: AgentConversationRegistryRecord, dataSource: AgentChatDataSource): AgentChatThread {
  const threadId = record.providerThreadId.trim()
  const title = record.title?.trim()
  return {
    provider: dataSource.provider,
    ...(threadId ? { providerThreadId: threadId } : {}),
    ...(record.providerSessionId?.trim() ? { providerSessionTreeId: record.providerSessionId.trim(), sessionId: record.providerSessionId.trim() } : {}),
    id: threadId,
    preview: title || 'Loading thread...',
    name: title || null,
    createdAt: millisecondsToUnixSeconds(record.createdAt),
    updatedAt: millisecondsToUnixSeconds(record.updatedAt),
    status: agentChatThreadStatusFromRegistryStatus(record.status),
    ...(record.providerThreadCwd?.trim() ? { cwd: record.providerThreadCwd.trim() } : {}),
    turns: [],
  }
}

function agentChatThreadStatusFromRegistryStatus(status: string | undefined): AgentChatThread['status'] {
  if (status === 'idle' || status === 'running' || status === 'requires_action' || status === 'failed' || status === 'completed' || status === 'cancelled' || status === 'unknown') {
    return status
  }
  return 'notLoaded'
}

function millisecondsToUnixSeconds(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value / 1000) : Math.floor(Date.now() / 1000)
}

function provisionalAgentChatThread(threadId: string, dataSource: AgentChatDataSource, title?: string): AgentChatThread {
  const now = Math.floor(Date.now() / 1000)
  const normalizedTitle = title?.trim()
  return {
    provider: dataSource.provider,
    ...(dataSource.providerId ? { providerThreadId: threadId } : {}),
    ...(dataSource.providerInstanceId ? { providerSessionTreeId: dataSource.providerInstanceId } : {}),
    id: threadId,
    preview: normalizedTitle || 'Loading thread...',
    name: normalizedTitle || null,
    createdAt: now,
    updatedAt: now,
    status: 'notLoaded',
    turns: [],
  }
}

function notifyAgentChatDataSourceActiveThread(input: {
  eventName: string
  sourceId: string
  threadId: string | null
}): void {
  if (typeof window === 'undefined') return
  const threadId = input.threadId?.trim()
  if (!threadId) return
  window.dispatchEvent(new CustomEvent(input.eventName, {
    detail: {
      threadId,
      sourceId: input.sourceId,
    },
  }))
}

function formatAgentChatTime(value: number | undefined): string {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

function agentChatThreadProviderSessionState(thread: AgentChatThread): 'stopped' | 'waiting' | 'active' | 'error' {
  if (thread.status === 'running') return 'active'
  if (thread.status === 'failed') return 'error'
  return 'stopped'
}

function debugAgentChatShellLoad(label: string, payload: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined' || window.localStorage?.getItem('movscript.debugAgentChatShell') !== '1') return
  } catch {
    return
  }
  console.debug(`[agent-chat-shell ${label}]`, payload)
}
