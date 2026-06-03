import { extractAgentTaskArtifacts, type AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { threadResolutionActivityEvent, upsertActivityEvent } from '@/features/agent/application/agentSendActivity'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentRun, AgentThread, RunMessageResult } from '@/shared/infrastructure/localAgentClient'
import type { AgentLivePendingAssistantState } from '@/features/agent/presentation/agentLiveRunActivity'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface CompleteSendRunResultDeps {
  userId: string
  conversationId: string
  liveEvents: () => ChatRunActivityEvent[]
  setLiveEventsRef: (events: ChatRunActivityEvent[]) => void
  getRun: (runId: string) => Promise<AgentRun>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationRuntimeSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setPageTaskRunning: (requestId: string, patch: { conversationId: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setPendingHttpEvents: (events: ChatRunActivityEvent[]) => void
  setPendingAssistantState: (state: AgentLivePendingAssistantState | null) => void
  setLiveTraceEvents: (events: ChatRunActivityEvent[]) => void
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
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
    deps.setConversationSessionId?.(deps.conversationId, sessionId)
    deps.setConversationRuntimeSessionId?.(deps.userId, deps.conversationId, sessionId)
  }
  deps.setLocalThreadId(deps.conversationId, thread.id)
  deps.setConversationRuntimeThreadId(deps.userId, deps.conversationId, thread.id)
  if (thread.title?.trim()) {
    deps.updateConversationTitle(deps.userId, deps.conversationId, thread.title.trim())
  }
  if (workspace.localRuntime?.requestId) {
    deps.setPageTaskRunning(workspace.localRuntime.requestId, { conversationId: deps.conversationId, run, thread, threadId: thread.id, artifacts })
  }
  deps.setConversationRun(deps.conversationId, run, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
  deps.setPendingHttpEvents([])
  deps.setPendingAssistantState(null)
  const resolutionEvent = threadResolutionActivityEvent(runResult.threadResolution)
  const liveEvents = resolutionEvent
    ? upsertActivityEvent(deps.liveEvents(), resolutionEvent)
    : deps.liveEvents()
  deps.setLiveEventsRef(liveEvents)
  deps.setLiveEventsRef([])
  deps.setLiveTraceEvents([])
  if (deps.runTouchesAgentCatalog(run)) deps.refreshAgentCatalogContext()
  deps.notifyRunSettled({
    ...(workspace.localRuntime?.requestId ? { requestId: workspace.localRuntime.requestId } : {}),
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
