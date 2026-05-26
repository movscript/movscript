import { loadRuntimeThreadProjection, type RuntimeThreadHydrationResult } from '@/features/agent/application/agentRuntimeThreadHydration'
import { restoreRuntimeThreadConversation as restoreRuntimeThreadConversationCore } from '@movscript/conversation'
import type {
  AgentConversationMessageStore,
  RestoreRuntimeThreadConversationResult,
} from '@movscript/conversation'
import type { AgentThread } from '@/shared/infrastructure/localAgentClient'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'
import type { ChatMessage, ChatMessageMeta, Conversation } from '@/features/agent/state/agentStore'

export interface RestoreRuntimeThreadDeps {
  userId: string
  conversations: Conversation[]
  getConversations?: () => Conversation[]
  sessionState: {
    localThreadIdsByConversation: Record<string, string>
    sessionIdsByConversation?: Record<string, string>
    conversationRuntimes: Record<string, Pick<AgentConversationRuntimeState, 'sessionId' | 'threadId' | 'updatedAt'>>
  }
  restoredLabel: string
  titleForThread: (thread: AgentThread) => string
  loadProjection?: (threadId: string) => Promise<RuntimeThreadHydrationResult>
  createConversation: (userId: string) => string
  setActiveConversation: (userId: string, conversationId: string) => void
  unarchiveConversation?: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'upsertMessage'>
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
  return restoreRuntimeThreadConversationCore<ChatMessage, ChatMessageMeta, Conversation, AgentThread>(threadId, {
    ...deps,
    loadProjection: (runtimeThreadId) => deps.loadProjection ? deps.loadProjection(runtimeThreadId) : loadRuntimeThreadProjection({ threadId: runtimeThreadId }),
  })
}
