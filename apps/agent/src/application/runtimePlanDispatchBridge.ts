import type { AgentStore } from '../state/store.js'
import type { DispatchTaskGraphInput, DispatchTaskGraphResult } from '../state/types.js'
import { applyRuntimeTaskGraphDispatchRequest } from './runtimePlanDispatch.js'
import type { RuntimeTaskGraphStatusBridge } from './runtimePlanStatusBridge.js'
import type { RuntimeRunControlBridge } from './runtimeRunControlBridge.js'
import type { RuntimeRunCreationBridge } from './runtimeRunCreationBridge.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import type { RuntimeTaskRunSyncBridge } from './runtimeTaskRunSyncBridge.js'
import type { RuntimeTaskUpdateBridge } from './runtimeTaskUpdateBridge.js'
import { isoNow } from './runtimeIdentity.js'

export interface RuntimeTaskGraphDispatchBridge {
  dispatchTaskGraph: (input: DispatchTaskGraphInput) => DispatchTaskGraphResult
}

export function createRuntimeTaskGraphDispatchBridge(input: {
  store: AgentStore
  taskUpdate: RuntimeTaskUpdateBridge
  runCreation: RuntimeRunCreationBridge
  runControl: RuntimeRunControlBridge
  taskRunSync: RuntimeTaskRunSyncBridge
  planStatus: RuntimeTaskGraphStatusBridge
  streams: RuntimeStreamBridge
  taskEvents: RuntimeTaskEventBridge
  dispatchRequest?: typeof applyRuntimeTaskGraphDispatchRequest
}): RuntimeTaskGraphDispatchBridge {
  const dispatchRequest = input.dispatchRequest ?? applyRuntimeTaskGraphDispatchRequest
  return {
    dispatchTaskGraph: (dispatchInput) => dispatchRequest({
      store: input.store,
      dispatchInput,
      now: isoNow(),
      nowMs: Date.now(),
      updateTask: (taskId, update) => input.taskUpdate.updateTask(taskId, update),
      createRun: (runInput) => input.runCreation.createRun(runInput),
      cancelRun: (runId, reason) => input.runControl.cancelRun(runId, { reason }),
      syncTaskFromRun: (runId) => input.taskRunSync.syncTaskFromRun(runId),
      recomputeTaskGraph: (taskGraphId) => input.planStatus.recomputePlanStatus(taskGraphId),
      onTaskTimedOut: (task) => input.streams.emitPlanTaskEvent(task.taskGraphId, task),
      onTaskRetryReset: input.taskEvents.recordTaskProtocolAndPlanEvent,
      onTaskBlocked: (task) => input.streams.emitPlanTaskEvent(task.taskGraphId, task),
      onTaskDispatched: input.taskEvents.recordTaskProtocolAndPlanEvent,
    }),
  }
}
