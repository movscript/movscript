import type { AgentStore } from '../state/store.js'
import type { ReplanRunInput, ReplanRunResult } from '../state/types.js'
import type { RuntimePlanDispatchBridge } from './runtimePlanDispatchBridge.js'
import type { RuntimePlanStatusBridge } from './runtimePlanStatusBridge.js'
import { applyRuntimeReplanRunRequest } from './runtimeReplanPreparation.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import type { RuntimeTaskUpdateBridge } from './runtimeTaskUpdateBridge.js'
import { isoNow } from './runtimeIdentity.js'

export interface RuntimeReplanBridge {
  replanRun: (runId: string, input?: ReplanRunInput) => ReplanRunResult
}

export function createRuntimeReplanBridge(input: {
  store: AgentStore
  taskUpdate: RuntimeTaskUpdateBridge
  planStatus: RuntimePlanStatusBridge
  planDispatch: RuntimePlanDispatchBridge
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
      recomputePlan: (planId) => input.planStatus.recomputePlanStatus(planId),
      dispatchPlan: (dispatchInput) => input.planDispatch.dispatchPlan(dispatchInput),
      onTaskCreated: input.taskEvents.recordTaskProtocolAndPlanEvent,
      onTaskReset: input.taskEvents.recordTaskProtocolAndPlanEvent,
    }),
  }
}
