import { extractAgentTaskArtifacts, type AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { threadResolutionActivityEvent, upsertActivityEvent } from '@/features/agent/application/agentSendActivity'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentRun, AgentThread, RunMessageResult } from '@/shared/infrastructure/providerSessionClient'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface CompleteSendRunResultDeps {
  userId: string
  conversationId: string
  liveEvents: () => ChatRunActivityEvent[]
  setLiveEventsRef: (events: ChatRunActivityEvent[]) => void
  getRun: (runId: string) => Promise<AgentRun>
  setProviderThreadId?: (conversationId: string, threadId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationProviderSessionTreeId?: (conversationId: string, providerSessionTreeId: string) => void
  setConversationProviderSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationProviderThreadBindingId?: (conversationId: string, providerThreadId: string) => void
  setConversationProviderThreadId?: (userId: string, conversationId: string, threadId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setPageTaskRunning: (requestId: string, patch: { conversationId: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setPendingHttpEvents: (events: ChatRunActivityEvent[]) => void
  setPendingAssistantState: (state: AgentThinkingState | null) => void
  setLiveTraceEvents: (events: ChatRunActivityEvent[]) => void
  notifyRunSettled: (input: {
    requestId?: string
    status: 'completed' | 'error' | 'cancelled'
    run: AgentRun
    thread: AgentThread
    artifacts: AgentTaskArtifactRef[]
  }) => void
}

export async function completeSendRunResult(input: {
  workspace: AgentSendWorkspace
  runResult: RunMessageResult
  deps: CompleteSendRunResultDeps
}): Promise<{ run: AgentRun; thread: AgentThread; artifacts: AgentTaskArtifactRef[]; liveEvents: ChatRunActivityEvent[] }> {
  const { workspace, runResult, deps } = input
  const { thread } = runResult
  const run = runResult.run.streamPartial
    ? await deps.getRun(runResult.run.id).catch(() => runResult.run)
    : runResult.run
  const artifacts = extractAgentTaskArtifacts(run)
  const sessionId = thread.sessionId ?? run.sessionId
  if (sessionId) {
    if (deps.setConversationProviderSessionTreeId) deps.setConversationProviderSessionTreeId(deps.conversationId, sessionId)
    else deps.setConversationSessionId?.(deps.conversationId, sessionId)
    deps.setConversationProviderSessionId?.(deps.userId, deps.conversationId, sessionId)
  }
  if (deps.setConversationProviderThreadBindingId) deps.setConversationProviderThreadBindingId(deps.conversationId, thread.id)
  else deps.setProviderThreadId?.(deps.conversationId, thread.id)
  deps.setConversationProviderThreadId?.(deps.userId, deps.conversationId, thread.id)
  if (thread.title?.trim()) {
    deps.updateConversationTitle(deps.userId, deps.conversationId, thread.title.trim())
  }
  if (workspace.providerSession?.requestId) {
    deps.setPageTaskRunning(workspace.providerSession.requestId, { conversationId: deps.conversationId, run, thread, threadId: thread.id, artifacts })
  }
  deps.setConversationRun(deps.conversationId, run, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
  deps.setPendingHttpEvents(settledBridgeActivityEvents(deps.liveEvents()))
  deps.setPendingAssistantState(null)
  const resolutionEvent = threadResolutionActivityEvent(runResult.threadResolution)
  const liveEvents = resolutionEvent
    ? upsertActivityEvent(deps.liveEvents(), resolutionEvent)
    : deps.liveEvents()
  deps.setLiveEventsRef(liveEvents)
  deps.setLiveEventsRef([])
  deps.setLiveTraceEvents([])
  deps.notifyRunSettled({
    ...(workspace.providerSession?.requestId ? { requestId: workspace.providerSession.requestId } : {}),
    status: runtimeSendSettledStatusFromRun(run),
    run,
    thread,
    artifacts,
  })
  return { run, thread, artifacts, liveEvents }
}

function runtimeSendSettledStatusFromRun(run: Pick<AgentRun, 'status'>): 'completed' | 'error' | 'cancelled' {
  if (run.status === 'failed') return 'error'
  if (run.status === 'cancelled') return 'cancelled'
  return 'completed'
}

function settledBridgeActivityEvents(events: ChatRunActivityEvent[]): ChatRunActivityEvent[] {
  return events.filter((event) => {
    if (isModelTelemetryBridgeEvent(event)) return true
    const data = isRecord(event.data) ? event.data : undefined
    const generation = isRecord(data?.generation) ? data.generation : undefined
    if (!generation) return false
    return generation.terminal === true
      || isSettledGenerationLifecycle(generation.status)
      || isSettledGenerationLifecycle(generation.stage)
  })
}

function isModelTelemetryBridgeEvent(event: ChatRunActivityEvent): boolean {
  return event.kind === 'model_call' && (
    event.title === 'Model round started'
    || event.title === 'Model round completed'
    || event.title === 'Model HTTP request sent'
    || event.title === 'Model HTTP response received'
    || event.title === 'Model HTTP call failed'
    || event.title === 'Model retry scheduled'
    || event.title === 'Model HTTP retry scheduled'
  )
}

function isSettledGenerationLifecycle(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return SETTLED_GENERATION_LIFECYCLE_STATUSES.has(value.trim().toLowerCase())
}

const SETTLED_GENERATION_LIFECYCLE_STATUSES = new Set([
  'succeeded',
  'succeed',
  'success',
  'completed',
  'complete',
  'done',
  'finish',
  'finished',
  'failed',
  'failure',
  'error',
  'cancelled',
  'canceled',
  'timeout',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
