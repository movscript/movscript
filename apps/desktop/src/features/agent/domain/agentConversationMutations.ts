import type { AgentConversationMutationOptions, AgentConversationTranscriptMessageInput, AgentConversationTranscriptMessageShape } from './agentConversationTypes'
import { defaultId } from './agentConversationUtils'

export function appendConversationTranscriptMessage<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  message: AgentConversationTranscriptMessageInput<Message>,
  options: AgentConversationMutationOptions = {},
): { conversation: Conversation; messageId: string } {
  const messageId = options.createId?.() ?? defaultId()
  const now = options.now?.() ?? Date.now()
  return {
    messageId,
    conversation: {
      ...conversation,
      transcriptMessages: [...conversation.transcriptMessages, { ...message, id: messageId, timestamp: message.timestamp ?? now } as Message],
      updatedAt: now,
    },
  }
}

export function upsertConversationTranscriptMessage<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  message: AgentConversationTranscriptMessageInput<Message>,
  options: AgentConversationMutationOptions = {},
): Conversation {
  const now = options.now?.() ?? Date.now()
  const existingIndex = conversation.transcriptMessages.findIndex((item) => item.id === messageId)
  const nextMessage = {
    ...message,
    id: messageId,
    timestamp: message.timestamp ?? (existingIndex >= 0 ? conversation.transcriptMessages[existingIndex]?.timestamp ?? now : now),
  } as Message
  const transcriptMessages = existingIndex >= 0
    ? conversation.transcriptMessages.map((item, index) => index === existingIndex ? nextMessage : item)
    : [...conversation.transcriptMessages, nextMessage]
  return { ...conversation, transcriptMessages, updatedAt: now }
}

export function replaceConversationTranscriptMessages<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  transcriptMessages: Message[],
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    transcriptMessages,
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function patchConversationTranscriptMessageMeta<
  Message extends AgentConversationTranscriptMessageShape,
  Meta extends NonNullable<Message['meta']>,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  meta: Partial<Meta>,
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    transcriptMessages: conversation.transcriptMessages.map((message) => message.id === messageId
      ? { ...message, meta: { ...message.meta, ...meta } as Message['meta'] }
      : message),
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function removeConversationTranscriptMessage<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    transcriptMessages: conversation.transcriptMessages.filter((message) => message.id !== messageId),
    updatedAt: options.now?.() ?? Date.now(),
  }
}
