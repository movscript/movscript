import { loadRuntimeThreadProjection, type RuntimeThreadHydrationResult } from '@/lib/agentRuntimeThreadHydration'
import { mergeRuntimeThreadProjectionMessages, runtimeThreadHydrationKey } from '@/lib/agentRuntimeConversationSync'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import type { ChatMessage } from '@/store/agentStore'

export type RuntimeThreadConversationHydrationStatus = 'hydrated' | 'skipped' | 'cancelled'

export interface HydrateRuntimeThreadConversationDeps {
  loadProjection?: (input: {
    threadId: string
    existingMessages: ChatMessage[]
    signal: AbortSignal
  }) => Promise<RuntimeThreadHydrationResult>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore, 'setConversationMessages'>
}

export async function hydrateRuntimeThreadConversation(input: {
  userId: string
  conversationId: string
  threadId: string
  existingMessages: ChatMessage[]
  hydratedKeys: Set<string>
  signal: AbortSignal
}, deps: HydrateRuntimeThreadConversationDeps): Promise<RuntimeThreadConversationHydrationStatus> {
  const threadId = input.threadId.trim()
  if (!threadId) return 'skipped'
  const hydrateKey = runtimeThreadHydrationKey(input.conversationId, threadId)
  if (input.hydratedKeys.has(hydrateKey)) return 'skipped'
  input.hydratedKeys.add(hydrateKey)
  try {
    const projection = await (deps.loadProjection ?? defaultLoadProjection)({
      threadId,
      existingMessages: input.existingMessages,
      signal: input.signal,
    })
    if (input.signal.aborted) {
      input.hydratedKeys.delete(hydrateKey)
      return 'cancelled'
    }
    deps.setLocalThreadId(input.conversationId, projection.thread.id)
    deps.setConversationRuntimeThreadId(input.userId, input.conversationId, projection.thread.id)
    const title = projection.thread.title?.trim()
    if (title) deps.updateConversationTitle(input.userId, input.conversationId, title)
    deps.messageStore.setConversationMessages(
      input.userId,
      input.conversationId,
      mergeRuntimeThreadProjectionMessages(input.existingMessages, projection),
    )
    return 'hydrated'
  } catch (error) {
    input.hydratedKeys.delete(hydrateKey)
    if (input.signal.aborted) return 'cancelled'
    throw error
  }
}

function defaultLoadProjection(input: {
  threadId: string
  existingMessages: ChatMessage[]
  signal: AbortSignal
}): Promise<RuntimeThreadHydrationResult> {
  return loadRuntimeThreadProjection({
    threadId: input.threadId,
    existingMessages: input.existingMessages,
    signal: input.signal,
  })
}
