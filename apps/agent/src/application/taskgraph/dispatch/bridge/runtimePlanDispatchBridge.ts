import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentThread, CreateThreadInput, DispatchTaskGraphInput, DispatchTaskGraphResult } from '../../../../state/shared/types.js'
import { applyRuntimeTaskGraphDispatchRequest } from '../core/runtimePlanDispatch.js'
import type { RuntimeTaskGraphStatusBridge } from '../../read/status/bridge/runtimePlanStatusBridge.js'
import type { RuntimeRunControlBridge } from '../../../run/control/bridge/runtimeRunControlBridge.js'
import type { RuntimeRunCreationBridge } from '../../../run/creation/bridge/runtimeRunCreationBridge.js'
import type { RuntimeStreamBridge } from '../../../stream/bridge/runtimeStreamBridge.js'
import type { RuntimeTaskEventBridge } from '../../task/events/bridge/runtimeTaskEventBridge.js'
import type { RuntimeTaskRunSyncBridge } from '../../task/sync/bridge/runtimeTaskRunSyncBridge.js'
import type { RuntimeTaskUpdateBridge } from '../../task/update/bridge/runtimeTaskUpdateBridge.js'
import { isoNow } from '../../../../shared/runtime/runtimeIdentity.js'

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
  createThread?: (input: CreateThreadInput) => AgentThread
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
      ...(input.createThread ? { createThread: input.createThread } : {}),
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
