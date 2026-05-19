import { extractAgentTaskArtifacts } from '@/lib/agentArtifacts'
import { generationProgressFromEvents } from '@/lib/agentGenerationMedia'
import { isStoppableAgentRun, isTerminalAgentRun, type RunControlRuntimePatch } from '@/lib/agentRunControl'
import type { AgentLivePendingAssistantState } from '@/lib/agentLiveRunActivity'
import { setActivityEventStatus } from '@/lib/agentSendActivity'
import type { AgentRun, AgentRunStreamEvent } from '@/lib/localAgentClient'
import type { AgentPageTaskState } from '@/store/agentSessionStore'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export interface AgentSendRunUpdateDeps {
  conversationId: string
  requestId?: string
  liveEvents: () => ChatRunActivityEvent[]
  cancelledRunIds: Set<string>
  getConversationRuntime: () => { stopRequested?: boolean } | undefined
  setPendingAssistantState: (value: AgentLivePendingAssistantState | null | ((current: AgentLivePendingAssistantState | null) => AgentLivePendingAssistantState | null)) => void
  thinkingStateForRun: (run: AgentRun) => AgentLivePendingAssistantState
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
  setPageTaskRunning: (requestId: string, patch: Partial<AgentPageTaskState>) => void
  setConversationRun: (run: AgentRun, patch: RunControlRuntimePatch & { approving?: boolean }) => void
  setConversationRuntime: (patch: RunControlRuntimePatch) => void
  cancelGenerationJobIfActive: (state: ReturnType<typeof generationProgressFromEvents>) => void
  cancelRun: (runId: string, input: { reason?: string }) => Promise<AgentRun>
  getRun: (runId: string) => Promise<AgentRun>
}

export interface AgentSendStreamEventDeps {
  updateConversationTitle: (title: string) => void
  updateActivityEvents: (updater: (events: ChatRunActivityEvent[]) => ChatRunActivityEvent[]) => void
  recordLiveTraceEvent: (event: AgentRunStreamEvent) => void
  now?: () => Date
}

export function handleSendRunUpdate(nextRun: AgentRun, deps: AgentSendRunUpdateDeps): void {
  const artifacts = extractAgentTaskArtifacts(nextRun)
  if (nextRun.status === 'in_progress' || nextRun.status === 'queued') {
    const nextThinkingState = deps.thinkingStateForRun(nextRun)
    deps.setPendingAssistantState((current) =>
      current?.status === 'preparing_tool_call' && nextThinkingState.status === 'thinking'
        ? current
        : nextThinkingState
    )
  } else if (isTerminalAgentRun(nextRun)) {
    deps.setPendingAssistantState(null)
  }
  if (deps.runTouchesAgentCatalog(nextRun)) deps.refreshAgentCatalogContext()
  if (deps.requestId) {
    deps.setPageTaskRunning(deps.requestId, {
      conversationId: deps.conversationId,
      run: nextRun,
      threadId: nextRun.threadId,
      ...(artifacts.length > 0 ? { artifacts } : {}),
    })
  }
  deps.setConversationRun(nextRun, {
    loading: true,
    building: false,
  })

  const nextRuntime = deps.getConversationRuntime()
  if (!nextRuntime?.stopRequested || !isStoppableAgentRun(nextRun) || deps.cancelledRunIds.has(nextRun.id)) return

  deps.cancelledRunIds.add(nextRun.id)
  deps.cancelGenerationJobIfActive(generationProgressFromEvents(deps.liveEvents()))
  void deps.cancelRun(nextRun.id, { reason: '用户停止了当前会话。' })
    .then((cancelledRun) => {
      const finishedBeforeCancel = isTerminalAgentRun(cancelledRun) && cancelledRun.status !== 'cancelled'
      deps.setConversationRun(cancelledRun, {
        loading: finishedBeforeCancel ? false : true,
        building: false,
        approving: false,
        stopping: finishedBeforeCancel ? false : true,
        stopRequested: false,
      })
    })
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/already finished/i.test(message)) {
        const latestRun = await deps.getRun(nextRun.id).catch(() => undefined)
        if (latestRun) {
          deps.setConversationRun(latestRun, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
        }
      }
    })
    .finally(() => {
      deps.setConversationRuntime({ stopRequested: false, stopping: false, loading: false })
    })
}

export function handleSendStreamEvent(event: AgentRunStreamEvent, deps: AgentSendStreamEventDeps): void {
  if (event.type === 'thread_title' && event.title.trim()) {
    deps.updateConversationTitle(event.title.trim())
  }
  if (event.type === 'run' && event.run?.id) {
    const completedAt = (deps.now ?? (() => new Date()))().toISOString()
    deps.updateActivityEvents((current) => current.map((item) => (
      item.status === 'started' && item.id.startsWith('http-request-')
        ? setActivityEventStatus([item], item.id, 'completed', completedAt)[0] ?? item
        : item
    )))
  }
  deps.recordLiveTraceEvent(event)
}
