import type { AgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun } from '../state/types.js'
import {
  assertPlannerRunCanUsePlan,
  attachPlannerRunToPlanState,
  findThreadPlan,
  requirePlannerRunState,
  selectPlannerRunPlanId,
} from '../state/planRunBinding.js'
import { requireRuntimePlan, requireRuntimeRun } from './runtimeStoreLookup.js'

export function requireRuntimePlannerRun(store: Pick<AgentStore, 'getRun'>, id: string): AgentRun {
  return requirePlannerRunState(requireRuntimeRun(store, id))
}

export function findRuntimeThreadPlan(store: Pick<AgentStore, 'listPlans'>, threadId: string): AgentPlan | undefined {
  return findThreadPlan(store.listPlans(), threadId)
}

export function attachPlannerRunToRuntimePlan(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'updateRun' | 'updatePlan'>
  runId: string
  planId: string
  source: string
  now: string
}): AgentRun {
  const { store, runId, planId, source, now } = input
  const run = requireRuntimePlannerRun(store, runId)
  const plan = requireRuntimePlan(store, planId)
  const rootRun = plan.rootRunId ? store.getRun(plan.rootRunId) : undefined
  const attached = attachPlannerRunToPlanState({ run, plan, rootRun, source, now })
  store.updateRun(run)
  if (attached.planUpdated) store.updatePlan(plan)
  return run
}

export function resolveRuntimePlannerRunPlanId(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans' | 'updateRun' | 'updatePlan'>
  plannerRun: AgentRun
  inputPlanId?: unknown
  source: string
  action: string
  now: string
}): string {
  const { store, plannerRun, inputPlanId, source, action, now } = input
  const planId = selectPlannerRunPlanId({
    plannerRun,
    inputPlanId,
    threadPlan: findRuntimeThreadPlan(store, plannerRun.threadId),
    source,
  })
  const plan = requireRuntimePlan(store, planId)
  assertPlannerRunCanUsePlan({ plannerRun, plan, action })
  if (!plannerRun.planId) {
    attachPlannerRunToRuntimePlan({ store, runId: plannerRun.id, planId, source, now })
  }
  return planId
}
