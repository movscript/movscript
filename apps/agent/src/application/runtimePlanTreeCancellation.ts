import type { AgentStore } from '../state/store.js'
import { requireRuntimePlannerRun } from './runtimePlanBinding.js'
import { requireRuntimePlan } from './runtimeStoreLookup.js'

export function resolveRuntimePlanTreeCancellationRoot(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan'>
  runId: string
}): string {
  const run = requireRuntimePlannerRun(input.store, input.runId)
  if (!run.planId) throw new Error(`planner run ${input.runId} is not attached to a plan`)
  const plan = requireRuntimePlan(input.store, run.planId)
  if (plan.rootRunId && plan.rootRunId !== run.id) {
    throw new Error(`planner run ${run.id} is not the root planner for plan ${plan.id}`)
  }
  return run.id
}

export function applyRuntimePlanTreeCancellationRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan'>
  runId: string
  cancelSubtree: (runId: string) => { cancelledRunIds: string[] }
}): { cancelledRunIds: string[] } {
  const rootRunId = resolveRuntimePlanTreeCancellationRoot({
    store: input.store,
    runId: input.runId,
  })
  return input.cancelSubtree(rootRunId)
}
