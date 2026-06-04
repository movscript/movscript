import { useEffect, useState } from 'react'
import {
  AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT,
  hasOpenAgentConversationRecords,
  readAgentConversationOpenState,
} from '@/features/agent/presentation/agentConversationOpenOrder'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

export function useHasOpenAgentConversations(userId: string) {
  const hasActiveConversation = useAgentSessionStore((state) => Boolean(state.activeConversationIdsByUser?.[userId]))
  const [hasPersistedOpenConversation, setHasPersistedOpenConversation] = useState(() => readHasOpenConversations(userId))

  useEffect(() => {
    let pendingUpdate: number | undefined
    const schedulePersistedOpenConversationUpdate = () => {
      if (pendingUpdate !== undefined) return
      pendingUpdate = window.setTimeout(() => {
        pendingUpdate = undefined
        setHasPersistedOpenConversation(readHasOpenConversations(userId))
      }, 0)
    }

    setHasPersistedOpenConversation(readHasOpenConversations(userId))

    function handleOpenStateChanged(event: Event) {
      const detailUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId
      if (detailUserId !== undefined && detailUserId !== userId) return
      schedulePersistedOpenConversationUpdate()
    }

    window.addEventListener(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, handleOpenStateChanged)
    window.addEventListener('storage', handleOpenStateChanged)
    return () => {
      if (pendingUpdate !== undefined) window.clearTimeout(pendingUpdate)
      window.removeEventListener(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, handleOpenStateChanged)
      window.removeEventListener('storage', handleOpenStateChanged)
    }
  }, [userId])

  return hasActiveConversation || hasPersistedOpenConversation
}

function readHasOpenConversations(userId: string) {
  return hasOpenAgentConversationRecords(readAgentConversationOpenState(userId))
}
