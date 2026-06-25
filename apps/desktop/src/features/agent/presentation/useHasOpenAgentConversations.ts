import { selectAgentConversationRegistryRecords } from '@movscript/core/agent'
import {
  useAgentActiveConversationIdsByUser,
  useAgentConversationRecordsById,
} from '@/features/agent/state/agentConversationRegistryStore'

export function useHasOpenAgentConversations(userId: string) {
  const activeConversationIdsByUser = useAgentActiveConversationIdsByUser()
  const conversationsById = useAgentConversationRecordsById()
  const hasActiveConversation = Boolean(activeConversationIdsByUser?.[userId])
  const hasOpenConversation = selectAgentConversationRegistryRecords(conversationsById, { userId }).length > 0

  return hasActiveConversation || hasOpenConversation
}
