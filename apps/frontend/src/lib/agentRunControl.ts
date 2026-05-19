import type { AgentRun, AgentThread } from '@/lib/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

export const STOPPABLE_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])
export const TERMINAL_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['completed', 'completed_with_warnings', 'failed', 'cancelled'])

export type RunControlRuntimePatch = {
  stopping?: boolean
  loading?: boolean
  building?: boolean
  stopRequested?: boolean
}

export interface StopLocalRunActionDeps {
  abortActiveSend: () => void
  setPendingAssistantState: (state: null) => void
  resetStreamingAssistant: () => void
  setConversationRun: (run: AgentRun, patch: RunControlRuntimePatch) => void
  setConversationRuntime: (patch: RunControlRuntimePatch) => void
  cancelGenerationJobIfActive: () => void
  cancelRun: (runId: string, input: { reason?: string }) => Promise<AgentRun>
  getRun: (runId: string) => Promise<AgentRun>
  getThread: (threadId: string) => Promise<AgentThread>
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  liveEvents: () => ChatRunActivityEvent[]
  addAssistantMessage: (message: Pick<ChatMessage, 'role' | 'content'> & { meta?: ChatMessage['meta'] }) => void
  now?: () => Date
}

export function isStoppableAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && STOPPABLE_AGENT_RUN_STATUSES.has(run.status)
}

export function isTerminalAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && TERMINAL_AGENT_RUN_STATUSES.has(run.status)
}

export function createLocalAgentStopAbortError(): Error {
  try {
    return new DOMException('用户停止了当前会话。', 'AbortError')
  } catch {
    const error = new Error('用户停止了当前会话。')
    error.name = 'AbortError'
    return error
  }
}

export function stopLocalRunAction(input: {
  run: AgentRun | null
  loading: boolean
  building: boolean
  stopping: boolean
  stopRequestedBeforeRun: boolean
  deps: StopLocalRunActionDeps
}): void {
  const { run, loading, building, stopping, stopRequestedBeforeRun, deps } = input
  deps.abortActiveSend()
  deps.setPendingAssistantState(null)
  deps.resetStreamingAssistant()

  if (!isStoppableAgentRun(run)) {
    if ((loading || building) && !stopping) {
      deps.setConversationRuntime({ stopRequested: false, stopping: false, loading: false, building: false })
    }
    return
  }
  if (stopping && !stopRequestedBeforeRun) return

  const now = (deps.now ?? (() => new Date()))().toISOString()
  const cancelledRun = {
    ...run,
    status: 'cancelled' as const,
    cancelledAt: run.cancelledAt ?? now,
    completedAt: run.completedAt ?? now,
    updatedAt: now,
    warnings: Array.from(new Set([...(run.warnings ?? []), '用户停止了当前会话。'])),
  }
  deps.setConversationRun(cancelledRun, {
    stopping: false,
    loading: false,
    stopRequested: false,
  })
  deps.setConversationRuntime({ stopping: false, loading: false, stopRequested: false })

  try {
    deps.cancelGenerationJobIfActive()
    void deps.cancelRun(run.id, { reason: '用户停止了当前会话。' })
      .then(async (nextRun) => {
        deps.setConversationRun(nextRun, {
          stopping: false,
          loading: false,
          stopRequested: false,
        })
        const thread = await deps.getThread(nextRun.threadId)
        await deps.appendAssistantRunResult(nextRun, thread, deps.liveEvents())
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (/already finished/i.test(message)) {
          const latestRun = await deps.getRun(run.id).catch(() => undefined)
          if (latestRun) {
            deps.setConversationRun(latestRun, { stopRequested: false, stopping: false, loading: false })
          }
          return
        }
        deps.addAssistantMessage({
          role: 'assistant',
          content: `停止当前会话失败：${message}`,
        })
      })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/already finished/i.test(message)) {
      void deps.getRun(run.id).then((latestRun) => {
        deps.setConversationRun(latestRun, { stopRequested: false, stopping: false, loading: false })
      }).catch(() => undefined)
    } else {
      deps.addAssistantMessage({
        role: 'assistant',
        content: `停止当前会话失败：${message}`,
      })
    }
  } finally {
    deps.setConversationRuntime({ stopRequested: false, stopping: false, loading: false, building: false })
  }
}
