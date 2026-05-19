import { loadRuntimeThreadProjection, type RuntimeThreadHydrationResult } from '@/lib/agentRuntimeThreadHydration'
import { markRuntimeMessagesRestored } from '@/lib/agentRuntimeConversationSync'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import type { AgentThread } from '@/lib/localAgentClient'
import { conversationIdForLocalThread, type AgentConversationRuntimeState } from '@/store/agentSessionStore'
import type { Conversation } from '@/store/agentStore'

export interface RestoreRuntimeThreadDeps {
  userId: string
  conversations: Conversation[]
  sessionState: {
    localThreadIdsByConversation: Record<string, string>
    conversationRuntimes: Record<string, Pick<AgentConversationRuntimeState, 'threadId' | 'updatedAt'>>
  }
  restoredLabel: string
  titleForThread: (thread: AgentThread) => string
  loadProjection?: (threadId: string) => Promise<RuntimeThreadHydrationResult>
  createConversation: (userId: string) => string
  setActiveConversation: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore, 'upsertMessage'>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
}

export interface RestoreRuntimeThreadResult {
  conversationId: string
  threadId: string
  reusedExistingConversation: boolean
  restoredMessageCount: number
}

export async function restoreRuntimeThreadConversation(
  threadId: string,
  deps: RestoreRuntimeThreadDeps,
): Promise<RestoreRuntimeThreadResult> {
  const existingConversationId = existingConversationIdForRuntimeThread(threadId, deps.conversations, deps.sessionState)
  if (existingConversationId) {
    deps.setActiveConversation(deps.userId, existingConversationId)
    return {
      conversationId: existingConversationId,
      threadId,
      reusedExistingConversation: true,
      restoredMessageCount: 0,
    }
  }

  const projection = await (deps.loadProjection ? deps.loadProjection(threadId) : loadRuntimeThreadProjection({ threadId }))
  const conversationId = deps.createConversation(deps.userId)
  deps.updateConversationTitle(deps.userId, conversationId, deps.titleForThread(projection.thread))
  const restoredMessages = markRuntimeMessagesRestored(projection.messages, deps.restoredLabel)
  for (const message of restoredMessages) {
    deps.messageStore.upsertMessage(deps.userId, conversationId, message.id, message)
  }
  deps.setLocalThreadId(conversationId, projection.thread.id)
  deps.setConversationRuntimeThreadId(deps.userId, conversationId, projection.thread.id)
  deps.setActiveConversation(deps.userId, conversationId)
  return {
    conversationId,
    threadId: projection.thread.id,
    reusedExistingConversation: false,
    restoredMessageCount: restoredMessages.length,
  }
}

function existingConversationIdForRuntimeThread(
  threadId: string,
  conversations: Conversation[],
  sessionState: RestoreRuntimeThreadDeps['sessionState'],
): string | undefined {
  const persistedConversationId = conversations.find((conversation) => conversation.runtimeThreadId === threadId)?.id
  const mappedConversationId = persistedConversationId ?? conversationIdForLocalThread({
    threadId,
    localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
    conversationRuntimes: sessionState.conversationRuntimes,
  })
  if (!mappedConversationId) return undefined
  return conversations.some((conversation) => conversation.id === mappedConversationId) ? mappedConversationId : undefined
}
