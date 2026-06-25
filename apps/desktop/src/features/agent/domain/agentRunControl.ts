import type { AgentRun } from '@movscript/agent-protocol'
import { isAgentRunStoppableStatus, isAgentRunTerminalStatus } from '@movscript/agent-protocol'

export type RunControlProviderSessionPatch = {
  stopping?: boolean
  loading?: boolean
  building?: boolean
  stopRequested?: boolean
  error?: string
}

export interface StopProviderSessionRunActionDeps {
  abortActiveSend: () => void
  setPendingAssistantState: (state: null) => void
  resetStreamingAssistant: () => void
  setConversationRun: (run: AgentRun, patch: RunControlProviderSessionPatch) => void
  updateConversationRuntimeState: (patch: RunControlProviderSessionPatch) => void
  cancelGenerationJobIfActive: () => void
  cancelRun: (runId: string, input: { reason?: string }) => Promise<AgentRun>
  getRun: (runId: string) => Promise<AgentRun>
  now?: () => Date
}

export function isStoppableAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && isAgentRunStoppableStatus(run.status)
}

export function isTerminalAgentRun(run: AgentRun | null | undefined): run is AgentRun {
  return !!run && isAgentRunTerminalStatus(run.status)
}

export function createProviderSessionStopAbortError(): Error {
  try {
    return new DOMException('用户停止了当前会话。', 'AbortError')
  } catch {
    const error = new Error('用户停止了当前会话。')
    error.name = 'AbortError'
    return error
  }
}


export function stopProviderSessionRunAction(input: {
  run: AgentRun | null
  loading: boolean
  building: boolean
  stopping: boolean
  stopRequestedBeforeRun: boolean
  deps: StopProviderSessionRunActionDeps
}): void {
  const { run, loading, building, stopping, stopRequestedBeforeRun, deps } = input
  deps.abortActiveSend()
  deps.setPendingAssistantState(null)
  deps.resetStreamingAssistant()

  if (!isStoppableAgentRun(run)) {
    if ((loading || building) && !stopping) {
      deps.updateConversationRuntimeState({ stopRequested: false, stopping: false, loading: false, building: false })
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
  deps.updateConversationRuntimeState({ stopping: false, loading: false, stopRequested: false })

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
        deps.updateConversationRuntimeState({ stopping: false, loading: false, stopRequested: false, error: message })
      })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/already finished/i.test(message)) {
      void deps.getRun(run.id).then((latestRun) => {
        deps.setConversationRun(latestRun, { stopRequested: false, stopping: false, loading: false })
      }).catch(() => undefined)
    } else {
      deps.updateConversationRuntimeState({ stopping: false, loading: false, stopRequested: false, error: message })
    }
  } finally {
    deps.updateConversationRuntimeState({ stopRequested: false, stopping: false, loading: false, building: false })
  }
}
