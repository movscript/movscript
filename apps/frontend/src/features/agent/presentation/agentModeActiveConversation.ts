import { isAgentChatDraftConversationId } from '@/features/agent/presentation/agentChatDataSourceShellModel'

export function shouldRestoreProjectAgentActiveConversation(input: {
  activeConversationId: string | null
  activeConversationOpen: boolean
}): boolean {
  if (input.activeConversationOpen) return false
  if (isAgentChatDraftConversationId(input.activeConversationId)) return false
  return true
}
