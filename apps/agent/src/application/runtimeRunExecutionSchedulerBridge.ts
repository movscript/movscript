import type { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { applyRuntimeRunExecutionScheduleRequest } from './runtimeRunExecutionScheduler.js'

export interface RuntimeRunExecutionSchedulerBridge {
  startRunExecution: (runId: string) => void
}

export function createRuntimeRunExecutionSchedulerBridge(input: {
  controllers: RuntimeRunControllerRegistry
  executeRun: (runId: string, signal: AbortSignal) => Promise<void>
  deleteCatalogSnapshot: (runId: string) => void
  syncTaskFromRun: (runId: string) => void
}): RuntimeRunExecutionSchedulerBridge {
  return {
    startRunExecution: (runId) => applyRuntimeRunExecutionScheduleRequest({
      runId,
      controllers: input.controllers,
      executeRun: input.executeRun,
      deleteCatalogSnapshot: input.deleteCatalogSnapshot,
      syncTaskFromRun: input.syncTaskFromRun,
    }),
  }
}
