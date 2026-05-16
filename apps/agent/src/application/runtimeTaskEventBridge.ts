import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimeTaskProtocolEvents,
  type RuntimeTaskProtocolTraceInput,
} from './runtimeTaskProtocolEvents.js'

export function applyRuntimeTaskEventBridgeRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan'>
  task: AgentTask
  previous?: AgentTask
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent?: (planId: string, task: AgentTask) => void
}): AgentRun | undefined {
  const run = applyRuntimeTaskProtocolEvents({
    store: input.store,
    task: input.task,
    ...(input.previous ? { previous: input.previous } : {}),
    recordTrace: input.recordTrace,
  })
  input.emitPlanTaskEvent?.(input.task.planId, input.task)
  return run
}

export function createRuntimeTaskEventBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan'>
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (planId: string, task: AgentTask) => void
}): {
  recordTaskProtocolEvents: (task: AgentTask, previous?: AgentTask) => AgentRun | undefined
  recordTaskProtocolAndPlanEvent: (task: AgentTask, previous?: AgentTask) => AgentRun | undefined
} {
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
