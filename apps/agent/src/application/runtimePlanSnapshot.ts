import type { AgentStore } from '../state/store.js'
import type { AgentPlanSnapshot } from '../state/types.js'
import { buildAgentPlanSnapshot } from '../state/planSnapshot.js'
import { toProductRun } from '../state/runStreamView.js'
import { requireRuntimePlan } from './runtimeStoreLookup.js'

export function getRuntimePlanSnapshot(input: {
  store: Pick<AgentStore, 'getPlan' | 'listTasks' | 'listRuns'>
  planId: string
}): AgentPlanSnapshot {
  const plan = requireRuntimePlan(input.store, input.planId)
  return buildAgentPlanSnapshot({
    plan,
    tasks: input.store.listTasks(input.planId),
    runs: input.store.listRuns({ planId: input.planId }).map(toProductRun),
  })
}
