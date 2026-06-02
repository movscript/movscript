import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AGENT_PANEL_DRAFT_EVENT, consumeAgentPanelDraft, type AgentPanelDraftPayload } from '@/features/agent/application/agentPanelBridge'
import { activateConversationForPanelDraft, consumeQueuedPanelDrafts } from '@/features/agent/application/agentPanelDraftIntake'
import { loadRuntimeThreadProjection } from '@/features/agent/application/agentRuntimeThreadHydration'
import { restoreRuntimeThreadConversation, type RestoreRuntimeThreadResult } from '@/features/agent/application/agentRuntimeThreadRestore'
import { fetchResourceById } from '@/features/agent/domain/agentMessageViewModel'
import { localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { conversationFromRuntimeThreadSummary } from '@/features/agent/presentation/agentRuntimeThreadConversation'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { localAgentClient, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

export interface UseAgentBuiltinChatControllerOptions {
  userId: string
  pendingThreadIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
}

export function useAgentBuiltinChatController({
  userId,
  pendingThreadIdToOpen,
  onPendingThreadHandled,
}: UseAgentBuiltinChatControllerOptions) {
  const { t } = useTranslation()
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const getActiveConversationId = useAgentSessionStore((s) => s.getActiveConversationId)
  const createRuntimeConversation = useAgentSessionStore((s) => s.createRuntimeConversation)
  const removeRuntimeConversation = useAgentSessionStore((s) => s.removeRuntimeConversation)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const updateConversationTitle = useAgentSessionStore((s) => s.updateConversationTitle)
  const attachPageTaskConversation = useAgentSessionStore((s) => s.attachPageTaskConversation)
  const runtimeThreadProjections = useAgentSessionStore((s) => s.runtimeThreadProjections)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const setConversationSessionId = useAgentSessionStore((s) => s.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((s) => s.setConversationRuntime)
  const setConversationRuntimeSessionId = useAgentSessionStore((s) => s.setConversationRuntimeSessionId)
  const setConversationRuntimeThreadId = useAgentSessionStore((s) => s.setConversationRuntimeThreadId)
  const setRuntimeThreadProjection = useAgentSessionStore((s) => s.setRuntimeThreadProjection)
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
    return runtimeThreads.map((thread) => conversationFromRuntimeThreadSummary(thread, t))
  }, [runtimeThreads, t])
  const conversationsWithRuntimeProjection = useMemo(
    () => conversations.map((conversation) => {
      const projectionMessages = runtimeThreadProjections[conversation.id]?.messages
      return projectionMessages ? { ...conversation, messages: projectionMessages } : conversation
    }),
    [conversations, runtimeThreadProjections],
  )
  const openConversations = useMemo(
    () => conversationsWithRuntimeProjection.filter((conversation) => conversation.archived !== true),
    [conversationsWithRuntimeProjection],
  )
  const archivedConversations = useMemo(
    () => conversationsWithRuntimeProjection
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversationsWithRuntimeProjection],
  )
  const activeConversationId = getActiveConversationId(userId)
  const activeConversation = openConversations.find((conversation) => conversation.id === activeConversationId) ?? null
  const restoringThreadsRef = useRef(new Map<string, Promise<RestoreRuntimeThreadResult>>())
  const activeTask = useMemo(() => {
    if (!activeConversation) return null
    const tasks = Object.values(pageTasks).filter((task) => task.conversationId === activeConversation.id)
    const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'claimed' || task.status === 'running')
    const ordered = (list: typeof tasks) => [...list].sort((a, b) => a.updatedAt - b.updatedAt)
    return ordered(activeTasks).at(-1) ?? ordered(tasks).at(-1) ?? null
  }, [activeConversation?.id, pageTasks])

  const createProvisionalRuntimeConversation = useCallback(async (input: { title?: string; projectId?: number } = {}) => {
    await localAgentClient.ensureRunning()
    const thread = await localAgentClient.startProvisionalConversation({
      title: input.title ?? t('agents.chat.newConversation'),
      ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    })
    const createdAt = Date.parse(thread.createdAt)
    const updatedAt = Date.parse(thread.updatedAt)
    const conversationId = createRuntimeConversation(userId, {
      threadId: thread.id,
      ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
      title: localThreadTitle(thread, t),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    })
    setLocalThreadId(conversationId, thread.id)
    if (thread.sessionId) setConversationSessionId(conversationId, thread.sessionId)
    setConversationRuntime(conversationId, {
      ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
      threadId: thread.id,
      loading: false,
      building: false,
      error: undefined,
    })
    void refetchRuntimeThreads()
    return conversationId
  }, [createRuntimeConversation, refetchRuntimeThreads, setConversationRuntime, setConversationSessionId, setLocalThreadId, t, userId])

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
      restoredLabel: t('agents.chat.panel.runtime.restoredLocalRuntime'),
      titleForThread: (thread) => localThreadTitle(thread, t),
      loadProjection: (id) => loadRuntimeThreadProjection({ threadId: id }, { fetchResourceById }),
      createRuntimeConversation,
      setActiveConversation,
      unarchiveConversation: () => undefined,
      updateConversationTitle,
      setRuntimeThreadProjection,
      setLocalThreadId,
      setConversationSessionId,
      setConversationRuntimeSessionId: (targetUserId, conversationId, sessionId) => {
        setConversationRuntimeSessionId(targetUserId, conversationId, sessionId)
        setConversationSessionId(conversationId, sessionId)
      },
      setConversationRuntimeThreadId,
    }).finally(() => {
      restoringThreadsRef.current.delete(normalizedThreadId)
    })
    restoringThreadsRef.current.set(normalizedThreadId, restorePromise)
    const result = await restorePromise
    void refetchRuntimeThreads()
    archiveDuplicateRuntimeConversations(userId, result.conversationId, result.threadId)
  }, [
    conversations,
    createRuntimeConversation,
    refetchRuntimeThreads,
    setActiveConversation,
    setConversationRuntimeSessionId,
    setConversationRuntimeThreadId,
    setConversationSessionId,
    setLocalThreadId,
    setRuntimeThreadProjection,
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

  const createConversationForPanelDraft = useCallback((payload: AgentPanelDraftPayload) => {
    return createProvisionalRuntimeConversation({
      title: payload.title ?? t('agents.chat.newConversation'),
      ...(typeof payload.projectId === 'number' ? { projectId: payload.projectId } : {}),
    })
  }, [createProvisionalRuntimeConversation, t])

  const patchConversationArchiveState = useCallback(async (conversationId: string, archived: boolean) => {
    const runtimeThreadId = threadIdForConversation(conversationId)
    if (!runtimeThreadId) {
      if (archived) setActiveConversation(userId, null)
      return
    }
    await localAgentClient.updateThread(runtimeThreadId, { archived })
    void refetchRuntimeThreads()
    if (archived && getActiveConversationId(userId) === conversationId) setActiveConversation(userId, null)
  }, [getActiveConversationId, refetchRuntimeThreads, setActiveConversation, threadIdForConversation, userId])

  const handleArchiveConversation = useCallback((id: string) => {
    void patchConversationArchiveState(id, true).catch((error) => {
      console.error('[agent] failed to archive runtime conversation', error)
    })
  }, [patchConversationArchiveState])

  const handleArchiveConversations = useCallback((ids: string[]) => {
    void (async () => {
      const runtimeIds: string[] = []
      for (const id of ids) {
        const runtimeThreadId = threadIdForConversation(id)
        if (runtimeThreadId) runtimeIds.push(runtimeThreadId)
      }
      await Promise.all(runtimeIds.map((threadId) => localAgentClient.updateThread(threadId, { archived: true })))
      if (runtimeIds.length > 0) void refetchRuntimeThreads()
      if (ids.some((id) => getActiveConversationId(userId) === id)) setActiveConversation(userId, null)
    })().catch((error) => {
      console.error('[agent] failed to archive runtime conversations', error)
    })
  }, [getActiveConversationId, refetchRuntimeThreads, setActiveConversation, threadIdForConversation, userId])

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
    void consumeQueuedPanelDrafts(consumeAgentPanelDraft, {
      userId,
      createConversationForDraft: createConversationForPanelDraft,
      getActiveConversationId: getActiveRuntimeConversationId,
      setActiveConversation,
      updateConversationTitle,
      attachPageTaskConversation,
    }).catch((error) => {
      console.error('[agent] failed to consume queued panel drafts', error)
    })
  }, [attachPageTaskConversation, createConversationForPanelDraft, getActiveRuntimeConversationId, setActiveConversation, updateConversationTitle, userId])

  useEffect(() => {
    function handleDraft(event: Event) {
      const detail = (event as CustomEvent<AgentPanelDraftPayload>).detail
      void activateConversationForPanelDraft(detail, {
        userId,
        createConversationForDraft: createConversationForPanelDraft,
        getActiveConversationId: getActiveRuntimeConversationId,
        setActiveConversation,
        updateConversationTitle,
        attachPageTaskConversation,
      }).catch((error) => {
        console.error('[agent] failed to activate panel draft', error)
      })
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
  }, [attachPageTaskConversation, createConversationForPanelDraft, getActiveRuntimeConversationId, setActiveConversation, updateConversationTitle, userId])

  return {
    activeConversation,
    activeTask,
    archivedConversations,
    conversations: openConversations,
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
