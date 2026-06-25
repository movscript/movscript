import { transcriptMessageCount } from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentChatMessage } from '@movscript/agent-protocol'

export interface AgentLegacyConversationTabTranscript {
  transcriptMessageCount?: number
  transcriptMessages: Array<Pick<AgentChatMessage, 'role' | 'meta'>>
}

export function legacyConversationTabMessageCount(conversation: AgentLegacyConversationTabTranscript): number {
  return transcriptMessageCount(conversation)
}
