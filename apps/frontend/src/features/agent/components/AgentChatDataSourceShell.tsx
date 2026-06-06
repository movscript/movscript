import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  AgentBody,
  AgentConversationListPanel,
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
import { AgentChatServerRequestCard } from '@/features/agent/components/agent-chat-items/AgentChatServerRequestCard'
import { AgentChatThreadItemView } from '@/features/agent/components/agent-chat-items/AgentChatThreadItemView'
import { agentChatRecentCapabilityEventEntryId } from '@/features/agent/domain/agentChatRecentCapabilityEvents'
import {
  type AgentChatPendingServerRequestQueueEntry,
  agentChatPendingServerRequestEntryKey,
  agentChatThreadIdForServerRequest,
  removeAgentChatPendingServerRequests,
  resolveAgentChatPendingServerRequest,
  upsertAgentChatPendingServerRequest,
  visibleAgentChatPendingServerRequests,
} from '@/features/agent/domain/agentChatPendingServerRequests'
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
  readAgentConversationOpenState,
  removeAgentConversationOpenRecords,
  setAgentConversationOpen,
  writeAgentActiveConversationId,
  writeAgentConversationOpenState,
} from '@/features/agent/presentation/agentConversationOpenOrder'
import {
  agentChatInputsFromTextAndAttachments,
  type AgentChatDataSource,
  type AgentChatModelSelection,
  type AgentChatNotification,
  type AgentChatNotificationEvent,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type AgentChatThread,
  type AgentChatThreadItem,
  type AgentChatTurn,
} from '@/features/agent/domain/agentChatProtocol'
import {
  agentChatServerRequestResponseForAction,
} from '@/features/agent/domain/agentChatServerRequests'
import {
  agentChatNotificationEventShouldDisplayAsRecent,
  buildAgentChatVisibleItems,
  dispatchAgentChatNotification,
  type AgentChatPendingServerRequestEntry,
  type AgentChatPendingUserItem,
  type AgentChatRealtimeAudioItem,
  type AgentChatRealtimeTranscriptItem,
  type AgentChatStreamingAgentItem,
} from '@/features/agent/domain/agentChatNotificationDispatcher'
import { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import { useAgentMentionEditorSync } from '@/features/agent/presentation/useAgentMentionEditorSync'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'

type PendingServerRequest = AgentChatPendingServerRequestEntry & AgentChatPendingServerRequestQueueEntry

type RecentCapabilityEvent = {
  id: string
  event: AgentChatNotificationEvent
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
  openThreadEventName: string
  providerLabel: string
  threadListLabel: string
  emptyThreadListLabel: string
  emptyThreadLabel: string
  unavailableLabel: string
  composerPlaceholder: string
  newThreadLabel: string
  resolveModelForRequest?: () => AgentChatModelSelection
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showThreadList?: boolean
  showCollapse?: boolean
  onCollapse?: () => void
}

export function AgentChatDataSourceShell({
  userId,
  loadDataSource,
  loadDataSourceForNewThread,
  activeThreadStorageKey,
  openThreadEventName,
  providerLabel,
  threadListLabel,
  emptyThreadListLabel,
  emptyThreadLabel,
  unavailableLabel,
  composerPlaceholder,
  newThreadLabel,
  resolveModelForRequest = () => ({}),
  host,
  surface = 'panel',
  showThreadList = surface !== 'page',
  showCollapse = false,
  onCollapse = () => undefined,
}: AgentChatDataSourceShellProps) {
  const [dataSource, setDataSource] = useState<AgentChatDataSource | undefined>()
  const [endpoint, setEndpoint] = useState<string | undefined>()
  const [threads, setThreads] = useState<AgentChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState(() => readStoredActiveThreadId(activeThreadStorageKey))
  const [pendingUserItems, setPendingUserItems] = useState<AgentChatPendingUserItem[]>([])
  const [pendingServerRequests, setPendingServerRequests] = useState<PendingServerRequest[]>([])
  const [recentCapabilityEvents, setRecentCapabilityEvents] = useState<RecentCapabilityEvent[]>([])
  const [streamingAgentItems, setStreamingAgentItems] = useState<Record<string, AgentChatStreamingAgentItem>>({})
  const [realtimeTranscriptItems, setRealtimeTranscriptItems] = useState<Record<string, AgentChatRealtimeTranscriptItem>>({})
  const [realtimeAudioItems, setRealtimeAudioItems] = useState<Record<string, AgentChatRealtimeAudioItem>>({})
  const streamingAgentItemsRef = useRef<Record<string, AgentChatStreamingAgentItem>>({})
  const recentCapabilityEventSequenceRef = useRef(0)
  const activeThreadIdRef = useRef(activeThreadId)
  const composerInputRef = useRef<HTMLDivElement | null>(null)
  const composerFileRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [stoppingTurn, setStoppingTurn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const composerConversationId = agentChatComposerConversationId(activeThreadStorageKey, activeThreadId)
  const composerWorkspace = useAgentSessionStore((state) => state.getConversationWorkspace(userId, composerConversationId))
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
    fileRef: composerFileRef,
    inputRef: composerInputRef,
  })

  const setActiveThreadIdValue = useCallback((threadId: string | null) => {
    activeThreadIdRef.current = threadId
    setActiveThreadId(threadId)
  }, [])

  const updateStreamingAgentItems = useCallback((updater: (current: Record<string, AgentChatStreamingAgentItem>) => Record<string, AgentChatStreamingAgentItem>) => {
    const next = updater(streamingAgentItemsRef.current)
    streamingAgentItemsRef.current = next
    setStreamingAgentItems(next)
  }, [])

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
    setThreads([])
    setPendingUserItems([])
    setPendingServerRequests((current) => removeAgentChatPendingServerRequests(current, () => true))
    setRecentCapabilityEvents([])
    updateStreamingAgentItems(() => ({}))
    setRealtimeTranscriptItems({})
    setRealtimeAudioItems({})
    recentCapabilityEventSequenceRef.current = 0
    setSending(false)
    setStoppingTurn(false)
    setActiveThreadIdValue(readStoredActiveThreadId(activeThreadStorageKey))
    void loadDataSource()
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
  }, [activeThreadStorageKey, loadDataSource, setActiveThreadIdValue, updateStreamingAgentItems])

  const upsertThread = useCallback((thread: AgentChatThread) => {
    setThreads((current) => {
      const without = current.filter((item) => item.id !== thread.id)
      return [thread, ...without].sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }, [])

  const markThreadOpen = useCallback((threadId: string) => {
    const next = setAgentConversationOpen(readAgentConversationOpenState(userId), [threadId], true)
    writeAgentConversationOpenState(userId, next)
    writeAgentActiveConversationId(userId, threadId)
  }, [userId])

  const markThreadClosed = useCallback((threadId: string, clearActive: boolean) => {
    const next = removeAgentConversationOpenRecords(readAgentConversationOpenState(userId), [threadId])
    writeAgentConversationOpenState(userId, next)
    if (clearActive) writeAgentActiveConversationId(userId, null)
  }, [userId])

  const loadThreads = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      const response = await dataSource.listThreads({ limit: 50 })
      const nextThreads = response.threads
      setThreads(nextThreads)
      const stored = readStoredActiveThreadId(activeThreadStorageKey)
      const nextActive = nextThreads.find((thread) => thread.id === stored)?.id
        ?? nextThreads[0]?.id
        ?? null
      setActiveThreadIdValue(nextActive)
      writeStoredActiveThreadId(activeThreadStorageKey, nextActive)
      if (nextActive) {
        const thread = await dataSource.readThread(nextActive, { includeTurns: true })
        upsertThread(thread)
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [activeThreadStorageKey, dataSource, setActiveThreadIdValue, upsertThread])

  const openThread = useCallback(async (threadId: string) => {
    if (!dataSource) return
    setActiveThreadIdValue(threadId)
    writeStoredActiveThreadId(activeThreadStorageKey, threadId)
    markThreadOpen(threadId)
    setError(null)
    try {
      const response = await dataSource.readThread(threadId, { includeTurns: true })
      upsertThread(response)
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadStorageKey, dataSource, markThreadOpen, setActiveThreadIdValue, upsertThread])

  useEffect(() => {
    function handleOpenThread(event: Event) {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId?.trim()
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
        ...resolveModelForRequest(),
      })
      upsertThread(thread)
      setActiveThreadIdValue(thread.id)
      writeStoredActiveThreadId(activeThreadStorageKey, thread.id)
      markThreadOpen(thread.id)
      return thread
    } catch (nextError) {
      setError(errorMessage(nextError))
      return null
    }
  }, [activeThreadStorageKey, dataSource, loadDataSourceForNewThread, markThreadOpen, resolveModelForRequest, setActiveThreadIdValue, upsertThread])

  const startWorkspaceTask = useCallback(async (payload: AgentPanelWorkspacePayload) => {
    if (!dataSource) return
    const normalizedTitle = payload.title?.trim()
    const thread = await startThread({
      ...(normalizedTitle ? { title: normalizedTitle } : {}),
      ...(typeof payload.projectId === 'number' ? { projectId: payload.projectId } : {}),
    })
    if (!thread) return
    try {
      const turn = payload.autoSend && payload.message.trim()
        ? await dataSource.startTextTurn({
            threadId: thread.id,
            text: payload.message,
            ...resolveModelForRequest(),
          })
        : undefined
      if (payload.requestId) {
        notifyAgentPanelRunSettled({
          requestId: payload.requestId,
          status: 'completed',
          thread: {
            id: thread.id,
            sessionId: thread.sessionId,
          },
          ...(turn ? {
            run: {
              id: turn.id,
              threadId: thread.id,
              sessionId: thread.sessionId,
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
            sessionId: thread.sessionId,
          },
          error: errorMessage(nextError),
        })
      }
      throw nextError
    }
  }, [dataSource, resolveModelForRequest, startThread])

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
      setPendingServerRequests((current) => upsertAgentChatPendingServerRequest(current, request, resolve))
    })
  }, [activeThreadStorageKey, markThreadOpen, setActiveThreadIdValue])

  const handleNotification = useCallback((notification: AgentChatNotification) => {
    if (notification.event && agentChatNotificationEventShouldDisplayAsRecent(notification.event)) {
      const recentEventId = agentChatRecentCapabilityEventEntryId({
        method: notification.method,
        nowMs: Date.now(),
        sequence: ++recentCapabilityEventSequenceRef.current,
      })
      setRecentCapabilityEvents((current) => [
        { id: recentEventId, event: notification.event as AgentChatNotificationEvent },
        ...current,
      ].slice(0, 6))
    }
    dispatchAgentChatNotification(notification, {
      upsertThread,
      updateThreads: setThreads,
      activeThreadId,
      setActiveThreadId: (threadId) => {
        setActiveThreadIdValue(threadId)
        writeStoredActiveThreadId(activeThreadStorageKey, threadId)
      },
      updatePendingUserItems: setPendingUserItems,
      updatePendingServerRequests: setPendingServerRequests,
      updateStreamingAgentItems,
      readStreamingAgentItems: () => streamingAgentItemsRef.current,
      updateRealtimeTranscriptItems: setRealtimeTranscriptItems,
      updateRealtimeAudioItems: setRealtimeAudioItems,
      readThread: (threadId) => {
        void dataSource?.readThread(threadId, { includeTurns: true })
          .then((thread) => upsertThread(thread))
          .catch((nextError) => setError(errorMessage(nextError)))
      },
    })
  }, [activeThreadId, activeThreadStorageKey, dataSource, setActiveThreadIdValue, updateStreamingAgentItems, upsertThread])

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
    void loadThreads()
  }, [loadThreads])

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threads, pendingUserItems, streamingAgentItems, realtimeTranscriptItems, realtimeAudioItems, activeThreadId])

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null
  const activeTurn = useMemo(() => activeThread?.turns.find(agentChatTurnIsActive) ?? null, [activeThread])
  const visibleItems = useMemo(() => {
    if (!activeThread) return []
    return buildAgentChatVisibleItems(activeThread, pendingUserItems, streamingAgentItems, realtimeTranscriptItems, realtimeAudioItems)
  }, [activeThread, pendingUserItems, streamingAgentItems, realtimeTranscriptItems, realtimeAudioItems])
  const visiblePendingServerRequests = useMemo(() => (
    visibleAgentChatPendingServerRequests(pendingServerRequests, activeThreadId)
  ), [activeThreadId, pendingServerRequests])
  const hasComposerActionLayer = visiblePendingServerRequests.length > 0
  const hasThreadBodyContent = Boolean(
    visibleItems.length
    || recentCapabilityEvents.length
    || error,
  )
  const hasChatContent = hasThreadBodyContent || hasComposerActionLayer

  useEffect(() => {
    if (!dataSource || !activeThreadId || activeThread || visiblePendingServerRequests.length === 0) return
    void dataSource.readThread(activeThreadId, { includeTurns: true })
      .then((thread) => upsertThread(thread))
      .catch((nextError) => setError(errorMessage(nextError)))
  }, [activeThread, activeThreadId, dataSource, upsertThread, visiblePendingServerRequests.length])

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
    const text = composer.input.trim()
    const inputs = agentChatInputsFromTextAndAttachments(text, composer.composerAttachments)
    if (inputs.length === 0) return
    const previousWorkspace = {
      input: composer.input,
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
      const thread = activeThread ?? await startThread({
        runProfile,
        workspaceContext: composer.selectedWorkspaceContext,
        ...(selectedWorkspaceProjectId !== undefined ? { projectId: selectedWorkspaceProjectId } : {}),
      })
      if (!thread) return
      restoreConversationId = agentChatComposerConversationId(activeThreadStorageKey, thread.id)
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, { input: '', attachments: [] })
      if (restoreConversationId !== composerConversationId) composer.updateWorkspace({ input: '', attachments: [] })
      clearAgentChatComposerEditor(composerInputRef.current)
      const clientUserMessageId = `agent_user_${Date.now()}`
      setPendingUserItems((current) => [
        ...current,
        {
          threadId: thread.id,
          item: {
            type: 'userMessage',
            id: clientUserMessageId,
            clientId: clientUserMessageId,
            content: inputs,
          },
        },
      ])
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
          ...resolveModelForRequest(),
        })
      } else {
        await dataSource.startTextTurn({
          threadId: thread.id,
          clientUserMessageId,
          text,
          runProfile,
          ...resolveModelForRequest(),
        })
      }
    } catch (nextError) {
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, previousWorkspace)
      setError(errorMessage(nextError))
    } finally {
      setSending(false)
    }
  }, [activeThread, activeThreadStorageKey, activeTurn, composer, composerConversationId, dataSource, resolveModelForRequest, sending, startThread, userId])

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
      const thread = await dataSource.readThread(activeThread.id, { includeTurns: true })
      upsertThread(thread)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setStoppingTurn(false)
    }
  }, [activeThread, activeTurn, dataSource, providerLabel, stoppingTurn, upsertThread])

  const showThreadHistory = useCallback(() => {
    setActiveThreadIdValue(null)
    writeStoredActiveThreadId(activeThreadStorageKey, null)
  }, [activeThreadStorageKey, setActiveThreadIdValue])

  const resolveServerRequest = useCallback((request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => {
    setPendingServerRequests((current) => resolveAgentChatPendingServerRequest(current, request, response))
  }, [])

  const renameThread = useCallback(async (threadId: string, name: string) => {
    if (!dataSource?.renameThread) return
    setError(null)
    try {
      const response = await dataSource.renameThread({ threadId, name })
      if (isAgentChatThread(response)) upsertThread(response)
      else {
        setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Date.now() } : thread))
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [dataSource, upsertThread])

  const archiveThread = useCallback(async (threadId: string) => {
    if (!dataSource?.archiveThread) {
      if (threadId === activeThreadId) {
        setActiveThreadIdValue(null)
        writeStoredActiveThreadId(activeThreadStorageKey, null)
      }
      markThreadClosed(threadId, threadId === activeThreadId)
      return
    }
    setError(null)
    try {
      await dataSource.archiveThread({ threadId })
      setThreads((current) => current.filter((thread) => thread.id !== threadId))
      if (threadId === activeThreadId) {
        setActiveThreadIdValue(null)
        writeStoredActiveThreadId(activeThreadStorageKey, null)
      }
      markThreadClosed(threadId, threadId === activeThreadId)
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadId, activeThreadStorageKey, dataSource, markThreadClosed, setActiveThreadIdValue])

  const threadTabs = useMemo(() => threads.map((thread) => ({
    id: thread.id,
    title: thread.name || thread.preview || 'Untitled thread',
    messageCount: thread.turns.reduce((count, turn) => count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length, 0),
    sessionState: agentChatThreadProviderSessionState(thread),
    ...(dataSource?.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
  })), [dataSource?.renameThread, renameThread, threads])

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

  const listPanel = showThreadList && !activeThread && !hasChatContent ? (
    <AgentConversationListPanel
      conversations={threads.map((thread) => ({
        id: thread.id,
        title: thread.name || thread.preview || 'Untitled thread',
        description: thread.preview || endpoint || dataSource.label,
        meta: formatAgentChatTime(thread.updatedAt),
        onClick: () => void openThread(thread.id),
        ...(dataSource.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
        ...(dataSource.archiveThread ? { onArchive: () => void archiveThread(thread.id) } : {}),
      }))}
      providerSessionThreads={[]}
      onNew={() => void startThread()}
      onCollapse={onCollapse}
      onRefreshProviderSessionThreads={() => void loadThreads()}
      showCollapse={showCollapse}
      emptyLabel={loading ? 'Loading' : emptyThreadListLabel}
      providerSessionThreadsLabel={threadListLabel}
      providerSessionThreadsEmptyLabel={emptyThreadListLabel}
      newConversationLabel={newThreadLabel}
      collapseAssistantLabel="Collapse assistant"
      archiveConversationLabel="Archive conversation"
      deleteConversationLabel="Delete conversation"
      renameConversationLabel="Rename conversation"
      refreshLabel="Refresh"
    />
  ) : null

  return (
    <AgentShell density="compact" data-agent-chat-host={resolvedHost} className={shellClassName}>
      {listPanel ?? (
        <AgentMain className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'} data-agent-chat-host={resolvedHost}>
          {surface === 'panel' ? (
            <section className="ai-agent-panel-content-card" data-empty-conversation={!hasChatContent ? 'true' : undefined}>
              <AgentHeader className="ai-agent-panel-chat-header">
                <div className="ai-agent-panel-chat-toolbar">
                  <div className="ai-agent-panel-chat-toolbar-tabs">
                    {activeThreadId ? (
                      <AgentConversationTabsPanel
                        activeConversationId={activeThreadId}
                        conversations={threadTabs}
                        endAccessory={(
                          <ProviderControls
                            historyOpen={false}
                            onNewConversation={() => void startThread()}
                            onToggleHistory={showThreadHistory}
                          />
                        )}
                        onCloseConversation={(threadId) => {
                          void archiveThread(threadId)
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
                    ) : null}
                  </div>
                </div>
              </AgentHeader>
              <AgentChatDataSourceThreadBody
                emptyThreadLabel={emptyThreadLabel}
                error={error}
                recentCapabilityEvents={recentCapabilityEvents}
                scrollRef={scrollRef}
                visibleItems={visibleItems}
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
                    visibleItems={visibleItems}
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
              composerPlaceholder={composerPlaceholder}
              debugBeforeSend={false}
              draggingFiles={composer.draggingFiles}
              fileRef={composerFileRef}
              inputRef={composerInputRef}
              loading={sending}
              mentionRangeActive={!!composer.mentionRange}
              mentionResults={composer.mentionResults}
              pendingActiveRunInputQueue={[]}
              stoppingActiveRun={stoppingTurn}
              uploadedFileCount={composer.uploadedFileCount}
              uploading={composer.uploading}
              uploadingFileNames={composer.uploadingFileNames}
              workspaceProjectOptions={composer.workspaceProjectOptions}
              workspaceProjectValue={composer.workspaceProjectValue}
              workspaceProjectsLoading={composer.workspaceProjectsLoading}
              workspaceProductionOptions={composer.workspaceProductionOptions}
              workspaceProductionValue={composer.workspaceProductionValue}
              workspaceProductionsLoading={composer.workspaceProductionsLoading}
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
              onInputChange={(nextInput) => composer.updateWorkspace({ input: nextInput })}
              onMentionEscape={() => composer.setMentionRange(null)}
              onMentionSelect={composer.insertResourceMention}
              onMentionState={composer.updateMentionState}
              onRemoveAttachment={composer.removeAttachment}
              onSend={(profilePresetId) => void sendMessage(profilePresetId)}
              onStopActiveRun={() => void stopActiveTurn()}
              onUploadFiles={(files) => void composer.uploadFiles(files)}
              onWorkspaceProjectChange={composer.changeWorkspaceProject}
              onWorkspaceProductionChange={composer.changeWorkspaceProduction}
              showApprovalPresetSelector={!activeTurn}
              showAttachmentTools
              showDebugPreview={false}
              showMentionTools
            />
          </div>
        </AgentMain>
      )}
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

function AgentChatDataSourceThreadBody({
  emptyThreadLabel,
  error,
  recentCapabilityEvents,
  scrollRef,
  visibleItems,
}: {
  emptyThreadLabel: string
  error: string | null
  recentCapabilityEvents: RecentCapabilityEvent[]
  scrollRef: { current: HTMLDivElement | null }
  visibleItems: Array<{ viewId: string; item: AgentChatThreadItem; streaming: boolean }>
}) {
  return (
    <AgentBody className="ai-agent-panel-thread-body">
      <AgentThreadFill ref={(node) => { scrollRef.current = node }} className="px-4 py-5">
        {error ? (
          <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        ) : null}
        {recentCapabilityEvents.length > 0 ? (
          <div className="mb-3 space-y-2" data-testid="agent-chat-capability-events">
            {recentCapabilityEvents.map((item) => (
              <AgentChatRecentCapabilityEventCard key={item.id} event={item.event} />
            ))}
          </div>
        ) : null}
        <div className="flex w-full flex-col gap-3">
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

function AgentComposerActionLayer({
  pendingServerRequests,
  onResolveServerRequest,
}: {
  pendingServerRequests: PendingServerRequest[]
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
      className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-[min(56vh,520px)] overflow-y-auto overscroll-contain px-2"
      data-testid="agent-composer-action-layer"
      aria-live="polite"
    >
      <div className="rounded-md border border-border bg-background/95 p-2 shadow-xl backdrop-blur">
        {pageCount > 1 ? (
          <div className="mb-2 flex items-center justify-end gap-1 px-1">
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

export function openAgentChatDataSourceThread(input: {
  storageKey: string
  eventName: string
  threadId: string
}): void {
  if (typeof window === 'undefined') return
  writeStoredActiveThreadId(input.storageKey, input.threadId)
  window.dispatchEvent(new CustomEvent(input.eventName, { detail: { threadId: input.threadId } }))
}

function readStoredActiveThreadId(storageKey: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(storageKey)?.trim() || null
}

function writeStoredActiveThreadId(storageKey: string, threadId: string | null): void {
  if (typeof window === 'undefined') return
  if (threadId) window.localStorage.setItem(storageKey, threadId)
  else window.localStorage.removeItem(storageKey)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatAgentChatTime(value: number | undefined): string {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

function agentChatThreadProviderSessionState(thread: AgentChatThread): 'stopped' | 'waiting' | 'active' {
  if (thread.status === 'running') return 'active'
  if (thread.status === 'failed') return 'waiting'
  return 'stopped'
}

function agentChatTurnIsActive(turn: AgentChatTurn): boolean {
  return turn.status === 'inProgress'
}
