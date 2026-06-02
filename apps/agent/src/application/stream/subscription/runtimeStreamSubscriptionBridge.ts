import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentTaskGraphStreamEvent, AgentInternalRunSignal, AgentInternalThreadSignal } from '../../../state/shared/types.js'
import { requireRuntimeSession, requireRuntimeTaskGraph, requireRuntimeRun, requireRuntimeThread } from '../../shared/store/runtimeStoreLookup.js'
import type { RuntimeStreamBridge } from '../bridge/runtimeStreamBridge.js'

export interface RuntimeStreamSubscriptionBridge {
  subscribeRunStream: (runId: string, listener: (event: AgentInternalRunSignal) => void) => () => void
  subscribeSessionStream: (sessionId: string, listener: (event: AgentInternalThreadSignal) => void) => () => void
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
    subscribeSessionStream: (sessionId, listener) => {
      requireRuntimeSession(input.store, sessionId)
      return input.streams.subscribeSessionStream(sessionId, listener)
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
