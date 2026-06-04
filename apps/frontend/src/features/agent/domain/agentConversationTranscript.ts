import { transcriptMessageCount } from '@/features/agent/domain/agentMessageBoundaries'
import type { ChatMessage, Conversation } from '@/features/agent/state/agentStore'

export function conversationWithTimelineTranscript(conversation: Conversation, transcriptMessages: ChatMessage[]): Conversation {
  const lastMessage = transcriptMessages.at(-1)
  return {
    ...conversation,
    transcriptMessages,
    transcriptMessageCount: transcriptMessages.length,
    ...(lastMessage ? { lastTranscriptAt: lastMessage.timestamp } : {}),
  }
}

export function conversationHasTranscriptMessages(conversation: Conversation): boolean {
  return transcriptMessageCount({
    transcriptMessages: conversation.transcriptMessages,
    transcriptMessageCount: conversation.transcriptMessageCount,
  }) > 0
}
