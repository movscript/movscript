import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentRun, AgentTask } from '../../../../../state/shared/types.js'
import {
  applyRuntimeTaskProtocolEvents,
  type RuntimeTaskProtocolTraceInput,
} from '../protocol/runtimeTaskProtocolEvents.js'

export function applyRuntimeTaskEventBridgeRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph'>
  task: AgentTask
  previous?: AgentTask
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent?: (taskGraphId: string, task: AgentTask) => void
}): AgentRun | undefined {
  const run = applyRuntimeTaskProtocolEvents({
    store: input.store,
    task: input.task,
    ...(input.previous ? { previous: input.previous } : {}),
    recordTrace: input.recordTrace,
  })
  input.emitPlanTaskEvent?.(input.task.taskGraphId, input.task)
  return run
}

export interface RuntimeTaskEventBridge {
  recordTaskProtocolEvents: (task: AgentTask, previous?: AgentTask) => AgentRun | undefined
  recordTaskProtocolAndPlanEvent: (task: AgentTask, previous?: AgentTask) => AgentRun | undefined
}

export function createRuntimeTaskEventBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph'>
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (taskGraphId: string, task: AgentTask) => void
}): RuntimeTaskEventBridge {
  return {
    recordTaskProtocolEvents: (task, previous) => applyRuntimeTaskEventBridgeRequest({
      store: input.store,
      task,
      ...(previous ? { previous } : {}),
      recordTrace: input.recordTrace,
    }),
    recordTaskProtocolAndPlanEvent: (task, previous) => applyRuntimeTaskEventBridgeRequest({
      store: input.store,
      task,
      ...(previous ? { previous } : {}),
      recordTrace: input.recordTrace,
      emitPlanTaskEvent: input.emitPlanTaskEvent,
    }),
  }
}
