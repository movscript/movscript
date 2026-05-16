import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask, UpdatePlanTaskInput } from '../state/types.js'
import {
  applyRuntimeTaskUpdateRequest,
} from './runtimeTaskUpdate.js'
import type { RuntimeTaskProtocolTraceInput } from './runtimeTaskProtocolEvents.js'

export interface RuntimeTaskUpdateBridge {
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
}

export function createRuntimeTaskUpdateBridge(input: {
  store: AgentStore
  now: () => string
  recomputePlanStatus: (planId: string) => void
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (planId: string, task: AgentTask) => void
}): RuntimeTaskUpdateBridge {
  return {
    updateTask: (taskId, update) => {
      const { task } = applyRuntimeTaskUpdateRequest({
        store: input.store,
        taskId,
        update,
        now: input.now(),
        recomputePlanStatus: input.recomputePlanStatus,
        recordTrace: input.recordTrace,
        emitPlanTaskEvent: input.emitPlanTaskEvent,
      })
      return task
    },
  }
}
