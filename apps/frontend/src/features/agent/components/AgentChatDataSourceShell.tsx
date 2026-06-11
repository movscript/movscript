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
  AGENT_PANEL_NEW_CONVERSATION_EVENT,
  AGENT_PANEL_THREAD_EVENT,
  consumeAgentPanelWorkspace,
  consumeAgentPanelNewConversation,
  consumeAgentPanelThread,
  notifyAgentPanelRunSettled,
  type AgentPanelThreadPayload,
  type AgentPanelWorkspacePayload,
  type AgentPanelNewConversationPayload,
} from '@/features/agent/application/agentPanelBridge'
import {
  AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT,
  closedAgentConversationIds,
  readAgentConversationOpenState,
  setAgentConversationOpen,
  writeAgentActiveConversationId,
  writeAgentConversationOpenState,
  type AgentConversationOpenRecord,
} from '@/features/agent/presentation/agentConversationOpenOrder'
import {
  agentChatInputsFromTextAndAttachments,
  buildAgentChatRuntimeThreadReadInput,
  legacySessionIdFromAgentChatThread,
  agentChatServerRequestResponseForAction,
  type AgentChatDataSource,
  type AgentChatCollaborationMode,
  type AgentChatModelSelection,
  type AgentChatNotification,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type AgentChatThread,
  type AgentChatThreadReadInput,
  type AgentChatThreadItem,
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
import {
  readStoredActiveThreadId,
  writeStoredActiveThreadId,
} from '@/features/agent/presentation/agentActiveThreadStorage'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import { api } from '@/shared/infrastructure/api'
import type { PublicModel, RawResource } from '@/types'

const AGENT_CHAT_OLDER_ITEMS_SCROLL_THRESHOLD_PX = 96
const AGENT_CHAT_THREAD_LIST_PAGE_SIZE = 20
const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest[]>()

function persistentServerRequestScopeKey(activeThreadStorageKey: string): string {
  return activeThreadStorageKey
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
  activeThreadStorageKey: string
  readActiveThreadId?: () => string | null
  openThreadEventName: string
  providerLabel: string
  threadListLabel: string
  emptyThreadListLabel: string
  emptyThreadLabel: string
  unavailableLabel: string
  composerPlaceholder: string
  newThreadLabel: string
  resolveModelForRequest?: () => AgentChatModelSelection
  modelOptions?: PublicModel[]
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

export function AgentChatDataSourceShell({
  userId,
  loadDataSource,
  loadDataSourceForNewThread,
  activeThreadStorageKey,
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
  const readCurrentActiveThreadId = useCallback(
    () => readActiveThreadId?.() ?? readStoredActiveThreadId(activeThreadStorageKey),
    [activeThreadStorageKey, readActiveThreadId],
  )
  const [dataSource, setDataSource] = useState<AgentChatDataSource | undefined>()
  const [endpoint, setEndpoint] = useState<string | undefined>()
  const [runtime, dispatchRuntime] = useReducer(
    agentChatRuntimeReducer,
    undefined,
    () => createAgentChatRuntimeState(readCurrentActiveThreadId()),
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
  const [threadModelOverrides, setThreadModelOverrides] = useState<Record<string, string>>({})
  const [conversationOpenState, setConversationOpenState] = useState<AgentConversationOpenRecord[]>(() => readAgentConversationOpenState(userId))
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
  const [stoppingTurn, setStoppingTurn] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [threadListNextCursor, setThreadListNextCursor] = useState<string | null>(null)
  const [threadListLoadingMore, setThreadListLoadingMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const olderItemsScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const suppressNextAutoScrollRef = useRef(false)
  const [visibleThreadItemCount, setVisibleThreadItemCount] = useState(AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE)
  const composerConversationId = agentChatComposerConversationId(activeThreadStorageKey, activeThreadId)
  const composerWorkspace = useAgentSessionStore((state) => state.getConversationWorkspace(userId, composerConversationId))
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((response) => response.data),
  })

  useEffect(() => {
    setConversationOpenState(readAgentConversationOpenState(userId))
  }, [userId])

  useEffect(() => {
    function handleOpenStateChanged(event: Event) {
      const detailUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId
      if (detailUserId !== undefined && detailUserId !== userId) return
      setConversationOpenState(readAgentConversationOpenState(userId))
    }
    window.addEventListener(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, handleOpenStateChanged)
    window.addEventListener('storage', handleOpenStateChanged)
    return () => {
      window.removeEventListener(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, handleOpenStateChanged)
      window.removeEventListener('storage', handleOpenStateChanged)
    }
  }, [userId])
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])
  const composer = useAgentComposerController({
    userId,
    conversationId: composerConversationId,
    workspace: composerWorkspace,
    recentResources,
    fileRef: composerFileRef,
    inputRef: composerInputRef,
  })

  const setActiveThreadIdValue = useCallback((threadId: string | null) => {
    activeThreadIdRef.current = threadId
    dispatchRuntime({ type: 'setActiveThreadId', threadId })
  }, [])
  const persistentRequestScopeKey = persistentServerRequestScopeKey(activeThreadStorageKey)
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
    writeStoredActiveThreadId(activeThreadStorageKey, activeThreadId)
    notifyAgentChatDataSourceActiveThread({
      eventName: openThreadEventName,
      sourceId: shellInstanceIdRef.current,
      threadId: activeThreadId,
    })
  }, [activeThreadId, activeThreadStorageKey, openThreadEventName])

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
    setStoppingTurn(false)
    setThreadListNextCursor(null)
    setThreadListLoadingMore(false)
    const storedThreadId = readCurrentActiveThreadId()
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
  }, [activeThreadStorageKey, readCurrentActiveThreadId])

  const upsertThread = useCallback((thread: AgentChatThread) => {
    dispatchRuntime({ type: 'upsertThread', thread })
  }, [])

  const upsertThreadReadResult = useCallback((thread: AgentChatThread, input: AgentChatThreadReadInput) => {
    dispatchRuntime({ type: 'upsertThreadReadResult', thread, input })
  }, [])

  const closedThreadIds = useMemo(() => new Set(closedAgentConversationIds(conversationOpenState)), [conversationOpenState])

  const markThreadOpen = useCallback((threadId: string) => {
    const next = setAgentConversationOpen(readAgentConversationOpenState(userId), [threadId], true)
    writeAgentConversationOpenState(userId, next)
    writeAgentActiveConversationId(userId, threadId)
  }, [userId])

  const markThreadClosed = useCallback((threadId: string, clearActive: boolean) => {
    const next = setAgentConversationOpen(readAgentConversationOpenState(userId), [threadId], false)
    writeAgentConversationOpenState(userId, next)
    if (clearActive) writeAgentActiveConversationId(userId, null)
  }, [userId])

  const clearUnavailableActiveThread = useCallback((threadId: string) => {
    if (activeThreadIdRef.current === threadId) setActiveThreadIdValue(null)
    if (readStoredActiveThreadId(activeThreadStorageKey) === threadId) {
      writeStoredActiveThreadId(activeThreadStorageKey, null)
    }
    markThreadClosed(threadId, true)
  }, [activeThreadStorageKey, markThreadClosed, setActiveThreadIdValue])

  const readHistoryThread = useCallback(async (threadId: string) => {
    if (!dataSource) throw new Error('Agent data source is not available')
    const input = buildAgentChatRuntimeThreadReadInput(runtimeRef.current, threadId)
    const thread = await dataSource.readThread(threadId, input)
    return { thread, input }
  }, [dataSource])

  const loadThreads = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      const response = await dataSource.listThreads({ limit: AGENT_CHAT_THREAD_LIST_PAGE_SIZE })
      setThreadListNextCursor(response.nextCursor ?? null)
      const nextThreads = response.threads
      const stored = readCurrentActiveThreadId()
      const nextThreadsWithStored = stored && !nextThreads.some((thread) => thread.id === stored)
        ? [provisionalAgentChatThread(stored, dataSource), ...nextThreads]
        : nextThreads
      dispatchRuntime({ type: 'setThreads', threads: nextThreadsWithStored })
      const candidateIds = uniqueAgentChatThreadIds([
        stored,
        ...nextThreads.filter((thread) => !closedThreadIds.has(thread.id)).map((thread) => thread.id),
      ])
      let lastMissingThreadError: unknown
      for (const candidateId of candidateIds) {
        setActiveThreadIdValue(candidateId)
        writeStoredActiveThreadId(activeThreadStorageKey, candidateId)
        try {
          const { thread, input } = await readHistoryThread(candidateId)
          upsertThreadReadResult(thread, input)
          return
        } catch (readError) {
          if (!isUnavailableThreadReadError(readError)) throw readError
          lastMissingThreadError = readError
          if (candidateId === stored) {
            setError(errorMessage(readError))
            return
          }
          clearUnavailableActiveThread(candidateId)
        }
      }
      if (!stored) {
        setActiveThreadIdValue(null)
        writeStoredActiveThreadId(activeThreadStorageKey, null)
      }
      if (lastMissingThreadError) setError(errorMessage(lastMissingThreadError))
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [activeThreadStorageKey, clearUnavailableActiveThread, closedThreadIds, dataSource, readCurrentActiveThreadId, readHistoryThread, setActiveThreadIdValue, upsertThreadReadResult])

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
      dispatchRuntime({
        type: 'updateThreads',
        update: (current) => mergeAgentChatThreadListPage(current, response.threads),
      })
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setThreadListLoadingMore(false)
    }
  }, [dataSource, threadListLoadingMore, threadListNextCursor])

  const restoreStoredThread = useCallback(async () => {
    if (!dataSource) return
    const stored = readCurrentActiveThreadId()
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
      upsertThreadReadResult(thread, input)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [dataSource, readCurrentActiveThreadId, readHistoryThread, setActiveThreadIdValue, upsertThreadReadResult])

  useEffect(() => {
    loadThreadsRef.current = loadThreads
  }, [loadThreads])

  useEffect(() => {
    restoreStoredThreadRef.current = restoreStoredThread
  }, [restoreStoredThread])

  const openThread = useCallback(async (threadId: string) => {
    if (!dataSource) return
    setActiveThreadIdValue(threadId)
    writeStoredActiveThreadId(activeThreadStorageKey, threadId)
    markThreadOpen(threadId)
    setError(null)
    try {
      const { thread, input } = await readHistoryThread(threadId)
      upsertThreadReadResult(thread, input)
      setHistoryOpen(false)
    } catch (nextError) {
      if (isUnavailableThreadReadError(nextError)) {
        clearUnavailableActiveThread(threadId)
        dispatchRuntime({ type: 'removeThread', threadId })
      }
      setError(errorMessage(nextError))
    }
  }, [activeThreadStorageKey, clearUnavailableActiveThread, dataSource, markThreadOpen, readHistoryThread, setActiveThreadIdValue, upsertThreadReadResult])

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

  const startThread = useCallback(async (input: AgentPanelNewConversationPayload & { runProfile?: AgentRunProfileSelection } = {}) => {
    if (!dataSource) return null
    setError(null)
    try {
      let nextDataSource = dataSource
      if (input.workspaceContext && loadDataSourceForNewThread) {
        const result = await loadDataSourceForNewThread(input)
        if (result.dataSource) {
          nextDataSource = result.dataSource
          setDataSource(result.dataSource)
          setEndpoint(result.endpoint)
        }
      }
      const { workspaceContext: _workspaceContext, ...threadInput } = input
      const thread = await nextDataSource.startThread({
        ...threadInput,
        ...(collaborationMode === 'plan' ? { collaborationMode } : {}),
        ...(goalModeEnabled ? { goalModeEnabled } : {}),
        ...selectedModelSelectionForRequest(),
      })
      upsertThread(thread)
      setActiveThreadIdValue(thread.id)
      writeStoredActiveThreadId(activeThreadStorageKey, thread.id)
      markThreadOpen(thread.id)
      setHistoryOpen(false)
      return thread
    } catch (nextError) {
      setError(errorMessage(nextError))
      return null
    }
  }, [activeThreadStorageKey, collaborationMode, dataSource, goalModeEnabled, loadDataSourceForNewThread, markThreadOpen, selectedModelSelectionForRequest, setActiveThreadIdValue, upsertThread])

  const startWorkspaceTask = useCallback(async (payload: AgentPanelWorkspacePayload) => {
    if (!dataSource) return
    const normalizedTitle = payload.title?.trim()
    const thread = await startThread({
      ...(normalizedTitle ? { title: normalizedTitle } : {}),
      ...(typeof payload.projectId === 'number' ? { projectId: payload.projectId } : {}),
    })
    if (!thread) return
    const threadSessionId = legacySessionIdFromAgentChatThread(thread)
    try {
      const turn = payload.autoSend && payload.message.trim()
        ? await dataSource.startTextTurn({
            threadId: thread.id,
            text: payload.message,
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
  }, [dataSource, selectedModelSelectionForRequest, startThread])

  const handleServerRequest = useCallback((request: AgentChatServerRequest) => {
    if (request.method === 'attestation/generate') {
      return agentChatServerRequestResponseForAction(request, { type: 'reject' })
    }
    const requestThreadId = agentChatThreadIdForServerRequest(activeThreadIdRef.current, request)
    if (requestThreadId) {
      setActiveThreadIdValue(requestThreadId)
      writeStoredActiveThreadId(activeThreadStorageKey, requestThreadId)
      markThreadOpen(requestThreadId)
    }
    return new Promise<AgentChatServerRequestResponse | undefined>((resolve) => {
      const persistentResolve = storePersistentServerRequest(persistentRequestScopeKey, request, resolve)
      dispatchRuntime({ type: 'enqueueServerRequest', request, resolve: persistentResolve })
    })
  }, [activeThreadStorageKey, markThreadOpen, persistentRequestScopeKey, setActiveThreadIdValue])

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
      void startThread({
        ...(payload?.title?.trim() ? { title: payload.title.trim() } : {}),
        ...(typeof payload?.projectId === 'number' ? { projectId: payload.projectId } : {}),
        ...(payload?.workspaceContext ? { workspaceContext: payload.workspaceContext } : {}),
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
  }, [dataSource, startThread])

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
      activeThreadStorageKey,
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
      dispatchRuntime({ type: 'beginThreadResumeRequest', requestId: request.id })
      const thread = runtimeRef.current.threads.find((item) => item.id === request.threadId)
      void dataSource.resumeThread({
        threadId: request.threadId,
        ...(thread?.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
        ...(collaborationMode === 'plan' ? { collaborationMode } : {}),
        ...(goalModeEnabled ? { goalModeEnabled } : {}),
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
    }
  }, [collaborationMode, dataSource, goalModeEnabled, pendingThreadResumeRequests, selectedModelSelectionForRequest])

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
    historyThreads,
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

  const canSteerActiveTurn = Boolean(activeTurn && dataSource?.steerTurn)
  const canSend = Boolean(
    dataSource
    && (composer.input.trim() || composer.composerAttachments.length > 0)
    && !sending
    && !composer.uploading
    && (!activeTurn || canSteerActiveTurn),
  )
  const canStopActiveTurn = Boolean(activeTurn && dataSource?.interruptTurn && !stoppingTurn)
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  const shellClassName = surface === 'page'
    ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell'
    : 'ai-agent-panel-shell'
  const sendMessage = useCallback(async (profilePresetId: AgentRunProfilePresetId = DEFAULT_AGENT_RUN_PROFILE_PRESET_ID) => {
    if (!dataSource || sending) return
    const runProfile = agentRunProfilePresetById(profilePresetId)
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
    setSending(true)
    setError(null)
    try {
      const selectedWorkspaceProjectId = typeof composer.selectedWorkspaceContext.projectId === 'number'
        ? composer.selectedWorkspaceContext.projectId
        : undefined
      let thread = activeThread
      if (thread?.status === 'notLoaded') {
        thread = await ensureAgentChatThreadReadyForTurn({
          dataSource,
          thread,
          runProfile,
          controls: {
            ...(collaborationMode === 'plan' ? { collaborationMode } : {}),
            ...(goalModeEnabled ? { goalModeEnabled } : {}),
          },
          modelSelection: selectedModelSelectionForRequest(thread),
        })
        upsertThread(thread)
      }
      thread ??= await startThread({
        runProfile,
        workspaceContext: composer.selectedWorkspaceContext,
        ...(selectedWorkspaceProjectId !== undefined ? { projectId: selectedWorkspaceProjectId } : {}),
      })
      if (!thread) return
      if (goalModeEnabled && dataSource.setThreadGoal && !activeTurn) {
        await dataSource.setThreadGoal({
          threadId: thread.id,
          objective: text || composer.composerAttachments.map((attachment) => attachment.name).filter(Boolean).join(', ') || composerPlaceholder,
          status: 'active',
        })
      }
      restoreConversationId = agentChatComposerConversationId(activeThreadStorageKey, thread.id)
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, { input: '', attachments: [] })
      composer.updateWorkspace({ input: '', attachments: [] })
      clearAgentChatComposerEditor(composerInputRef.current)
      const clientUserMessageId = `agent_user_${Date.now()}`
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
      if (activeTurn && dataSource.steerTurn) {
        await dataSource.steerTurn({
          threadId: thread.id,
          turnId: activeTurn.id,
          clientUserMessageId,
          inputs,
        })
      } else if (dataSource.startTurn) {
        await dataSource.startTurn({
          threadId: thread.id,
          clientUserMessageId,
          inputs,
          runProfile,
          ...(collaborationMode === 'plan' ? { collaborationMode } : {}),
          ...(goalModeEnabled ? { goalModeEnabled } : {}),
          ...selectedModelSelectionForRequest(thread),
        })
      } else {
        await dataSource.startTextTurn({
          threadId: thread.id,
          clientUserMessageId,
          text,
          runProfile,
          ...(collaborationMode === 'plan' ? { collaborationMode } : {}),
          ...(goalModeEnabled ? { goalModeEnabled } : {}),
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
  }, [activeThread, activeThreadStorageKey, activeTurn, collaborationMode, composer, composerConversationId, composerPlaceholder, dataSource, goalModeEnabled, selectedModelSelectionForRequest, sending, startThread, userId])

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
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setStoppingTurn(false)
    }
  }, [activeThread, activeTurn, dataSource, providerLabel, stoppingTurn, upsertThreadReadResult])

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

  const closeThreadTab = useCallback(async (threadId: string) => {
    const thread = runtimeRef.current.threads.find((item) => item.id === threadId)
    if (thread && agentChatThreadIsRunning(thread)) {
      setError('Stop the running turn before closing this tab.')
      return
    }
    if (threadId === activeThreadId) {
      setActiveThreadIdValue(null)
      writeStoredActiveThreadId(activeThreadStorageKey, null)
    }
    markThreadClosed(threadId, threadId === activeThreadId)
  }, [activeThreadId, activeThreadStorageKey, markThreadClosed, setActiveThreadIdValue])

  const threadTabs = useMemo(() => threads
    .filter((thread) => !closedThreadIds.has(thread.id))
    .map((thread) => ({
      id: thread.id,
      title: thread.name || thread.preview || 'Untitled thread',
      messageCount: thread.turns.reduce((count, turn) => count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length, 0),
      sessionState: agentChatThreadProviderSessionState(thread),
      ...(dataSource?.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
    })), [closedThreadIds, dataSource?.renameThread, renameThread, threads])
  const closedHistoryThreads = useMemo(() => {
    const closedIds = closedThreadIds
    return historyThreads.filter((thread) => closedIds.has(thread.id))
  }, [closedThreadIds, historyThreads])
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
      <AgentMain className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'} data-agent-chat-host={resolvedHost}>
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
                          onNewConversation={() => void startThread()}
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
                      onReorderConversation={() => undefined}
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
                emptyThreadLabel={emptyThreadLabel}
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
              {!hasChatContent ? (
                <div className="agent-page-chat-empty">
                  <h1 className="agent-page-chat-empty-title">{emptyThreadLabel}</h1>
                </div>
              ) : (
                <div className="agent-page-chat-thread">
                  <AgentChatDataSourceThreadBody
                    emptyThreadLabel={emptyThreadLabel}
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
          <div className={surface === 'page' ? 'agent-page-chat-composer relative z-30' : 'relative z-30'}>
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
              chrome={surface === 'page' ? 'flush' : 'bottom-bar'}
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
              pendingActiveRunInputQueue={[]}
              stoppingActiveRun={stoppingTurn}
              uploadedFileCount={composer.uploadedFileCount}
              uploading={composer.uploading}
              uploadingFileNames={composer.uploadingFileNames}
              workspaceProjectOptions={composer.workspaceProjectOptions}
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
              onRemoveAttachment={composer.removeAttachment}
              onSend={(profilePresetId) => void sendMessage(profilePresetId)}
              onStopActiveRun={() => void stopActiveTurn()}
              onUploadFiles={(files) => void composer.uploadFiles(files)}
              onWorkspaceProjectChange={composer.changeWorkspaceProject}
              showApprovalPresetSelector={!activeTurn}
              showAttachmentTools
              showDebugPreview={false}
              showMentionTools
            />
          </div>
          {surface === 'panel' && historyOpen && showThreadList ? (
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
              onLoadThreads={loadThreads}
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

function agentChatComposerConversationId(activeThreadStorageKey: string, threadId: string | null): string {
  return `${activeThreadStorageKey}:${threadId ?? 'draft'}`
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
  emptyThreadLabel: string
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
          {!visibleItems.length ? (
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

function isUnavailableThreadReadError(error: unknown): boolean {
  const message = errorMessage(error)
  return /\bthread not found:/i.test(message)
    || /\bthread not loaded:/i.test(message)
    || /\bno rollout found for thread id\b/i.test(message)
}

function uniqueAgentChatThreadIds(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const value of values) {
    const id = value?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function mergeAgentChatThreadListPage(current: AgentChatThread[], page: AgentChatThread[]): AgentChatThread[] {
  const existingIds = new Set(current.map((thread) => thread.id))
  return [
    ...current,
    ...page.filter((thread) => !existingIds.has(thread.id)),
  ].sort((left, right) => right.updatedAt - left.updatedAt)
}

function provisionalAgentChatThread(threadId: string, dataSource: AgentChatDataSource): AgentChatThread {
  const now = Math.floor(Date.now() / 1000)
  return {
    provider: dataSource.provider,
    ...(dataSource.providerId ? { providerThreadId: threadId } : {}),
    ...(dataSource.providerInstanceId ? { providerSessionTreeId: dataSource.providerInstanceId } : {}),
    id: threadId,
    preview: 'Loading thread...',
    name: null,
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
