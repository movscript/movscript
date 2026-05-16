import type { AgentStore } from '../state/store.js'
import type { AgentPlan, AgentTask } from '../state/types.js'
import { projectTasksOntoPlan, type PlanTaskProjectionResult } from '../state/planProjection.js'

export interface RuntimePlanProjectionResult {
  plan: AgentPlan
  tasks: AgentTask[]
  projection: PlanTaskProjectionResult
}

export function recomputeRuntimePlanStatus(input: {
  store: Pick<AgentStore, 'getPlan' | 'listTasks' | 'updatePlan'>
  planId: string
  now: string
}): RuntimePlanProjectionResult | undefined {
  const { store, planId, now } = input
  const plan = store.getPlan(planId)
  if (!plan) return undefined
  const tasks = store.listTasks(planId)
  const projection = projectTasksOntoPlan(plan, tasks, now)
  store.updatePlan(plan)
  return { plan, tasks, projection }
}
