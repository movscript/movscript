import type { AgentStore } from '../state/store.js'
import { assertRunExecutionNotCancelled } from './runLifecycleControl.js'

export interface RuntimeRunCancellationGuard {
  throwIfRunCancelled: (runId: string, signal?: AbortSignal) => void
}

export function createRuntimeRunCancellationGuard(input: {
  store: Pick<AgentStore, 'getRun'>
}): RuntimeRunCancellationGuard {
  return {
    throwIfRunCancelled: (runId, signal) => assertRunExecutionNotCancelled({
      runId,
      signal,
      getRunStatus: (targetRunId) => input.store.getRun(targetRunId)?.status,
    }),
  }
}
