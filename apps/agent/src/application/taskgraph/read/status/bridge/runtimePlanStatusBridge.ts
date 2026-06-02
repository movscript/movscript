import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentRun } from '../../../../../state/shared/types.js'
import {
  applyRuntimeTaskGraphStatusRecomputeRequest,
  type RuntimeTaskGraphProjectionResult,
} from '../../projection/runtimePlanProjection.js'
import type { RuntimePlanCompletionTraceInput } from '../trace/runtimePlanCompletionTrace.js'

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
