import type { ChatMessage, ChatMessageMeta } from '@/store/agentStore'

export interface AgentConversationMessageStore {
  addMessage: (userId: string, conversationId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => string
  upsertMessage: (userId: string, conversationId: string, messageId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => void
  removeMessage: (userId: string, conversationId: string, messageId: string) => void
  updateMessageMeta: (userId: string, conversationId: string, messageId: string, meta: ChatMessageMeta) => void
  setConversationMessages: (userId: string, conversationId: string, messages: ChatMessage[]) => void
  clearConversationDraft: (userId: string, conversationId: string) => void
}
