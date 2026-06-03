import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import { isAgentRunTerminalStatus } from '@movscript/protocol'

const STOPPABLE_AGENT_RUN_STATUSES = new Set<AgentRun['status']>(['queued', 'in_progress', 'requires_action'])

export type RunControlRuntimePatch = {
  stopping?: boolean
  loading?: boolean
  building?: boolean
  stopRequested?: boolean
  error?: string
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
  now?: () => Date
}

export function isStoppableAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && isStoppableAgentRunStatus(run.status)
}

export function isTerminalAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && isTerminalAgentRunStatus(run.status)
}

export function isStoppableAgentRunStatus(status: AgentRun['status'] | undefined): boolean {
  return !!status && STOPPABLE_AGENT_RUN_STATUSES.has(status)
}

export function isTerminalAgentRunStatus(status: AgentRun['status'] | undefined): boolean {
  return isAgentRunTerminalStatus(status)
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
        deps.setConversationRuntime({ stopping: false, loading: false, stopRequested: false, error: message })
      })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/already finished/i.test(message)) {
      void deps.getRun(run.id).then((latestRun) => {
        deps.setConversationRun(latestRun, { stopRequested: false, stopping: false, loading: false })
      }).catch(() => undefined)
    } else {
      deps.setConversationRuntime({ stopping: false, loading: false, stopRequested: false, error: message })
    }
  } finally {
    deps.setConversationRuntime({ stopRequested: false, stopping: false, loading: false, building: false })
  }
}
