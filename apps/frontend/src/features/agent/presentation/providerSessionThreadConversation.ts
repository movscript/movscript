import { providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentSessionSummary, AgentThread, AgentThreadSummary } from '@movscript/core/agent/protocol'

type TranslationFn = (key: string, options?: Record<string, unknown>) => string

export function conversationFromProviderSessionThreadSummary(thread: AgentThreadSummary, t: TranslationFn): Conversation {
  const createdAt = Date.parse(thread.createdAt)
  const updatedAt = Date.parse(thread.updatedAt)
  const title = providerSessionThreadConversationTitle(thread, t)
  const lastTranscriptAt = thread.lastMessageAt ? Date.parse(thread.lastMessageAt) : Number.NaN
  const providerSessionTreeId = thread.providerSessionTreeId?.trim() || thread.sessionId?.trim()
  return {
    id: thread.id,
    title,
    transcriptMessages: [],
    transcriptMessageCount: thread.messageCount,
    ...(Number.isFinite(lastTranscriptAt) ? { lastTranscriptAt } : {}),
    ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
    providerThreadId: thread.id,
    archived: thread.archived,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}

export function conversationFromProviderSessionSummary(session: AgentSessionSummary, t: TranslationFn): Conversation {
  const createdAt = Date.parse(session.createdAt)
  const updatedAt = Date.parse(session.updatedAt)
  return {
    id: session.id,
    title: providerSessionConversationTitle(session, t),
    transcriptMessages: [],
    transcriptMessageCount: 0,
    providerSessionId: session.id,
    ...(session.rootThreadId ? { providerThreadId: session.rootThreadId } : {}),
    archived: session.lifecycle === 'abandoned',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}

export function providerSessionConversationTitle(session: Pick<AgentSessionSummary, 'title'>, t: TranslationFn) {
  return typeof session.title === 'string' && session.title.trim() ? session.title.trim() : t('agents.chat.newConversation')
}

export function providerSessionThreadConversationTitle(thread: Pick<AgentThreadSummary | AgentThread, 'id' | 'title' | 'metadata'>, t: TranslationFn) {
  const providerSessionTitle = thread.metadata?.frontendTitle
  return typeof providerSessionTitle === 'string' && providerSessionTitle.trim() ? providerSessionTitle.trim() : providerThreadTitle(thread, t)
}
