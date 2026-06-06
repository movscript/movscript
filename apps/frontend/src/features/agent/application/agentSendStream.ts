import { extractAgentTaskArtifacts } from '@/features/agent/domain/agentArtifacts'
import { generationProgressFromEvents } from '@/features/agent/domain/agentGenerationMedia'
import { isStoppableAgentRun, isTerminalAgentRun, type RunControlProviderSessionPatch } from '@/features/agent/domain/agentRunControl'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import { setActivityEventStatus } from '@/features/agent/application/agentSendActivity'
import type { AgentRun, ProviderSessionEventV2, ProviderSessionLimits } from '@/shared/infrastructure/providerSessionClient'
import type { AgentPageTaskRunningPatch } from '@/features/agent/state/agentSessionStore'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import { providerSessionRunFromEvent, providerSessionThreadTitleFromEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'

export interface AgentSendRunUpdateDeps {
  conversationId: string
  requestId?: string
  liveEvents: () => ChatRunActivityEvent[]
  cancelledRunIds: Set<string>
  getConversationProviderSessionState: () => { stopRequested?: boolean; run?: AgentRun } | undefined
  setPendingAssistantState: (value: AgentThinkingState | null | ((current: AgentThinkingState | null) => AgentThinkingState | null)) => void
  thinkingStateForRun: (run: AgentRun) => AgentThinkingState
  runTouchesProviderCatalog: (run: AgentRun) => boolean
  refreshProviderCatalogContext: () => void
  setPageTaskRunning: (requestId: string, patch: AgentPageTaskRunningPatch) => void
  setConversationRun: (run: AgentRun, patch: RunControlProviderSessionPatch & { approving?: boolean }) => void
  setConversationProviderSessionState: (patch: RunControlProviderSessionPatch) => void
  cancelGenerationJobIfActive: (state: ReturnType<typeof generationProgressFromEvents>) => void
  cancelRun: (runId: string, input: { reason?: string }) => Promise<AgentRun>
  getRun: (runId: string) => Promise<AgentRun>
}

export interface AgentSendStreamEventDeps {
  updateConversationTitle: (title: string) => void
  updateActivityEvents: (updater: (events: ChatRunActivityEvent[]) => ChatRunActivityEvent[]) => void
  recordLiveTraceEvent: (event: ProviderSessionEventV2) => void
  onRunUpdate?: (run: AgentRun) => void
  now?: () => Date
}

export function handleSendRunUpdate(nextRun: AgentRun, deps: AgentSendRunUpdateDeps): void {
  const currentProviderSessionState = deps.getConversationProviderSessionState()
  const currentRun = currentProviderSessionState?.run
  const keepCurrentInteractionRun = shouldKeepCurrentInteractionRun(currentRun, nextRun)
  const artifacts = extractAgentTaskArtifacts(nextRun)
  if (keepCurrentInteractionRun) {
    // Keep the composer focused on the pending approval/input run while other runs continue streaming.
  } else if (nextRun.status === 'in_progress' || nextRun.status === 'queued') {
    const nextThinkingState = deps.thinkingStateForRun(nextRun)
    deps.setPendingAssistantState((current) => mergePendingAssistantState(current, nextThinkingState, nextRun))
  } else if (nextRun.status === 'requires_action') {
    deps.setPendingAssistantState(null)
  } else if (isTerminalAgentRun(nextRun)) {
    deps.setPendingAssistantState(null)
  }
  if (deps.runTouchesProviderCatalog(nextRun)) deps.refreshProviderCatalogContext()
  if (deps.requestId) {
    deps.setPageTaskRunning(deps.requestId, {
      conversationId: deps.conversationId,
      run: nextRun,
      threadId: nextRun.threadId,
      ...(artifacts.length > 0 ? { artifacts } : {}),
    })
  }
  if (!keepCurrentInteractionRun) {
    deps.setConversationRun(nextRun, {
      loading: true,
      building: false,
    })
  }

  const nextProviderSessionState = currentProviderSessionState ?? deps.getConversationProviderSessionState()
  if (!nextProviderSessionState?.stopRequested || !isStoppableAgentRun(nextRun) || deps.cancelledRunIds.has(nextRun.id)) return

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
      deps.setConversationProviderSessionState({ stopRequested: false, stopping: false, loading: false })
    })
}

export function handleSendProviderSessionEvent(event: ProviderSessionEventV2, deps: AgentSendStreamEventDeps): void {
  const title = providerSessionThreadTitleFromEvent(event)
  if (title) {
    deps.updateConversationTitle(title)
  }
  const run = normalizeProviderSessionEventRun(providerSessionRunFromEvent(event))
  if (run?.id) {
    const completedAt = (deps.now ?? (() => new Date()))().toISOString()
    deps.updateActivityEvents((current) => current.map((item) => (
      item.status === 'started' && item.id.startsWith('http-request-')
        ? setActivityEventStatus([item], item.id, 'completed', completedAt)[0] ?? item
        : item
    )))
    deps.onRunUpdate?.(run)
  }
  deps.recordLiveTraceEvent(event)
}

type AgentRunCompatInput = Omit<AgentRun, 'providerSessionLimits'> & {
  providerSessionLimits?: ProviderSessionLimits
  runtimeLimits?: ProviderSessionLimits
}

function normalizeProviderSessionEventRun(run: AgentRunCompatInput | undefined): AgentRun | undefined {
  if (!run) return undefined
  const providerSessionLimits = run.providerSessionLimits ?? run.runtimeLimits
  return {
    ...run,
    ...(providerSessionLimits ? { providerSessionLimits } : {}),
  } as AgentRun
}

function shouldKeepCurrentInteractionRun(currentRun: AgentRun | undefined, nextRun: AgentRun): boolean {
  if (!currentRun || currentRun.id === nextRun.id) return false
  return runHasPendingUserInteraction(currentRun) && !runHasPendingUserInteraction(nextRun)
}

function runHasPendingUserInteraction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function mergePendingAssistantState(
  current: AgentThinkingState | null,
  next: AgentThinkingState,
  run: AgentRun,
): AgentThinkingState {
  if (
    current?.status === 'preparing_tool_call'
    && next.status === 'thinking'
    && !run.steps.some((step) => (
      step.type === 'tool_call'
      && (!current.toolName || step.toolName === current.toolName)
    ))
  ) {
    return current
  }
  if (current?.reasoning && !next.reasoning) return { ...next, reasoning: current.reasoning }
  return next
}
