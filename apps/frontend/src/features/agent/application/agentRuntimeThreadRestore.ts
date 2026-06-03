import {
  conversationIdForRuntimeSession,
  conversationIdForRuntimeThread,
  existingConversationIdForRuntimeThread,
  type RestoreRuntimeThreadConversationResult,
} from '@movscript/conversation'
import type { AgentThread } from '@/shared/infrastructure/localAgentClient'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'
import type { Conversation } from '@/features/agent/state/agentStore'

export interface RestoreRuntimeThreadDeps {
  userId: string
  conversations: Conversation[]
  getConversations?: () => Conversation[]
  sessionState: {
    localThreadIdsByConversation: Record<string, string>
    sessionIdsByConversation?: Record<string, string>
    conversationRuntimes: Record<string, Pick<AgentConversationRuntimeState, 'sessionId' | 'threadId' | 'updatedAt'>>
  }
  titleForThread: (thread: AgentThread) => string
  loadThread: (threadId: string) => Promise<AgentThread>
  createRuntimeConversation: (userId: string, input: { threadId: string; sessionId?: string; title?: string }) => string
  setActiveConversation: (userId: string, conversationId: string) => void
  unarchiveConversation?: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationRuntimeSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
}

export type RestoreRuntimeThreadResult = RestoreRuntimeThreadConversationResult

export async function restoreRuntimeThreadConversation(
  threadId: string,
  deps: RestoreRuntimeThreadDeps,
): Promise<RestoreRuntimeThreadResult> {
  const currentConversations = () => deps.getConversations?.() ?? deps.conversations
  const activateConversation = (conversationId: string) => {
    deps.unarchiveConversation?.(deps.userId, conversationId)
    deps.setActiveConversation(deps.userId, conversationId)
  }
  const existingConversationId = existingConversationIdForRuntimeThread(threadId, currentConversations(), deps.sessionState)
  if (existingConversationId) {
    activateConversation(existingConversationId)
    return {
      conversationId: existingConversationId,
      threadId,
      reusedExistingConversation: true,
      restoredMessageCount: 0,
    }
  }

  const thread = await deps.loadThread(threadId)
  const sessionId = thread.sessionId?.trim()
  if (sessionId) {
    const existingSessionConversationId = conversationIdForRuntimeSession({
      sessionId,
      localThreadIdsByConversation: deps.sessionState.localThreadIdsByConversation,
      sessionIdsByConversation: deps.sessionState.sessionIdsByConversation,
      conversationRuntimes: deps.sessionState.conversationRuntimes,
    })
    if (existingSessionConversationId && currentConversations().some((conversation) => conversation.id === existingSessionConversationId)) {
      activateConversation(existingSessionConversationId)
      return {
        conversationId: existingSessionConversationId,
        threadId: thread.id,
        reusedExistingConversation: true,
        restoredMessageCount: 0,
      }
    }
  }
  const existingLoadedThreadConversationId = conversationIdForRuntimeThread({
    threadId: thread.id,
    localThreadIdsByConversation: deps.sessionState.localThreadIdsByConversation,
    conversationRuntimes: deps.sessionState.conversationRuntimes,
  })
  if (existingLoadedThreadConversationId && currentConversations().some((conversation) => conversation.id === existingLoadedThreadConversationId)) {
    activateConversation(existingLoadedThreadConversationId)
    return {
      conversationId: existingLoadedThreadConversationId,
      threadId: thread.id,
      reusedExistingConversation: true,
      restoredMessageCount: 0,
    }
  }

  const title = deps.titleForThread(thread)
  const conversationId = deps.createRuntimeConversation(deps.userId, {
    threadId: thread.id,
    ...(sessionId ? { sessionId } : {}),
    title,
  })
  deps.updateConversationTitle(deps.userId, conversationId, title)
  deps.setLocalThreadId(conversationId, thread.id)
  if (sessionId) {
    deps.setConversationSessionId?.(conversationId, sessionId)
    deps.setConversationRuntimeSessionId?.(deps.userId, conversationId, sessionId)
  }
  deps.setConversationRuntimeThreadId(deps.userId, conversationId, thread.id)
  deps.setActiveConversation(deps.userId, conversationId)
  return {
    conversationId,
    threadId: thread.id,
    reusedExistingConversation: false,
    restoredMessageCount: thread.messages.length,
  }
}
