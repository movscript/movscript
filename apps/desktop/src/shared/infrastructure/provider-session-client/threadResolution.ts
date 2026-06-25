import type { AgentThread } from '@movscript/agent-protocol'

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
