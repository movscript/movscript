import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AGENT_PANEL_DRAFT_EVENT, consumeAgentPanelDraft, type AgentPanelDraftPayload } from '@/features/agent/application/agentPanelBridge'
import { activateConversationForPanelDraft, consumeQueuedPanelDrafts } from '@/features/agent/application/agentPanelDraftIntake'
import { loadRuntimeThreadProjection } from '@/features/agent/application/agentRuntimeThreadHydration'
import { restoreRuntimeThreadConversation, type RestoreRuntimeThreadResult } from '@/features/agent/application/agentRuntimeThreadRestore'
import { fetchResourceById } from '@/features/agent/domain/agentMessageViewModel'
import { localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

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
  const {
    getConversations,
    getActiveConversationId,
    createConversation,
    setActiveConversation,
    archiveConversation,
    archiveConversations,
    unarchiveConversation,
    reorderConversation: reorderAgentConversation,
    upsertMessage,
    setConversationRuntimeSessionId,
    setConversationRuntimeThreadId,
    updateConversationTitle,
  } = useAgentStore()
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const attachPageTaskConversation = useAgentSessionStore((s) => s.attachPageTaskConversation)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const setConversationSessionId = useAgentSessionStore((s) => s.setConversationSessionId)

  const conversations = getConversations(userId)
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
  const activeTask = useMemo(() => {
    if (!activeConversation) return null
    const tasks = Object.values(pageTasks).filter((task) => task.conversationId === activeConversation.id)
    const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'claimed' || task.status === 'running')
    const ordered = (list: typeof tasks) => [...list].sort((a, b) => a.updatedAt - b.updatedAt)
    return ordered(activeTasks).at(-1) ?? ordered(tasks).at(-1) ?? null
  }, [activeConversation?.id, pageTasks])

  const handleNewConversation = useCallback(() => {
    createConversation(userId)
  }, [createConversation, userId])

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
      conversations: getConversations(userId),
      getConversations: () => useAgentStore.getState().getConversations(userId),
      sessionState: {
        localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
        sessionIdsByConversation: sessionState.sessionIdsByConversation,
        conversationRuntimes: sessionState.conversationRuntimes,
      },
      restoredLabel: t('agents.chat.panel.runtime.restoredLocalRuntime'),
      titleForThread: (thread) => localThreadTitle(thread, t),
      loadProjection: (id) => loadRuntimeThreadProjection({ threadId: id }, { fetchResourceById }),
      createConversation,
      setActiveConversation,
      unarchiveConversation,
      updateConversationTitle,
      messageStore: {
        upsertMessage,
      },
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
    archiveDuplicateRuntimeConversations(userId, result.conversationId, result.threadId)
  }, [
    createConversation,
    getConversations,
    setActiveConversation,
    setConversationRuntimeSessionId,
    setConversationRuntimeThreadId,
    setConversationSessionId,
    setLocalThreadId,
    t,
    unarchiveConversation,
    updateConversationTitle,
    upsertMessage,
    userId,
  ])

  useEffect(() => {
    if (!pendingThreadIdToOpen?.trim()) return
    void handleRestoreLocalThread(pendingThreadIdToOpen).finally(() => onPendingThreadHandled?.(pendingThreadIdToOpen))
  }, [handleRestoreLocalThread, onPendingThreadHandled, pendingThreadIdToOpen])

  useEffect(() => {
    consumeQueuedPanelDrafts(consumeAgentPanelDraft, {
      userId,
      createConversation,
      getActiveConversationId,
      setActiveConversation,
      updateConversationTitle,
      attachPageTaskConversation,
    })
  }, [attachPageTaskConversation, createConversation, getActiveConversationId, setActiveConversation, updateConversationTitle, userId])

  useEffect(() => {
    function handleDraft(event: Event) {
      const detail = (event as CustomEvent<AgentPanelDraftPayload>).detail
      activateConversationForPanelDraft(detail, {
        userId,
        createConversation,
        getActiveConversationId,
        setActiveConversation,
        updateConversationTitle,
        attachPageTaskConversation,
      })
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
  }, [attachPageTaskConversation, createConversation, getActiveConversationId, setActiveConversation, updateConversationTitle, userId])

  return {
    activeConversation,
    activeTask,
    archivedConversations,
    conversations: openConversations,
    clearActiveConversation: () => setActiveConversation(userId, null),
    deleteConversation: (id: string) => archiveConversation(userId, id),
    deleteConversations: (ids: string[]) => archiveConversations(userId, ids),
    newConversation: handleNewConversation,
    reorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => reorderAgentConversation(userId, draggedId, targetId, position),
    restoreLocalThread: handleRestoreLocalThread,
    selectConversation: (id: string) => {
      unarchiveConversation(userId, id)
      setActiveConversation(userId, id)
    },
  }
}

function archiveDuplicateRuntimeConversations(userId: string, keepConversationId: string, threadId: string) {
  const agentStore = useAgentStore.getState()
  const sessionStore = useAgentSessionStore.getState()
  const conversations = agentStore.getConversations(userId)
  const keepConversation = conversations.find((conversation) => conversation.id === keepConversationId)
  const keepSessionId = keepConversation
    ? sessionStore.sessionIdsByConversation[keepConversation.id] ?? keepConversation.runtimeSessionId ?? sessionStore.conversationRuntimes[keepConversation.id]?.sessionId
    : undefined
  const duplicateIds = conversations
    .filter((conversation) => conversation.id !== keepConversationId && conversation.archived !== true)
    .filter((conversation) => {
      const candidateThreadId = sessionStore.localThreadIdsByConversation[conversation.id]
        ?? conversation.runtimeThreadId
        ?? sessionStore.conversationRuntimes[conversation.id]?.threadId
      if (candidateThreadId === threadId) return true
      const candidateSessionId = sessionStore.sessionIdsByConversation[conversation.id]
        ?? conversation.runtimeSessionId
        ?? sessionStore.conversationRuntimes[conversation.id]?.sessionId
      return !!keepSessionId && candidateSessionId === keepSessionId
    })
    .map((conversation) => conversation.id)
  if (duplicateIds.length > 0) agentStore.archiveConversations(userId, duplicateIds)
}
