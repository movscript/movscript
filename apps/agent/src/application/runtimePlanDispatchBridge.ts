import type { AgentStore } from '../state/store.js'
import type { DispatchPlanInput, DispatchPlanResult } from '../state/types.js'
import { applyRuntimePlanDispatchRequest } from './runtimePlanDispatch.js'
import type { RuntimePlanStatusBridge } from './runtimePlanStatusBridge.js'
import type { RuntimeRunControlBridge } from './runtimeRunControlBridge.js'
import type { RuntimeRunCreationBridge } from './runtimeRunCreationBridge.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import type { RuntimeTaskRunSyncBridge } from './runtimeTaskRunSyncBridge.js'
import type { RuntimeTaskUpdateBridge } from './runtimeTaskUpdateBridge.js'
import { isoNow } from './runtimeIdentity.js'

export interface RuntimePlanDispatchBridge {
  dispatchPlan: (input: DispatchPlanInput) => DispatchPlanResult
}

export function createRuntimePlanDispatchBridge(input: {
  store: AgentStore
  taskUpdate: RuntimeTaskUpdateBridge
  runCreation: RuntimeRunCreationBridge
  runControl: RuntimeRunControlBridge
  taskRunSync: RuntimeTaskRunSyncBridge
  planStatus: RuntimePlanStatusBridge
  streams: RuntimeStreamBridge
  taskEvents: RuntimeTaskEventBridge
  dispatchRequest?: typeof applyRuntimePlanDispatchRequest
}): RuntimePlanDispatchBridge {
  const dispatchRequest = input.dispatchRequest ?? applyRuntimePlanDispatchRequest
  return {
    dispatchPlan: (dispatchInput) => dispatchRequest({
      store: input.store,
      dispatchInput,
      now: isoNow(),
      nowMs: Date.now(),
      updateTask: (taskId, update) => input.taskUpdate.updateTask(taskId, update),
      createRun: (runInput) => input.runCreation.createRun(runInput),
      cancelRun: (runId, reason) => input.runControl.cancelRun(runId, { reason }),
      syncTaskFromRun: (runId) => input.taskRunSync.syncTaskFromRun(runId),
      recomputePlan: (planId) => input.planStatus.recomputePlanStatus(planId),
      onTaskTimedOut: (task) => input.streams.emitPlanTaskEvent(task.planId, task),
      onTaskRetryReset: input.taskEvents.recordTaskProtocolAndPlanEvent,
      onTaskBlocked: (task) => input.streams.emitPlanTaskEvent(task.planId, task),
      onTaskDispatched: input.taskEvents.recordTaskProtocolAndPlanEvent,
    }),
  }
}
