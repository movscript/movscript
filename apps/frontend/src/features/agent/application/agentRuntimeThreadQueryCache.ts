import type { QueryClient } from '@tanstack/react-query'
import { localAgentClient, type AgentThread, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

export function runtimeThreadSummaryFromThread(thread: AgentThread): AgentThreadSummary {
  return {
    ...thread,
    archived: thread.archived === true,
    messageCount: thread.messages?.length ?? 0,
  }
}

export function upsertCachedLocalAgentThread(queryClient: QueryClient, thread: AgentThreadSummary) {
  queryClient.setQueriesData<AgentThreadSummary[]>({
    predicate: (query) => Array.isArray(query.queryKey)
      && query.queryKey[0] === 'local-agent-threads'
      && query.queryKey[1] === localAgentClient.baseURL,
  }, (threads) => {
    if (!threads) return [thread]
    const existing = threads.some((item) => item.id === thread.id)
    if (!existing) return [thread, ...threads]
    return threads.map((item) => item.id === thread.id ? { ...item, ...thread } : item)
  })
}
