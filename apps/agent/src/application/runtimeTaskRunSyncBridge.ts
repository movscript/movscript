import type { AgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  applyRuntimeTaskRunSyncRequest,
  type RuntimeTaskRunSyncResult,
} from './runtimeTaskRunSync.js'
import type { RuntimeTaskProtocolTraceInput } from './runtimeTaskProtocolEvents.js'

export interface RuntimeTaskRunSyncBridge {
  syncTaskFromRun: (runId: string) => RuntimeTaskRunSyncResult | undefined
}

export function createRuntimeTaskRunSyncBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask' | 'getPlan'>
  now: () => string
  recomputePlanStatus: (planId: string) => void
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: Parameters<typeof applyRuntimeTaskRunSyncRequest>[0]['emitPlanTaskEvent']
}): RuntimeTaskRunSyncBridge {
  return {
    syncTaskFromRun: (runId) => applyRuntimeTaskRunSyncRequest({
      store: input.store,
      runId,
      now: input.now(),
      recomputePlanStatus: input.recomputePlanStatus,
      recordTrace: input.recordTrace,
      emitPlanTaskEvent: input.emitPlanTaskEvent,
    }),
  }
}
