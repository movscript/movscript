import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentRun, AgentTask, UpdateTaskGraphTaskInput } from '../../../../../state/shared/types.js'
import {
  applyRuntimeTaskUpdateRequest,
} from '../core/runtimeTaskUpdate.js'
import type { RuntimeTaskProtocolTraceInput } from '../../events/protocol/runtimeTaskProtocolEvents.js'

export interface RuntimeTaskUpdateBridge {
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
}

export function createRuntimeTaskUpdateBridge(input: {
  store: AgentStore
  now: () => string
  recomputePlanStatus: (taskGraphId: string) => void
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (taskGraphId: string, task: AgentTask) => void
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
