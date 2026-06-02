import { localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

type TranslationFn = (key: string, options?: Record<string, unknown>) => string

export function conversationFromRuntimeThreadSummary(thread: AgentThreadSummary, t: TranslationFn): Conversation {
  const createdAt = Date.parse(thread.createdAt)
  const updatedAt = Date.parse(thread.updatedAt)
  return {
    id: thread.id,
    title: localThreadTitle(thread, t),
    messages: [],
    ...(thread.sessionId ? { runtimeSessionId: thread.sessionId } : {}),
    runtimeThreadId: thread.id,
    archived: thread.archived,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}
