import { extractAgentTaskArtifacts, type AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import { loadRuntimeThreadProjection } from '@/lib/agentRuntimeThreadHydration'
import { mergeRuntimeThreadProjectionMessages } from '@/lib/agentRuntimeConversationSync'
import { threadResolutionActivityEvent, upsertActivityEvent } from '@/lib/agentSendActivity'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { AgentMessage, AgentRun, AgentThread, RunMessageResult } from '@/lib/localAgentClient'
import type { RawResource } from '@/types'
import type { AgentLivePendingAssistantState } from './agentLiveRunActivity'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'

export interface CompleteSendRunResultDeps {
  userId: string
  conversationId: string
  localUserMessageId: string
  conversationMessages: ChatMessage[]
  liveEvents: () => ChatRunActivityEvent[]
  setLiveEventsRef: (events: ChatRunActivityEvent[]) => void
  getRun: (runId: string) => Promise<AgentRun>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  messageStore: Pick<AgentConversationMessageStore, 'updateMessageMeta' | 'setConversationMessages'>
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setPageTaskRunning: (requestId: string, patch: { conversationId: string; run?: AgentRun; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setPendingHttpEvents: (events: ChatRunActivityEvent[]) => void
  setPendingAssistantState: (state: AgentLivePendingAssistantState | null) => void
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  getExistingMessages: () => ChatMessage[]
  setLiveTraceEvents: (events: ChatRunActivityEvent[]) => void
  fetchResourceById: (id: number) => Promise<RawResource | undefined>
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
  draft: AgentSendDraft
  runResult: RunMessageResult
  deps: CompleteSendRunResultDeps
}): Promise<{ run: AgentRun; thread: AgentThread; artifacts: AgentTaskArtifactRef[]; liveEvents: ChatRunActivityEvent[] }> {
  const { draft, runResult, deps } = input
  const { thread } = runResult
  const run = runResult.run.streamPartial
    ? await deps.getRun(runResult.run.id).catch(() => runResult.run)
    : runResult.run
  const artifacts = extractAgentTaskArtifacts(run)
  if (!draft.localRuntime?.diagnosticCommand) {
    deps.setLocalThreadId(deps.conversationId, thread.id)
    deps.setConversationRuntimeThreadId(deps.userId, deps.conversationId, thread.id)
  }
  if (runResult.sourceMessage) {
    deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, deps.localUserMessageId, {
      runtimeMessage: runtimeMessageRef(runResult.sourceMessage, run),
    })
  }
  if (!draft.localRuntime?.diagnosticCommand && thread.title?.trim()) {
    deps.updateConversationTitle(deps.userId, deps.conversationId, thread.title.trim())
  }
  if (draft.localRuntime?.requestId) {
    deps.setPageTaskRunning(draft.localRuntime.requestId, { conversationId: deps.conversationId, run, threadId: thread.id, artifacts })
  }
  deps.setConversationRun(deps.conversationId, run, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
  deps.setPendingHttpEvents([])
  deps.setPendingAssistantState(null)
  const resolutionEvent = threadResolutionActivityEvent(runResult.threadResolution)
  const liveEvents = resolutionEvent
    ? upsertActivityEvent(deps.liveEvents(), resolutionEvent)
    : deps.liveEvents()
  deps.setLiveEventsRef(liveEvents)
  await deps.appendAssistantRunResult(run, thread, liveEvents)
  if (!draft.localRuntime?.diagnosticCommand) {
    const existingMessages = deps.getExistingMessages()
    const projection = await loadRuntimeThreadProjection({
      threadId: thread.id,
      thread,
      ensureRuns: [run],
      existingMessages,
      liveEventsByRunId: { [run.id]: liveEvents },
    }, {
      fetchRunTraceEvents: async () => [],
      fetchResourceById: deps.fetchResourceById,
    })
    deps.messageStore.setConversationMessages(deps.userId, deps.conversationId, mergeRuntimeThreadProjectionMessages(existingMessages, projection))
  }
  deps.setLiveEventsRef([])
  deps.setLiveTraceEvents([])
  if (deps.runTouchesAgentCatalog(run)) deps.refreshAgentCatalogContext()
  deps.notifyRunSettled({
    ...(draft.localRuntime?.requestId ? { requestId: draft.localRuntime.requestId } : {}),
    status: panelRunSettledStatusFromRun(run),
    run,
    thread,
    artifacts,
  })
  return { run, thread, artifacts, liveEvents }
}

function runtimeMessageRef(sourceMessage: AgentMessage, run: AgentRun) {
  return {
    threadId: sourceMessage.threadId,
    messageId: sourceMessage.id,
    runId: run.id,
  }
}

function panelRunSettledStatusFromRun(run: AgentRun): 'completed' | 'error' | 'cancelled' {
  if (run.status === 'failed') return 'error'
  if (run.status === 'cancelled') return 'cancelled'
  return 'completed'
}
