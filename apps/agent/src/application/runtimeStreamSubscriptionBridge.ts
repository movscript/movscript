import type { AgentStore } from '../state/store.js'
import type { AgentPlanStreamEvent, AgentRunStreamEvent } from '../state/types.js'
import { requireRuntimePlan, requireRuntimeRun } from './runtimeStoreLookup.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'

export interface RuntimeStreamSubscriptionBridge {
  subscribeRunStream: (runId: string, listener: (event: AgentRunStreamEvent) => void) => () => void
  subscribePlanStream: (planId: string, listener: (event: AgentPlanStreamEvent) => void) => () => void
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
    subscribePlanStream: (planId, listener) => {
      requireRuntimePlan(input.store, planId)
      return input.streams.subscribePlanStream(planId, listener)
    },
  }
}
