import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AGENT_PANEL_DRAFT_EVENT, consumeAgentPanelDraft, type AgentPanelDraftPayload } from '@/lib/agentPanelBridge'
import { activateConversationForPanelDraft, consumeQueuedPanelDrafts } from '@/lib/agentPanelDraftIntake'
import { loadRuntimeThreadProjection } from '@/lib/agentRuntimeThreadHydration'
import { restoreRuntimeThreadConversation } from '@/lib/agentRuntimeThreadRestore'
import { fetchResourceById } from '@/lib/agentMessageViewModel'
import { localThreadTitle } from '@/components/agent/AgentConversationList'
import { useAgentStore } from '@/store/agentStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'

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
    deleteConversation: deleteAgentConversation,
    deleteConversations: deleteAgentConversations,
    upsertMessage,
    setConversationRuntimeThreadId,
    updateConversationTitle,
  } = useAgentStore()
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const attachPageTaskConversation = useAgentSessionStore((s) => s.attachPageTaskConversation)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null
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
    const sessionState = useAgentSessionStore.getState()
    await restoreRuntimeThreadConversation(threadId, {
      userId,
      conversations,
      sessionState: {
        localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
        conversationRuntimes: sessionState.conversationRuntimes,
      },
      restoredLabel: t('agents.chat.panel.runtime.restoredLocalRuntime'),
      titleForThread: (thread) => localThreadTitle(thread, t),
      loadProjection: (id) => loadRuntimeThreadProjection({ threadId: id }, { fetchResourceById }),
      createConversation,
      setActiveConversation,
      updateConversationTitle,
      messageStore: {
        upsertMessage,
      },
      setLocalThreadId,
      setConversationRuntimeThreadId,
    })
  }, [
    conversations,
    createConversation,
    setActiveConversation,
    setConversationRuntimeThreadId,
    setLocalThreadId,
    t,
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
    conversations,
    clearActiveConversation: () => setActiveConversation(userId, null),
    deleteConversation: (id: string) => deleteAgentConversation(userId, id),
    deleteConversations: (ids: string[]) => deleteAgentConversations(userId, ids),
    newConversation: handleNewConversation,
    restoreLocalThread: handleRestoreLocalThread,
    selectConversation: (id: string) => setActiveConversation(userId, id),
  }
}
