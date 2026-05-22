import type { AgentStore } from '../state/store.js'
import type { UpdateTaskGraphInput, UpdateTaskGraphResult } from '../state/types.js'
import type { RuntimeTaskGraphDispatchBridge } from './runtimePlanDispatchBridge.js'
import type { RuntimeTaskGraphStatusBridge } from './runtimePlanStatusBridge.js'
import { applyRuntimeReplanRunRequest } from './runtimeReplanPreparation.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import type { RuntimeTaskUpdateBridge } from './runtimeTaskUpdateBridge.js'
import { isoNow } from './runtimeIdentity.js'

export interface RuntimeReplanBridge {
  replanRun: (runId: string, input?: UpdateTaskGraphInput) => UpdateTaskGraphResult
}

export function createRuntimeReplanBridge(input: {
  store: AgentStore
  taskUpdate: RuntimeTaskUpdateBridge
  planStatus: RuntimeTaskGraphStatusBridge
  planDispatch: RuntimeTaskGraphDispatchBridge
  taskEvents: RuntimeTaskEventBridge
  replanRequest?: typeof applyRuntimeReplanRunRequest
}): RuntimeReplanBridge {
  const replanRequest = input.replanRequest ?? applyRuntimeReplanRunRequest
  return {
    replanRun: (runId, replanInput = {}) => replanRequest({
      store: input.store,
      runId,
      replanInput,
      now: isoNow(),
      resetNow: isoNow(),
      updateTask: (taskId, update) => input.taskUpdate.updateTask(taskId, update),
      recomputeTaskGraph: (taskGraphId) => input.planStatus.recomputePlanStatus(taskGraphId),
      dispatchTaskGraph: (dispatchInput) => input.planDispatch.dispatchTaskGraph(dispatchInput),
      onTaskCreated: input.taskEvents.recordTaskProtocolAndPlanEvent,
      onTaskReset: input.taskEvents.recordTaskProtocolAndPlanEvent,
    }),
  }
}
