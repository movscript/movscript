import type { AgentStore } from '../../../../state/store/core/store.js'
import type { CancelRunInput } from '../../../../state/shared/types.js'
import { applyRuntimeTaskGraphTreeCancellationRequest } from '../plan/runtimePlanTreeCancellation.js'
import { applyRuntimeSubtreeCancellationRequest } from '../../../run/control/cancellation/core/runtimeRunCancellation.js'

export interface RuntimeTreeCancellationBridge {
  cancelSubtree: (runId: string, input?: CancelRunInput) => { cancelledRunIds: string[] }
  cancelPlanTree: (runId: string, input?: CancelRunInput) => { cancelledRunIds: string[] }
}

export function createRuntimeTreeCancellationBridge(input: {
  store: AgentStore
  cancelRun: (runId: string, input?: CancelRunInput) => unknown
  cancelSubtreeRequest?: typeof applyRuntimeSubtreeCancellationRequest
  cancelPlanTreeRequest?: typeof applyRuntimeTaskGraphTreeCancellationRequest
}): RuntimeTreeCancellationBridge {
  const cancelSubtreeRequest = input.cancelSubtreeRequest ?? applyRuntimeSubtreeCancellationRequest
  const cancelPlanTreeRequest = input.cancelPlanTreeRequest ?? applyRuntimeTaskGraphTreeCancellationRequest
  const bridge: RuntimeTreeCancellationBridge = {
    cancelSubtree: (runId, cancelInput = {}) => cancelSubtreeRequest({
      store: input.store,
      runId,
      reason: cancelInput.reason,
      cancelRun: (targetRunId, reason) => {
        input.cancelRun(targetRunId, { reason })
      },
    }),
    cancelPlanTree: (runId, cancelInput = {}) => cancelPlanTreeRequest({
      store: input.store,
      runId,
      cancelSubtree: (rootRunId) => bridge.cancelSubtree(rootRunId, cancelInput),
    }),
  }
  return bridge
}
