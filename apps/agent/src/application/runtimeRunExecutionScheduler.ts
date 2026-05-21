import type { RuntimeRunControllerRegistry } from './runLifecycleControl.js'

export function startRuntimeRunExecution(input: {
  runId: string
  controllers: RuntimeRunControllerRegistry
  executeRun: (runId: string, signal: AbortSignal) => Promise<void>
  onRunSettled: (runId: string) => void
}): void {
  const controller = input.controllers.create(input.runId)
  void input.executeRun(input.runId, controller.signal).finally(() => {
    input.controllers.release(input.runId, controller)
    input.onRunSettled(input.runId)
  })
}

export function applyRuntimeRunExecutionScheduleRequest(input: {
  runId: string
  controllers: RuntimeRunControllerRegistry
  executeRun: (runId: string, signal: AbortSignal) => Promise<void>
  deleteCatalogSnapshot: (runId: string) => void
  syncTaskFromRun: (runId: string) => void
  onRunSettled?: (runId: string) => void
}): void {
  startRuntimeRunExecution({
    runId: input.runId,
    controllers: input.controllers,
    executeRun: input.executeRun,
    onRunSettled: (runId) => {
      input.deleteCatalogSnapshot(runId)
      input.syncTaskFromRun(runId)
      input.onRunSettled?.(runId)
    },
  })
}
