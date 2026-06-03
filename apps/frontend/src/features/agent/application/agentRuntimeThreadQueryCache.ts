import type { QueryClient } from '@tanstack/react-query'
import { isAgentUiOnlyAssistantMessage } from '@movscript/protocol'
import { localAgentClient, type AgentThread, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'

type StartProvisionalConversationInput = Parameters<typeof localAgentClient.startProvisionalConversation>[0]

const pendingProvisionalConversations = new Map<string, Promise<AgentThread>>()

export function runtimeThreadSummaryFromThread(thread: AgentThread): AgentThreadSummary {
  const transcriptMessages = thread.messages?.filter(isRuntimeThreadSummaryTranscriptMessage) ?? []
  const lastMessage = transcriptMessages.at(-1)
  return {
    ...thread,
    archived: thread.archived === true,
    messageCount: transcriptMessages.length,
    ...(lastMessage ? { lastMessageAt: lastMessage.createdAt } : {}),
  }
}

function isRuntimeThreadSummaryTranscriptMessage(message: AgentThread['messages'][number]): boolean {
  return !isAgentUiOnlyAssistantMessage(message)
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

export async function startSharedProvisionalConversation(input: StartProvisionalConversationInput = {}): Promise<AgentThread> {
  const key = provisionalConversationKey(input)
  const pending = pendingProvisionalConversations.get(key)
  if (pending) return pending

  const promise = (async () => {
    await localAgentClient.ensureRunning()
    return localAgentClient.startProvisionalConversation(input)
  })().finally(() => {
    pendingProvisionalConversations.delete(key)
  })
  pendingProvisionalConversations.set(key, promise)
  return promise
}

function provisionalConversationKey(input: StartProvisionalConversationInput = {}) {
  return JSON.stringify({
    title: input.title?.trim() ?? '',
    projectId: typeof input.projectId === 'number' ? input.projectId : null,
    expiresAt: input.expiresAt ?? null,
  })
}
