import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AGENT_PANEL_WORKSPACE_EVENT, AGENT_PANEL_NEW_CONVERSATION_EVENT, consumeAgentPanelWorkspace, consumeAgentPanelNewConversation, type AgentPanelWorkspacePayload, type AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import { activateConversationForPanelWorkspace, consumeQueuedPanelWorkspaces } from '@/features/agent/application/agentPanelWorkspaceIntake'
import { listRuntimeSessionSummariesFromWorkspace, listRuntimeThreadSummariesFromWorkspace, runtimeThreadSummaryFromThread, startSharedProvisionalConversation, upsertCachedLocalAgentThread } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import { restoreRuntimeThreadConversation, type RestoreRuntimeThreadResult } from '@/features/agent/application/agentRuntimeThreadRestore'
import {
  agentConversationOpenRecordsEqual,
  mergeAgentConversationOpenState,
  openAgentConversationIds,
  readAgentActiveConversationId,
  readAgentConversationOpenState,
  removeAgentConversationOpenRecords,
  reorderAgentConversationOpenState,
  setAgentConversationOpen,
  writeAgentActiveConversationId,
  writeAgentConversationOpenState,
  type AgentConversationOpenRecord,
} from '@/features/agent/presentation/agentConversationOpenOrder'
import { conversationFromRuntimeSessionSummary } from '@/features/agent/presentation/agentRuntimeThreadConversation'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import { localAgentClient, type AgentSessionSummary, type AgentThread, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

const RESTORE_THREAD_MESSAGE_PAGE_SIZE = 50

export interface UseAgentBuiltinChatControllerOptions {
  userId: string
  pendingThreadIdToOpen?: string | null
  pendingThreadSessionIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
  onStartupSettled?: () => void
}

export type AgentBuiltinChatStartupStatus = 'creating' | 'restoring' | null

export function useAgentBuiltinChatController({
  userId,
  pendingThreadIdToOpen,
  pendingThreadSessionIdToOpen,
  onPendingThreadHandled,
  onStartupSettled,
}: UseAgentBuiltinChatControllerOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const setAgentPanelOpen = useAgentPanelUiStore((s) => s.setOpen)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const conversationRuntimes = useAgentSessionStore((s) => s.conversationRuntimes)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const getActiveConversationId = useAgentSessionStore((s) => s.getActiveConversationId)
  const createRuntimeConversation = useAgentSessionStore((s) => s.createRuntimeConversation)
  const removeRuntimeConversation = useAgentSessionStore((s) => s.removeRuntimeConversation)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const updateConversationTitle = useAgentSessionStore((s) => s.updateConversationTitle)
  const attachPageTaskConversation = useAgentSessionStore((s) => s.attachPageTaskConversation)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const setConversationSessionId = useAgentSessionStore((s) => s.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((s) => s.setConversationRuntime)
  const setConversationRuntimeSessionId = useAgentSessionStore((s) => s.setConversationRuntimeSessionId)
  const setConversationRuntimeThreadId = useAgentSessionStore((s) => s.setConversationRuntimeThreadId)
  const clearConversationRuntimeState = useAgentSessionStore((s) => s.clearConversationRuntimeState)
  const {
    data: runtimeThreads = [],
    refetch: refetchRuntimeThreads,
  } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL, 'builtin-chat-controller'],
    queryFn: async () => {
      return listRuntimeThreadSummariesFromWorkspace({ includeProvisional: true })
    },
    retry: false,
  })
  const {
    data: runtimeSessions = [],
    isLoading: runtimeSessionsLoading,
    refetch: refetchRuntimeSessions,
  } = useQuery<AgentSessionSummary[]>({
    queryKey: ['local-agent-sessions', localAgentClient.baseURL, 'builtin-chat-controller'],
    queryFn: async () => {
      return listRuntimeSessionSummariesFromWorkspace()
    },
    retry: false,
  })

  const conversations = useMemo(() => {
    return runtimeSessions.map((session) => {
      const conversation = conversationFromRuntimeSessionSummary(session, t)
      const title = conversationRuntimes[conversation.id]?.title?.trim()
      return title ? { ...conversation, title } : conversation
    })
  }, [conversationRuntimes, runtimeSessions, t])
  const rawOpenConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived !== true),
    [conversations],
  )
  const availableConversationIds = useMemo(() => rawOpenConversations.map((conversation) => conversation.id), [rawOpenConversations])
  const [conversationOpenState, setConversationOpenState] = useState<AgentConversationOpenRecord[]>(() => readAgentConversationOpenState(userId))
  useEffect(() => {
    setConversationOpenState(readAgentConversationOpenState(userId))
  }, [userId])
  useEffect(() => {
    if (runtimeSessionsLoading) return
    setConversationOpenState((current) => {
      let merged = mergeAgentConversationOpenState(current, availableConversationIds, { defaultOpen: false })
      const activeConversationExplicitlyClosed = merged.some((record) => record.id === activeConversationId && record.open === false)
      if (activeConversationId && availableConversationIds.includes(activeConversationId) && !activeConversationExplicitlyClosed) {
        merged = setAgentConversationOpen(merged, [activeConversationId], true)
      }
      if (agentConversationOpenRecordsEqual(current, merged)) return current
      writeAgentConversationOpenState(userId, merged)
      return merged
    })
  }, [activeConversationId, availableConversationIds, runtimeSessionsLoading, userId])
  const openConversationIds = useMemo(() => openAgentConversationIds(conversationOpenState), [conversationOpenState])
  const openConversations = useMemo(() => {
    const openIds = new Set(openConversationIds)
    const orderIndex = new Map(conversationOpenState.map((record, index) => [record.id, index]))
    const sourceIndex = new Map(rawOpenConversations.map((conversation, index) => [conversation.id, index]))
    return rawOpenConversations.filter((conversation) => openIds.has(conversation.id)).sort((a, b) => {
      const aOrder = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bOrder = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0)
    })
  }, [conversationOpenState, openConversationIds, rawOpenConversations])
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )
  const activeConversation = openConversations.find((conversation) => conversation.id === activeConversationId) ?? null
  const setActiveConversationAndPersist = useCallback((targetUserId: string, conversationId: string | null) => {
    setActiveConversation(targetUserId, conversationId)
    writeAgentActiveConversationId(targetUserId, conversationId)
  }, [setActiveConversation])
  useEffect(() => {
    if (runtimeSessionsLoading) return
    if (activeConversationId) {
      if (openConversationIds.includes(activeConversationId)) {
        writeAgentActiveConversationId(userId, activeConversationId)
      }
      return
    }
    const savedActiveConversationId = readAgentActiveConversationId(userId)
    const restoredConversationId = savedActiveConversationId && openConversationIds.includes(savedActiveConversationId)
      ? savedActiveConversationId
      : openConversationIds[0] ?? null
    if (restoredConversationId !== activeConversationId) {
      setActiveConversationAndPersist(userId, restoredConversationId)
    }
  }, [activeConversationId, openConversationIds, runtimeSessionsLoading, setActiveConversationAndPersist, userId])
  const restoringThreadsRef = useRef(new Map<string, Promise<RestoreRuntimeThreadResult>>())
  const [startupStatus, setStartupStatus] = useState<AgentBuiltinChatStartupStatus>(null)
  const activeTask = useMemo(() => {
    if (!activeConversation) return null
    const tasks = Object.values(pageTasks).filter((task) => task.conversationId === activeConversation.id)
    const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'claimed' || task.status === 'running')
    const ordered = (list: typeof tasks) => [...list].sort((a, b) => a.updatedAt - b.updatedAt)
    return ordered(activeTasks).at(-1) ?? ordered(tasks).at(-1) ?? null
  }, [activeConversation?.id, pageTasks])

  const threadIdForConversation = useCallback((conversationId: string) => {
    const sessionState = useAgentSessionStore.getState()
    return sessionState.localThreadIdsByConversation[conversationId]
      ?? sessionState.conversationRuntimes[conversationId]?.threadId
      ?? (conversationId.startsWith('thread_') ? conversationId : undefined)
  }, [])

  const runtimeClientForConversation = useCallback((conversationId: string) => {
    const sessionState = useAgentSessionStore.getState()
    const sessionId = sessionState.sessionIdsByConversation[conversationId]
      ?? sessionState.conversationRuntimes[conversationId]?.sessionId
    return sessionId?.trim()
      ? localAgentClient.forSession({ sessionId: sessionId.trim() })
      : localAgentClient
  }, [])

  const updateConversationTitleAndPersist = useCallback((targetUserId: string, conversationId: string, title: string) => {
    updateConversationTitle(targetUserId, conversationId, title)
    const trimmed = title.trim()
    const threadId = threadIdForConversation(conversationId)
    if (!trimmed || !threadId) return
    void runtimeClientForConversation(conversationId).updateThread(threadId, { title: trimmed, metadata: { frontendTitle: trimmed } })
      .then((thread) => upsertCachedLocalAgentThread(queryClient, runtimeThreadSummaryFromThread(thread)))
      .catch((error) => {
        console.error('[agent] failed to persist runtime conversation title', error)
      })
  }, [queryClient, runtimeClientForConversation, threadIdForConversation, updateConversationTitle])

  const createProvisionalRuntimeConversation = useCallback(async (input: { title?: string; projectId?: number } = {}) => {
    const operationId = beginAgentPerformanceOperation({
      kind: 'conversation_create',
      meta: {
        hasTitle: Boolean(input.title?.trim()),
        ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
      },
    })
    markAgentPerformancePhase(operationId, 'conversation_create_start')
    setStartupStatus('creating')
    try {
      markAgentPerformancePhase(operationId, 'provisional_thread_start')
      const thread = await startSharedProvisionalConversation({
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
      })
      const threadSummary = runtimeThreadSummaryFromThread(thread)
      markAgentPerformancePhase(operationId, 'provisional_thread_done', {
        details: {
          threadId: thread.id,
          messageCount: threadSummary.messageCount,
          hasSessionId: Boolean(thread.sessionId),
        },
      })
      const createdAt = Date.parse(thread.createdAt)
      const updatedAt = Date.parse(thread.updatedAt)
      markAgentPerformancePhase(operationId, 'runtime_conversation_create_start')
      const conversationId = createRuntimeConversation(userId, {
        threadId: thread.id,
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        ...(thread.title?.trim() ? { title: thread.title.trim() } : {}),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      })
      markAgentPerformancePhase(operationId, 'runtime_conversation_create_done', {
        details: { conversationId },
      })
      upsertCachedLocalAgentThread(queryClient, threadSummary)
      markAgentPerformancePhase(operationId, 'runtime_thread_cache_upserted')
      setLocalThreadId(conversationId, thread.id)
      if (thread.sessionId) setConversationSessionId(conversationId, thread.sessionId)
      setConversationOpenState((current) => {
        const next = setAgentConversationOpen(current, [conversationId], true)
        writeAgentConversationOpenState(userId, next)
        return next
      })
      writeAgentActiveConversationId(userId, conversationId)
      setConversationRuntime(conversationId, {
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        threadId: thread.id,
        loading: false,
        building: false,
        error: undefined,
      })
      setAgentPanelOpen(true)
      markAgentPerformancePhase(operationId, 'conversation_panel_opened')
      void refetchRuntimeThreads()
      void refetchRuntimeSessions()
      markAgentPerformancePhase(operationId, 'runtime_threads_refetch_queued')
      finishAgentPerformanceOperation(operationId, 'success', {
        conversationId,
        threadId: thread.id,
        messageCount: threadSummary.messageCount,
      })
      return conversationId
    } catch (error) {
      finishAgentPerformanceOperation(operationId, 'error', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      setStartupStatus(null)
      onStartupSettled?.()
    }
  }, [createRuntimeConversation, onStartupSettled, queryClient, refetchRuntimeSessions, refetchRuntimeThreads, setAgentPanelOpen, setConversationRuntime, setConversationSessionId, setLocalThreadId, t, userId])

  const handleNewConversation = useCallback(() => {
    void createProvisionalRuntimeConversation().catch((error) => {
      console.error('[agent] failed to start provisional conversation', error)
    })
  }, [createProvisionalRuntimeConversation])

  const handleRestoreLocalThread = useCallback(async (threadId: string, restoreSessionId?: string) => {
    const normalizedThreadId = threadId.trim()
    const normalizedRestoreSessionId = restoreSessionId?.trim()
    if (!normalizedThreadId) return
    const operationId = beginAgentPerformanceOperation({
      kind: 'conversation_open',
      meta: { source: 'restore_thread', threadId: normalizedThreadId, sessionId: normalizedRestoreSessionId },
    })
    const pendingRestore = restoringThreadsRef.current.get(normalizedThreadId)
    if (pendingRestore) {
      markAgentPerformancePhase(operationId, 'conversation_restore_deduped_pending')
      await pendingRestore
      finishAgentPerformanceOperation(operationId, 'success', { threadId: normalizedThreadId, deduped: true })
      return
    }
    markAgentPerformancePhase(operationId, 'conversation_restore_start')
    setStartupStatus('restoring')
    const sessionState = useAgentSessionStore.getState()
    markAgentPerformancePhase(operationId, 'conversation_restore_session_state_ready', {
      details: {
        mappedThreadCount: Object.keys(sessionState.localThreadIdsByConversation).length,
        runtimeConversationCount: Object.keys(sessionState.conversationRuntimes).length,
      },
    })
    const restorePromise = restoreRuntimeThreadConversation(normalizedThreadId, {
      userId,
      conversations,
      getConversations: () => runtimeSessions.map((session) => conversationFromRuntimeSessionSummary(session, t)),
      sessionState: {
        localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
        sessionIdsByConversation: sessionState.sessionIdsByConversation,
        conversationRuntimes: sessionState.conversationRuntimes,
      },
      titleForThread: (thread) => {
        const sessionTitle = runtimeSessions.find((session) => session.id === thread.sessionId)?.title?.trim()
        return sessionTitle || t('agents.chat.newConversation')
      },
      loadThread: async (id) => {
        markAgentPerformancePhase(operationId, 'conversation_thread_fetch_start')
        const startedAt = performanceNow()
        const threadSummary = runtimeThreads.find((thread) => thread.id === id)
        const sessionId = normalizedRestoreSessionId || threadSummary?.sessionId
        const runtimeClient = sessionId?.trim()
          ? localAgentClient.forSession({ sessionId: sessionId.trim() })
          : localAgentClient
        if (sessionId?.trim()) {
          markAgentPerformancePhase(operationId, 'conversation_session_runtime_ensure_start', {
            details: { sessionId: sessionId.trim() },
          })
          await runtimeClient.ensureRunning()
          markAgentPerformancePhase(operationId, 'conversation_session_runtime_ensure_done', {
            details: { sessionId: sessionId.trim() },
          })
        }
        if (threadSummary) {
          const shell = runtimeThreadShellFromSummary(threadSummary)
          const shellDurationMs = Math.max(0, performanceNow() - startedAt)
          const shellPayloadBytes = jsonByteLength(shell)
          recordAgentPerformanceMetric({
            name: 'frontend_agent_thread_restore_duration_ms',
            value: shellDurationMs,
            unit: 'ms',
            labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread_shell', status: 'success' },
          })
          recordAgentPerformanceMetric({
            name: 'frontend_agent_thread_restore_payload_bytes',
            value: shellPayloadBytes,
            unit: 'bytes',
            labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread_shell', status: 'success' },
          })
          markAgentPerformancePhase(operationId, 'conversation_thread_fetch_done', {
            details: { threadId: shell.id, messageCount: threadSummary.messageCount, payloadBytes: shellPayloadBytes, durationMs: shellDurationMs, source: 'summary' },
          })

          try {
            const messagesStartedAt = performanceNow()
            const page = await runtimeClient.listThreadMessages(id, { limit: RESTORE_THREAD_MESSAGE_PAGE_SIZE, direction: 'desc' })
            const messagesDurationMs = Math.max(0, performanceNow() - messagesStartedAt)
            const messagesPayloadBytes = jsonByteLength(page)
            recordAgentPerformanceMetric({
              name: 'frontend_agent_thread_restore_duration_ms',
              value: messagesDurationMs,
              unit: 'ms',
              labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread_messages', status: 'success' },
            })
            recordAgentPerformanceMetric({
              name: 'frontend_agent_thread_restore_message_count',
              value: page.messages.length,
              unit: 'count',
              labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread_messages', status: 'success' },
            })
            recordAgentPerformanceMetric({
              name: 'frontend_agent_thread_restore_payload_bytes',
              value: messagesPayloadBytes,
              unit: 'bytes',
              labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread_messages', status: 'success' },
            })
            markAgentPerformancePhase(operationId, 'conversation_thread_messages_page_done', {
              details: {
                threadId: shell.id,
                messageCount: page.messages.length,
                totalMessageCount: threadSummary.messageCount,
                payloadBytes: messagesPayloadBytes,
                durationMs: messagesDurationMs,
                hasMore: page.hasMore,
                direction: 'desc',
                scan: page.scan,
              },
            })
            return {
              ...shell,
              messages: [...page.messages].reverse(),
            }
          } catch (error) {
            markAgentPerformancePhase(operationId, 'conversation_thread_messages_page_error', {
              details: { threadId: shell.id, error: error instanceof Error ? error.message : String(error) },
            })
          }
        }
        const thread = await runtimeClient.getThread(id)
        const durationMs = Math.max(0, performanceNow() - startedAt)
        const messageCount = runtimeThreadSummaryFromThread(thread).messageCount
        const payloadBytes = jsonByteLength(thread)
        recordAgentPerformanceMetric({
          name: 'frontend_agent_thread_restore_duration_ms',
          value: durationMs,
          unit: 'ms',
          labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread', status: 'success' },
        })
        recordAgentPerformanceMetric({
          name: 'frontend_agent_thread_restore_message_count',
          value: messageCount,
          unit: 'count',
          labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread', status: 'success' },
        })
        recordAgentPerformanceMetric({
          name: 'frontend_agent_thread_restore_payload_bytes',
          value: payloadBytes,
          unit: 'bytes',
          labels: { component: 'agent_builtin_chat', kind: 'thread_restore', stage: 'load_thread', status: 'success' },
        })
        markAgentPerformancePhase(operationId, 'conversation_thread_fetch_done', {
          details: { threadId: thread.id, messageCount, payloadBytes, durationMs },
        })
        return thread
      },
      createRuntimeConversation,
      setActiveConversation: setActiveConversationAndPersist,
      unarchiveConversation: () => undefined,
      updateConversationTitle: updateConversationTitleAndPersist,
      setLocalThreadId,
      setConversationSessionId,
      setConversationRuntimeSessionId: (targetUserId, conversationId, sessionId) => {
        setConversationRuntimeSessionId(targetUserId, conversationId, sessionId)
        setConversationSessionId(conversationId, sessionId)
      },
      setConversationRuntimeThreadId,
    }).finally(() => {
      restoringThreadsRef.current.delete(normalizedThreadId)
      setStartupStatus(null)
      onStartupSettled?.()
    })
    restoringThreadsRef.current.set(normalizedThreadId, restorePromise)
    try {
      const result = await restorePromise
      markAgentPerformancePhase(operationId, 'conversation_restore_resolved', {
        details: {
          conversationId: result.conversationId,
          threadId: result.threadId,
          reusedExistingConversation: result.reusedExistingConversation,
          restoredMessageCount: result.restoredMessageCount,
        },
      })
      void refetchRuntimeThreads()
      void refetchRuntimeSessions()
      markAgentPerformancePhase(operationId, 'runtime_threads_refetch_queued')
      archiveDuplicateRuntimeConversations(userId, result.conversationId, result.threadId)
      finishAgentPerformanceOperation(operationId, 'success', {
        conversationId: result.conversationId,
        threadId: result.threadId,
        reusedExistingConversation: result.reusedExistingConversation,
        restoredMessageCount: result.restoredMessageCount,
      })
    } catch (error) {
      finishAgentPerformanceOperation(operationId, 'error', {
        threadId: normalizedThreadId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }, [
    conversations,
    createRuntimeConversation,
    onStartupSettled,
    refetchRuntimeThreads,
    refetchRuntimeSessions,
    setActiveConversationAndPersist,
    setConversationRuntimeSessionId,
    setConversationRuntimeThreadId,
    setConversationSessionId,
    setLocalThreadId,
    t,
    updateConversationTitleAndPersist,
    userId,
    runtimeThreads,
    runtimeSessions,
  ])

  const getActiveRuntimeConversationId = useCallback((targetUserId: string) => {
    const activeId = getActiveConversationId(targetUserId)
    return activeId && threadIdForConversation(activeId) ? activeId : null
  }, [getActiveConversationId, threadIdForConversation])

  const patchCachedRuntimeThreads = useCallback((threadIds: Iterable<string>, patch: Partial<AgentThreadSummary>) => {
    const threadIdSet = new Set(threadIds)
    if (threadIdSet.size === 0) return
    queryClient.setQueriesData<AgentThreadSummary[]>({
      predicate: (query) => Array.isArray(query.queryKey)
        && query.queryKey[0] === 'local-agent-threads'
        && query.queryKey[1] === localAgentClient.baseURL,
    }, (threads) => {
      if (!threads) return threads
      return threads.map((thread) => threadIdSet.has(thread.id) ? { ...thread, ...patch } : thread)
    })
  }, [queryClient])

  const activeConversationAfterArchive = useCallback((archivedIds: Set<string>) => {
    const currentActiveId = getActiveConversationId(userId)
    if (!currentActiveId || !archivedIds.has(currentActiveId)) return currentActiveId
    return openConversations.find((conversation) => !archivedIds.has(conversation.id))?.id ?? null
  }, [getActiveConversationId, openConversations, userId])

  const createConversationForPanelWorkspace = useCallback((payload: AgentPanelWorkspacePayload) => {
    return createProvisionalRuntimeConversation({
      ...(payload.title?.trim() ? { title: payload.title.trim() } : {}),
      ...(typeof payload.projectId === 'number' ? { projectId: payload.projectId } : {}),
    })
  }, [createProvisionalRuntimeConversation])

  const patchConversationArchiveState = useCallback(async (conversationId: string, archived: boolean) => {
    const runtimeThreadId = threadIdForConversation(conversationId)
    if (!runtimeThreadId) {
      if (archived) {
        setConversationOpenState((current) => {
          const next = setAgentConversationOpen(current, [conversationId], false)
          writeAgentConversationOpenState(userId, next)
          return next
        })
        setActiveConversationAndPersist(userId, null)
      }
      return
    }
    if (archived) {
      setConversationOpenState((current) => {
        const next = setAgentConversationOpen(current, [conversationId], false)
        writeAgentConversationOpenState(userId, next)
        return next
      })
      const nextActiveConversationId = activeConversationAfterArchive(new Set([conversationId]))
      setActiveConversationAndPersist(userId, nextActiveConversationId)
      if (!nextActiveConversationId) setAgentPanelOpen(false)
      return
    }
    setConversationOpenState((current) => {
      const next = setAgentConversationOpen(current, [conversationId], true)
      writeAgentConversationOpenState(userId, next)
      return next
    })
    patchCachedRuntimeThreads([runtimeThreadId], { archived })
    await runtimeClientForConversation(conversationId).updateThread(runtimeThreadId, { archived })
    if (!archived) setActiveConversationAndPersist(userId, conversationId)
    void refetchRuntimeThreads()
    void refetchRuntimeSessions()
  }, [activeConversationAfterArchive, patchCachedRuntimeThreads, refetchRuntimeSessions, refetchRuntimeThreads, runtimeClientForConversation, setActiveConversationAndPersist, setAgentPanelOpen, threadIdForConversation, userId])

  const handleArchiveConversation = useCallback((id: string) => {
    void patchConversationArchiveState(id, true).catch((error) => {
      void refetchRuntimeThreads()
      void refetchRuntimeSessions()
      console.error('[agent] failed to archive runtime conversation', error)
    })
  }, [patchConversationArchiveState, refetchRuntimeSessions, refetchRuntimeThreads])

  const handleArchiveConversations = useCallback((ids: string[]) => {
    void (async () => {
      setConversationOpenState((current) => {
        const next = setAgentConversationOpen(current, ids, false)
        writeAgentConversationOpenState(userId, next)
        return next
      })
      const archivedIdSet = new Set(ids)
      const nextActiveConversationId = activeConversationAfterArchive(archivedIdSet)
      setActiveConversationAndPersist(userId, nextActiveConversationId)
      if (!nextActiveConversationId) setAgentPanelOpen(false)
    })().catch((error) => {
      console.error('[agent] failed to archive runtime conversations', error)
    })
  }, [activeConversationAfterArchive, setActiveConversationAndPersist, setAgentPanelOpen, userId])

  const cleanupDeletedRuntimeConversations = useCallback((conversationId: string, deletedThreadIds: Iterable<string>) => {
    const deletedThreadIdSet = new Set(deletedThreadIds)
    const sessionState = useAgentSessionStore.getState()
    const idsToRemove = new Set<string>([conversationId])
    for (const id of Object.keys(sessionState.conversationRuntimes)) {
      const runtimeThreadId = sessionState.localThreadIdsByConversation[id]
        ?? sessionState.conversationRuntimes[id]?.threadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (runtimeThreadId && deletedThreadIdSet.has(runtimeThreadId)) idsToRemove.add(id)
    }
    for (const id of idsToRemove) {
      removeRuntimeConversation(userId, id)
      clearConversationRuntimeState(id)
    }
    setConversationOpenState((current) => {
      const next = removeAgentConversationOpenRecords(current, idsToRemove)
      writeAgentConversationOpenState(userId, next)
      return next
    })
  }, [clearConversationRuntimeState, removeRuntimeConversation, userId])

  const handleDeleteConversation = useCallback((id: string) => {
    void (async () => {
      const runtimeThreadId = threadIdForConversation(id)
      if (!runtimeThreadId) {
        removeRuntimeConversation(userId, id)
        clearConversationRuntimeState(id)
        return
      }
      const deletion = await runtimeClientForConversation(id).deleteThread(runtimeThreadId)
      cleanupDeletedRuntimeConversations(id, [deletion.threadId])
      void refetchRuntimeThreads()
      void refetchRuntimeSessions()
    })().catch((error) => {
      console.error('[agent] failed to delete runtime conversation', error)
    })
  }, [cleanupDeletedRuntimeConversations, clearConversationRuntimeState, refetchRuntimeSessions, refetchRuntimeThreads, removeRuntimeConversation, runtimeClientForConversation, threadIdForConversation, userId])

  const handleSelectConversation = useCallback((id: string) => {
    const operationId = beginAgentPerformanceOperation({
      kind: 'conversation_open',
      conversationId: id,
      meta: { source: 'select_conversation' },
    })
    void (async () => {
      try {
        markAgentPerformancePhase(operationId, 'conversation_select_start')
        markAgentPerformancePhase(operationId, 'conversation_archive_patch_start')
        await patchConversationArchiveState(id, false)
        markAgentPerformancePhase(operationId, 'conversation_archive_patch_done')
        setConversationOpenState((current) => {
          const next = setAgentConversationOpen(current, [id], true)
          writeAgentConversationOpenState(userId, next)
          return next
        })
        setActiveConversationAndPersist(userId, id)
        markAgentPerformancePhase(operationId, 'conversation_active_set')
        finishAgentPerformanceOperation(operationId, 'success', { conversationId: id })
      } catch (error) {
        finishAgentPerformanceOperation(operationId, 'error', {
          conversationId: id,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })().catch((error) => {
      console.error('[agent] failed to restore runtime conversation', error)
    })
  }, [patchConversationArchiveState, setActiveConversationAndPersist, userId])

  const handleReorderConversation = useCallback((draggedId: string, targetId: string, position: 'before' | 'after') => {
    setConversationOpenState((current) => {
      const merged = mergeAgentConversationOpenState(current, availableConversationIds)
      const reordered = reorderAgentConversationOpenState(merged, draggedId, targetId, position)
      writeAgentConversationOpenState(userId, reordered)
      return reordered
    })
  }, [availableConversationIds, userId])

  const handleRenameConversation = useCallback((id: string, title: string) => {
    updateConversationTitleAndPersist(userId, id, title)
  }, [updateConversationTitleAndPersist, userId])

  useEffect(() => {
    if (!pendingThreadIdToOpen?.trim()) return
    void handleRestoreLocalThread(pendingThreadIdToOpen, pendingThreadSessionIdToOpen ?? undefined).finally(() => onPendingThreadHandled?.(pendingThreadIdToOpen))
  }, [handleRestoreLocalThread, onPendingThreadHandled, pendingThreadIdToOpen, pendingThreadSessionIdToOpen])

  useEffect(() => {
    void consumeQueuedPanelWorkspaces(consumeAgentPanelWorkspace, {
      userId,
      createConversationForWorkspace: createConversationForPanelWorkspace,
      getActiveConversationId: getActiveRuntimeConversationId,
      setActiveConversation: setActiveConversationAndPersist,
      updateConversationTitle: updateConversationTitleAndPersist,
      attachPageTaskConversation,
    })
      .then((conversationIds) => {
        if (conversationIds.length > 0) onStartupSettled?.()
      })
      .catch((error) => {
        console.error('[agent] failed to consume queued panel workspaces', error)
      })
  }, [attachPageTaskConversation, createConversationForPanelWorkspace, getActiveRuntimeConversationId, onStartupSettled, setActiveConversationAndPersist, updateConversationTitleAndPersist, userId])

  useEffect(() => {
    function handleWorkspace(event: Event) {
      const detail = (event as CustomEvent<AgentPanelWorkspacePayload>).detail
      void activateConversationForPanelWorkspace(detail, {
        userId,
        createConversationForWorkspace: createConversationForPanelWorkspace,
        getActiveConversationId: getActiveRuntimeConversationId,
        setActiveConversation: setActiveConversationAndPersist,
        updateConversationTitle: updateConversationTitleAndPersist,
        attachPageTaskConversation,
      })
        .catch((error) => {
          console.error('[agent] failed to activate panel workspace', error)
        })
        .finally(() => onStartupSettled?.())
    }

    window.addEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
    return () => window.removeEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
  }, [attachPageTaskConversation, createConversationForPanelWorkspace, getActiveRuntimeConversationId, onStartupSettled, setActiveConversationAndPersist, updateConversationTitleAndPersist, userId])

  useEffect(() => {
    function createFromPayload(payload: AgentPanelNewConversationPayload | undefined) {
      void createProvisionalRuntimeConversation({
        ...(payload?.title?.trim() ? { title: payload.title.trim() } : {}),
        ...(typeof payload?.projectId === 'number' ? { projectId: payload.projectId } : {}),
      }).catch((error) => {
        console.error('[agent] failed to start provisional conversation', error)
      })
    }

    for (let payload = consumeAgentPanelNewConversation(); payload; payload = consumeAgentPanelNewConversation()) {
      createFromPayload(payload)
    }

    function handleNewConversation(event: Event) {
      const detail = (event as CustomEvent<AgentPanelNewConversationPayload>).detail
      createFromPayload(consumeAgentPanelNewConversation() ?? detail)
    }

    window.addEventListener(AGENT_PANEL_NEW_CONVERSATION_EVENT, handleNewConversation)
    return () => window.removeEventListener(AGENT_PANEL_NEW_CONVERSATION_EVENT, handleNewConversation)
  }, [createProvisionalRuntimeConversation])

  return {
    activeConversation,
    activeTask,
    archivedConversations,
    conversations: openConversations,
    startupStatus,
    clearActiveConversation: () => setActiveConversationAndPersist(userId, null),
    archiveConversation: handleArchiveConversation,
    archiveConversations: handleArchiveConversations,
    deleteConversation: handleDeleteConversation,
    newConversation: handleNewConversation,
    renameConversation: handleRenameConversation,
    reorderConversation: handleReorderConversation,
    restoreLocalThread: handleRestoreLocalThread,
    selectConversation: handleSelectConversation,
  }
}

function archiveDuplicateRuntimeConversations(userId: string, keepConversationId: string, threadId: string) {
  void userId
  void keepConversationId
  void threadId
}

function runtimeThreadShellFromSummary(summary: AgentThreadSummary): AgentThread {
  return {
    ...summary,
    archived: summary.archived === true,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messages: [],
  }
}

function jsonByteLength(value: unknown): number {
  const json = JSON.stringify(value)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength
  return json.length
}
