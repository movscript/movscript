import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AGENT_PANEL_WORKSPACE_EVENT, AGENT_PANEL_NEW_CONVERSATION_EVENT, consumeAgentPanelWorkspace, consumeAgentPanelNewConversation, type AgentPanelWorkspacePayload, type AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import { activateConversationForPanelWorkspace, consumeQueuedPanelWorkspaces } from '@/features/agent/application/agentPanelWorkspaceIntake'
import { runtimeThreadSummaryFromThread, upsertCachedLocalAgentThread } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import { restoreRuntimeThreadConversation, type RestoreRuntimeThreadResult } from '@/features/agent/application/agentRuntimeThreadRestore'
import { localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { conversationFromRuntimeThreadSummary } from '@/features/agent/presentation/agentRuntimeThreadConversation'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { localAgentClient, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

export interface UseAgentBuiltinChatControllerOptions {
  userId: string
  pendingThreadIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
  onStartupSettled?: () => void
}

export type AgentBuiltinChatStartupStatus = 'creating' | 'restoring' | null

export function useAgentBuiltinChatController({
  userId,
  pendingThreadIdToOpen,
  onPendingThreadHandled,
  onStartupSettled,
}: UseAgentBuiltinChatControllerOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const setAgentPanelOpen = useAgentPanelUiStore((s) => s.setOpen)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const conversationRuntimes = useAgentSessionStore((s) => s.conversationRuntimes)
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
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads({ includeProvisional: true }).then((result) => result.threads)
    },
    retry: false,
  })

  const conversations = useMemo(() => {
    return runtimeThreads.map((thread) => {
      const conversation = conversationFromRuntimeThreadSummary(thread, t)
      const title = conversationRuntimes[conversation.id]?.title?.trim()
      return title ? { ...conversation, title } : conversation
    })
  }, [conversationRuntimes, runtimeThreads, t])
  const openConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived !== true),
    [conversations],
  )
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )
  const activeConversationId = getActiveConversationId(userId)
  const activeConversation = openConversations.find((conversation) => conversation.id === activeConversationId) ?? null
  const restoringThreadsRef = useRef(new Map<string, Promise<RestoreRuntimeThreadResult>>())
  const [startupStatus, setStartupStatus] = useState<AgentBuiltinChatStartupStatus>(null)
  const activeTask = useMemo(() => {
    if (!activeConversation) return null
    const tasks = Object.values(pageTasks).filter((task) => task.conversationId === activeConversation.id)
    const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'claimed' || task.status === 'running')
    const ordered = (list: typeof tasks) => [...list].sort((a, b) => a.updatedAt - b.updatedAt)
    return ordered(activeTasks).at(-1) ?? ordered(tasks).at(-1) ?? null
  }, [activeConversation?.id, pageTasks])

  const createProvisionalRuntimeConversation = useCallback(async (input: { title?: string; projectId?: number } = {}) => {
    setStartupStatus('creating')
    try {
      await localAgentClient.ensureRunning()
      const thread = await localAgentClient.startProvisionalConversation({
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
      })
      const createdAt = Date.parse(thread.createdAt)
      const updatedAt = Date.parse(thread.updatedAt)
      const threadSummary = runtimeThreadSummaryFromThread(thread)
      const conversationId = createRuntimeConversation(userId, {
        threadId: thread.id,
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        ...(thread.title?.trim() ? { title: thread.title.trim() } : {}),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      })
      upsertCachedLocalAgentThread(queryClient, threadSummary)
      setLocalThreadId(conversationId, thread.id)
      if (thread.sessionId) setConversationSessionId(conversationId, thread.sessionId)
      setConversationRuntime(conversationId, {
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        threadId: thread.id,
        loading: false,
        building: false,
        error: undefined,
      })
      setAgentPanelOpen(true)
      void refetchRuntimeThreads()
      return conversationId
    } finally {
      setStartupStatus(null)
      onStartupSettled?.()
    }
  }, [createRuntimeConversation, onStartupSettled, queryClient, refetchRuntimeThreads, setAgentPanelOpen, setConversationRuntime, setConversationSessionId, setLocalThreadId, t, userId])

  const handleNewConversation = useCallback(() => {
    void createProvisionalRuntimeConversation().catch((error) => {
      console.error('[agent] failed to start provisional conversation', error)
    })
  }, [createProvisionalRuntimeConversation])

  const handleRestoreLocalThread = useCallback(async (threadId: string) => {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return
    const pendingRestore = restoringThreadsRef.current.get(normalizedThreadId)
    if (pendingRestore) {
      await pendingRestore
      return
    }
    setStartupStatus('restoring')
    const sessionState = useAgentSessionStore.getState()
    const restorePromise = restoreRuntimeThreadConversation(normalizedThreadId, {
      userId,
      conversations,
      getConversations: () => runtimeThreads.map((thread) => conversationFromRuntimeThreadSummary(thread, t)),
      sessionState: {
        localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
        sessionIdsByConversation: sessionState.sessionIdsByConversation,
        conversationRuntimes: sessionState.conversationRuntimes,
      },
      titleForThread: (thread) => localThreadTitle(thread, t),
      loadThread: (id) => localAgentClient.getThread(id),
      createRuntimeConversation,
      setActiveConversation,
      unarchiveConversation: () => undefined,
      updateConversationTitle,
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
    const result = await restorePromise
    void refetchRuntimeThreads()
    archiveDuplicateRuntimeConversations(userId, result.conversationId, result.threadId)
  }, [
    conversations,
    createRuntimeConversation,
    onStartupSettled,
    refetchRuntimeThreads,
    setActiveConversation,
    setConversationRuntimeSessionId,
    setConversationRuntimeThreadId,
    setConversationSessionId,
    setLocalThreadId,
    t,
    updateConversationTitle,
    userId,
    runtimeThreads,
  ])

  const threadIdForConversation = useCallback((conversationId: string) => {
    const sessionState = useAgentSessionStore.getState()
    return sessionState.localThreadIdsByConversation[conversationId]
      ?? sessionState.conversationRuntimes[conversationId]?.threadId
      ?? (conversationId.startsWith('thread_') ? conversationId : undefined)
  }, [])

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
      if (archived) setActiveConversation(userId, null)
      return
    }
    patchCachedRuntimeThreads([runtimeThreadId], { archived })
    if (archived) {
      const nextActiveConversationId = activeConversationAfterArchive(new Set([conversationId]))
      setActiveConversation(userId, nextActiveConversationId)
      if (!nextActiveConversationId) setAgentPanelOpen(false)
    }
    await localAgentClient.updateThread(runtimeThreadId, { archived })
    void refetchRuntimeThreads()
    if (!archived) setActiveConversation(userId, conversationId)
  }, [activeConversationAfterArchive, patchCachedRuntimeThreads, refetchRuntimeThreads, setActiveConversation, setAgentPanelOpen, threadIdForConversation, userId])

  const handleArchiveConversation = useCallback((id: string) => {
    void patchConversationArchiveState(id, true).catch((error) => {
      void refetchRuntimeThreads()
      console.error('[agent] failed to archive runtime conversation', error)
    })
  }, [patchConversationArchiveState, refetchRuntimeThreads])

  const handleArchiveConversations = useCallback((ids: string[]) => {
    void (async () => {
      const runtimeIds: string[] = []
      for (const id of ids) {
        const runtimeThreadId = threadIdForConversation(id)
        if (runtimeThreadId) runtimeIds.push(runtimeThreadId)
      }
      patchCachedRuntimeThreads(runtimeIds, { archived: true })
      const archivedIdSet = new Set(ids)
      const nextActiveConversationId = activeConversationAfterArchive(archivedIdSet)
      setActiveConversation(userId, nextActiveConversationId)
      if (!nextActiveConversationId) setAgentPanelOpen(false)
      await Promise.all(runtimeIds.map((threadId) => localAgentClient.updateThread(threadId, { archived: true })))
      if (runtimeIds.length > 0) void refetchRuntimeThreads()
    })().catch((error) => {
      void refetchRuntimeThreads()
      console.error('[agent] failed to archive runtime conversations', error)
    })
  }, [activeConversationAfterArchive, patchCachedRuntimeThreads, refetchRuntimeThreads, setActiveConversation, setAgentPanelOpen, threadIdForConversation, userId])

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
  }, [clearConversationRuntimeState, removeRuntimeConversation, userId])

  const handleDeleteConversation = useCallback((id: string) => {
    void (async () => {
      const runtimeThreadId = threadIdForConversation(id)
      if (!runtimeThreadId) {
        removeRuntimeConversation(userId, id)
        clearConversationRuntimeState(id)
        return
      }
      const deletion = await localAgentClient.deleteThread(runtimeThreadId)
      cleanupDeletedRuntimeConversations(id, [deletion.threadId])
      void refetchRuntimeThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete runtime conversation', error)
    })
  }, [cleanupDeletedRuntimeConversations, clearConversationRuntimeState, refetchRuntimeThreads, removeRuntimeConversation, threadIdForConversation, userId])

  const handleSelectConversation = useCallback((id: string) => {
    void (async () => {
      await patchConversationArchiveState(id, false)
      setActiveConversation(userId, id)
    })().catch((error) => {
      console.error('[agent] failed to restore runtime conversation', error)
    })
  }, [patchConversationArchiveState, setActiveConversation, userId])

  useEffect(() => {
    if (!pendingThreadIdToOpen?.trim()) return
    void handleRestoreLocalThread(pendingThreadIdToOpen).finally(() => onPendingThreadHandled?.(pendingThreadIdToOpen))
  }, [handleRestoreLocalThread, onPendingThreadHandled, pendingThreadIdToOpen])

  useEffect(() => {
    void consumeQueuedPanelWorkspaces(consumeAgentPanelWorkspace, {
      userId,
      createConversationForWorkspace: createConversationForPanelWorkspace,
      getActiveConversationId: getActiveRuntimeConversationId,
      setActiveConversation,
      updateConversationTitle,
      attachPageTaskConversation,
    })
      .then((conversationIds) => {
        if (conversationIds.length > 0) onStartupSettled?.()
      })
      .catch((error) => {
        console.error('[agent] failed to consume queued panel workspaces', error)
      })
  }, [attachPageTaskConversation, createConversationForPanelWorkspace, getActiveRuntimeConversationId, onStartupSettled, setActiveConversation, updateConversationTitle, userId])

  useEffect(() => {
    function handleWorkspace(event: Event) {
      const detail = (event as CustomEvent<AgentPanelWorkspacePayload>).detail
      void activateConversationForPanelWorkspace(detail, {
        userId,
        createConversationForWorkspace: createConversationForPanelWorkspace,
        getActiveConversationId: getActiveRuntimeConversationId,
        setActiveConversation,
        updateConversationTitle,
        attachPageTaskConversation,
      })
        .catch((error) => {
          console.error('[agent] failed to activate panel workspace', error)
        })
        .finally(() => onStartupSettled?.())
    }

    window.addEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
    return () => window.removeEventListener(AGENT_PANEL_WORKSPACE_EVENT, handleWorkspace)
  }, [attachPageTaskConversation, createConversationForPanelWorkspace, getActiveRuntimeConversationId, onStartupSettled, setActiveConversation, updateConversationTitle, userId])

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
    clearActiveConversation: () => setActiveConversation(userId, null),
    archiveConversation: handleArchiveConversation,
    archiveConversations: handleArchiveConversations,
    deleteConversation: handleDeleteConversation,
    newConversation: handleNewConversation,
    reorderConversation: () => undefined,
    restoreLocalThread: handleRestoreLocalThread,
    selectConversation: handleSelectConversation,
  }
}

function archiveDuplicateRuntimeConversations(userId: string, keepConversationId: string, threadId: string) {
  void userId
  void keepConversationId
  void threadId
}
