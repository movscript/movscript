import type { AgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  applyRuntimeTaskGraphStatusRecomputeRequest,
  type RuntimeTaskGraphProjectionResult,
} from './runtimePlanProjection.js'
import type { RuntimePlanCompletionTraceInput } from './runtimePlanCompletionTrace.js'

export interface RuntimeTaskGraphStatusBridge {
  recomputePlanStatus: (taskGraphId: string) => RuntimeTaskGraphProjectionResult | undefined
}

export function createRuntimeTaskGraphStatusBridge(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks' | 'updateTaskGraph' | 'getRun' | 'listRuns'>
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimePlanCompletionTraceInput) => void
}): RuntimeTaskGraphStatusBridge {
  return {
    recomputePlanStatus: (taskGraphId) => applyRuntimeTaskGraphStatusRecomputeRequest({
      store: input.store,
      taskGraphId,
      now: input.now(),
      recordTrace: input.recordTrace,
    }),
  }
}
