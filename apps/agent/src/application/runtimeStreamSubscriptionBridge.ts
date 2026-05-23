import type { AgentStore } from '../state/store.js'
import type { AgentTaskGraphStreamEvent, AgentInternalRunSignal, AgentInternalThreadSignal } from '../state/types.js'
import { requireRuntimeTaskGraph, requireRuntimeRun, requireRuntimeThread } from './runtimeStoreLookup.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'

export interface RuntimeStreamSubscriptionBridge {
  subscribeRunStream: (runId: string, listener: (event: AgentInternalRunSignal) => void) => () => void
  subscribeThreadStream: (threadId: string, listener: (event: AgentInternalThreadSignal) => void) => () => void
  subscribePlanStream: (taskGraphId: string, listener: (event: AgentTaskGraphStreamEvent) => void) => () => void
}

export function createRuntimeStreamSubscriptionBridge(input: {
  store: AgentStore
  streams: RuntimeStreamBridge
}): RuntimeStreamSubscriptionBridge {
  return {
    subscribeRunStream: (runId, listener) => {
      const run = requireRuntimeRun(input.store, runId)
      return input.streams.subscribeRunStream(run, listener)
    },
    subscribeThreadStream: (threadId, listener) => {
      requireRuntimeThread(input.store, threadId)
      return input.streams.subscribeThreadStream(threadId, listener)
    },
    subscribePlanStream: (taskGraphId, listener) => {
      requireRuntimeTaskGraph(input.store, taskGraphId)
      return input.streams.subscribePlanStream(taskGraphId, listener)
    },
  }
}
