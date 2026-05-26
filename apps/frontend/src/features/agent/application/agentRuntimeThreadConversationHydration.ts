import { loadRuntimeThreadProjection, type RuntimeThreadHydrationResult } from '@/features/agent/application/agentRuntimeThreadHydration'
import { mergeRuntimeThreadProjectionMessages, runtimeThreadHydrationKey } from '@movscript/conversation'
import { runHasWorkflowInteraction, upsertWorkflowRunSnapshot } from '@/features/agent/domain/agentWorkflowInteraction'
import type { AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'
import type { AgentConversationMessageStore } from '@movscript/conversation'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

export type RuntimeThreadConversationHydrationStatus = 'hydrated' | 'skipped' | 'cancelled'

export interface HydrateRuntimeThreadConversationDeps {
  loadProjection?: (input: {
    threadId: string
    sessionId?: string
    existingMessages: ChatMessage[]
    signal: AbortSignal
  }) => Promise<RuntimeThreadHydrationResult>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationRuntimeSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  setConversationRun?: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setSubmittedInteractionRuns?: (updater: (current: AgentRun[]) => AgentRun[]) => void
  setRuntimeStatusLight?: (status: AgentRuntimeStatusLight) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'setConversationMessages'>
}

export async function hydrateRuntimeThreadConversation(input: {
  userId: string
  conversationId: string
  threadId: string
  sessionId?: string
  existingMessages: ChatMessage[]
  hydratedKeys: Set<string>
  signal: AbortSignal
  force?: boolean
}, deps: HydrateRuntimeThreadConversationDeps): Promise<RuntimeThreadConversationHydrationStatus> {
  const threadId = input.threadId.trim()
  if (!threadId) return 'skipped'
  const sessionId = input.sessionId?.trim()
  const hydrateKey = runtimeThreadHydrationKey(input.conversationId, sessionId ? `${sessionId}:${threadId}` : threadId)
  if (!input.force && input.hydratedKeys.has(hydrateKey)) return 'skipped'
  input.hydratedKeys.add(hydrateKey)
  try {
    const projection = await (deps.loadProjection ?? defaultLoadProjection)({
      threadId,
      ...(sessionId ? { sessionId } : {}),
      existingMessages: input.existingMessages,
      signal: input.signal,
    })
    if (input.signal.aborted) {
      input.hydratedKeys.delete(hydrateKey)
      return 'cancelled'
    }
    deps.setLocalThreadId(input.conversationId, projection.thread.id)
    const projectionSessionId = projection.thread.sessionId?.trim()
    if (projectionSessionId) {
      deps.setConversationSessionId?.(input.conversationId, projectionSessionId)
      deps.setConversationRuntimeSessionId?.(input.userId, input.conversationId, projectionSessionId)
    }
    deps.setConversationRuntimeThreadId(input.userId, input.conversationId, projection.thread.id)
    if (projection.currentRun) {
      const currentRunActive = projection.currentRun.status === 'queued' || projection.currentRun.status === 'in_progress'
      deps.setConversationRun?.(input.conversationId, projection.currentRun, {
        loading: currentRunActive,
        building: false,
        approving: false,
        stopping: false,
        stopRequested: false,
      })
    }
    const interactionRuns = projection.runs.filter(runHasWorkflowInteraction)
    if (interactionRuns.length > 0) {
      deps.setSubmittedInteractionRuns?.((current) => interactionRuns.reduce(upsertWorkflowRunSnapshot, current))
    }
    deps.setRuntimeStatusLight?.(projection.runtimeStatusLight)
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
  sessionId?: string
  existingMessages: ChatMessage[]
  signal: AbortSignal
}): Promise<RuntimeThreadHydrationResult> {
  return loadRuntimeThreadProjection({
    threadId: input.threadId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    existingMessages: input.existingMessages,
    signal: input.signal,
  })
}
