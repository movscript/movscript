import { localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentSessionSummary, AgentThread, AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

type TranslationFn = (key: string, options?: Record<string, unknown>) => string

export function conversationFromRuntimeThreadSummary(thread: AgentThreadSummary, t: TranslationFn): Conversation {
  const createdAt = Date.parse(thread.createdAt)
  const updatedAt = Date.parse(thread.updatedAt)
  const title = runtimeThreadConversationTitle(thread, t)
  const lastTranscriptAt = thread.lastMessageAt ? Date.parse(thread.lastMessageAt) : Number.NaN
  return {
    id: thread.id,
    title,
    transcriptMessages: [],
    transcriptMessageCount: thread.messageCount,
    ...(Number.isFinite(lastTranscriptAt) ? { lastTranscriptAt } : {}),
    ...(thread.sessionId ? { runtimeSessionId: thread.sessionId } : {}),
    runtimeThreadId: thread.id,
    archived: thread.archived,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}

export function conversationFromRuntimeSessionSummary(session: AgentSessionSummary, t: TranslationFn): Conversation {
  const createdAt = Date.parse(session.createdAt)
  const updatedAt = Date.parse(session.updatedAt)
  return {
    id: session.id,
    title: runtimeSessionConversationTitle(session, t),
    transcriptMessages: [],
    transcriptMessageCount: 0,
    runtimeSessionId: session.id,
    ...(session.rootThreadId ? { runtimeThreadId: session.rootThreadId } : {}),
    archived: session.lifecycle === 'abandoned',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}

export function runtimeSessionConversationTitle(session: Pick<AgentSessionSummary, 'title'>, t: TranslationFn) {
  return typeof session.title === 'string' && session.title.trim() ? session.title.trim() : t('agents.chat.newConversation')
}

export function runtimeThreadConversationTitle(thread: Pick<AgentThreadSummary | AgentThread, 'id' | 'title' | 'metadata'>, t: TranslationFn) {
  const runtimeTitle = thread.metadata?.frontendTitle
  return typeof runtimeTitle === 'string' && runtimeTitle.trim() ? runtimeTitle.trim() : localThreadTitle(thread, t)
}
