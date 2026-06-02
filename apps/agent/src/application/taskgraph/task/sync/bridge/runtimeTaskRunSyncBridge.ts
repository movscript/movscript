import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentRun } from '../../../../../state/shared/types.js'
import {
  applyRuntimeTaskRunSyncRequest,
  type RuntimeTaskRunSyncResult,
} from '../core/runtimeTaskRunSync.js'
import type { RuntimeTaskProtocolTraceInput } from '../../events/protocol/runtimeTaskProtocolEvents.js'

export interface RuntimeTaskRunSyncBridge {
  syncTaskFromRun: (runId: string) => RuntimeTaskRunSyncResult | undefined
}

export function createRuntimeTaskRunSyncBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask' | 'getTaskGraph'>
  now: () => string
  recomputePlanStatus: (taskGraphId: string) => void
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
