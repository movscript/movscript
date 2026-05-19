import { mergeProjectedRuntimeMessages } from '@/lib/agentThreadProjection'
import type { ChatMessage } from '@/store/agentStore'

export interface RuntimeConversationProjection {
  thread: {
    id: string
  }
  messages: ChatMessage[]
}

export function runtimeThreadHydrationKey(conversationId: string, threadId: string): string {
  return `${conversationId}:${threadId}`
}

export function mergeRuntimeThreadProjectionMessages(existingMessages: ChatMessage[], projection: RuntimeConversationProjection): ChatMessage[] {
  return mergeProjectedRuntimeMessages(existingMessages, projection.messages, projection.thread.id)
}

export function markRuntimeMessagesRestored(messages: ChatMessage[], restoredLabel: string): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    meta: {
      ...message.meta,
      contextLabels: [
        restoredLabel,
        ...(message.meta?.contextLabels ?? []),
      ],
    },
  }))
}
