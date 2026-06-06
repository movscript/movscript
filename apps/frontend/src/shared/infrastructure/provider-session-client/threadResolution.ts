import type { AgentThread } from '@/features/agent/domain/agentProtocol'

export function minimalResolvedThread(threadId: string): AgentThread {
  const now = new Date().toISOString()
  return {
    id: threadId,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}
