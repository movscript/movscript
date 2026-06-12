import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { selectAgentConversationRegistryRecords } from '@movscript/core/agent'

export function useHasOpenAgentConversations(userId: string) {
  const hasActiveConversation = useAgentSessionStore((state) => Boolean(state.activeConversationIdsByUser?.[userId]))
  const hasOpenConversation = useAgentSessionStore((state) => (
    selectAgentConversationRegistryRecords(state.conversationsById, { userId }).length > 0
  ))

  return hasActiveConversation || hasOpenConversation
}
