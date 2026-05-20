import { useEffect, useRef } from 'react'
import { fetchResourceById } from '@/lib/agentMessageViewModel'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import { loadRuntimeThreadProjection } from '@/lib/agentRuntimeThreadHydration'
import { hydrateRuntimeThreadConversation } from '@/lib/agentRuntimeThreadConversationHydration'
import type { AgentRun } from '@/lib/localAgentClient'
import { useAgentStore, type ChatMessage } from '@/store/agentStore'

export interface UseAgentRuntimeThreadHydrationInput {
  userId: string
  conversationId: string
  conversationMessages: ChatMessage[]
  localThreadId: string
  loading: boolean
  building: boolean
  runtimeLoading?: boolean
  runtimeBuilding?: boolean
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore, 'setConversationMessages'>
}

export function useAgentRuntimeThreadHydration({
  userId,
  conversationId,
  conversationMessages,
  localThreadId,
  loading,
  building,
  runtimeLoading,
  runtimeBuilding,
  setLocalThreadId,
  setConversationRuntimeThreadId,
  setConversationRun,
  updateConversationTitle,
  messageStore,
}: UseAgentRuntimeThreadHydrationInput) {
  const hydratedRuntimeThreadKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const threadId = localThreadId.trim()
    if (!threadId) return
    if (loading || building || runtimeLoading || runtimeBuilding) return
    const controller = new AbortController()
    const existingMessages = useAgentStore.getState().getConversations(userId).find((item) => item.id === conversationId)?.messages ?? conversationMessages
    void hydrateRuntimeThreadConversation({
      userId,
      conversationId,
      threadId,
      existingMessages,
      hydratedKeys: hydratedRuntimeThreadKeysRef.current,
      signal: controller.signal,
    }, {
      loadProjection: (input) => loadRuntimeThreadProjection({
        threadId: input.threadId,
        existingMessages: input.existingMessages,
        signal: input.signal,
      }, {
        fetchResourceById,
      }),
      setLocalThreadId,
      setConversationRuntimeThreadId,
      setConversationRun,
      updateConversationTitle,
      messageStore,
    }).catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [
    building,
    conversationId,
    conversationMessages,
    loading,
    localThreadId,
    messageStore,
    runtimeBuilding,
    runtimeLoading,
    setConversationRuntimeThreadId,
    setConversationRun,
    setLocalThreadId,
    updateConversationTitle,
    userId,
  ])
}
