import type { AgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  applyRuntimePlanStatusRecomputeRequest,
  type RuntimePlanProjectionResult,
} from './runtimePlanProjection.js'
import type { RuntimePlanCompletionTraceInput } from './runtimePlanCompletionTrace.js'

export interface RuntimePlanStatusBridge {
  recomputePlanStatus: (planId: string) => RuntimePlanProjectionResult | undefined
}

export function createRuntimePlanStatusBridge(input: {
  store: Pick<AgentStore, 'getPlan' | 'listTasks' | 'updatePlan' | 'getRun' | 'listRuns'>
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimePlanCompletionTraceInput) => void
}): RuntimePlanStatusBridge {
  return {
    recomputePlanStatus: (planId) => applyRuntimePlanStatusRecomputeRequest({
      store: input.store,
      planId,
      now: input.now(),
      recordTrace: input.recordTrace,
    }),
  }
}
