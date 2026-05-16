import type { AgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import { projectTasksOntoPlan, type PlanTaskProjectionResult } from '../state/planProjection.js'
import {
  applyRuntimePlanCompletionTrace,
  type RuntimePlanCompletionTraceInput,
} from './runtimePlanCompletionTrace.js'

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

export function applyRuntimePlanStatusRecomputeRequest(input: {
  store: Pick<AgentStore, 'getPlan' | 'listTasks' | 'updatePlan' | 'getRun' | 'listRuns'>
  planId: string
  now: string
  recordTrace: (run: AgentRun, trace: RuntimePlanCompletionTraceInput) => void
}): RuntimePlanProjectionResult | undefined {
  const result = recomputeRuntimePlanStatus({
    store: input.store,
    planId: input.planId,
    now: input.now,
  })
  if (result?.projection.completedNow) {
    applyRuntimePlanCompletionTrace({
      store: input.store,
      plan: result.plan,
      tasks: result.tasks,
      recordTrace: input.recordTrace,
    })
  }
  return result
}
