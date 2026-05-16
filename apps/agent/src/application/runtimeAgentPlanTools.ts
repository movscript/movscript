import type { JSONValue } from '../types.js'
import type {
  AgentPlanSnapshot,
  AgentRun,
  ReplanRunInput,
  ReplanRunResult,
} from '../state/types.js'
import type { AgentStore } from '../state/store.js'
import { normalizeNonEmptyString } from './runtimeScalarInput.js'
import {
  attachPlannerRunToRuntimePlan,
  findRuntimeThreadPlan,
  requireRuntimePlannerRun,
  resolveRuntimePlannerRunPlanId,
} from './runtimePlanBinding.js'
import { requireRuntimePlan } from './runtimeStoreLookup.js'

export type RuntimeAgentPlanCreationState =
  | { status: 'exists' | 'attached'; plannerRun: AgentRun; planId: string }
  | { status: 'create'; plannerRun: AgentRun }

export function prepareRuntimeAgentPlanCreation(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  now: string
}): RuntimeAgentPlanCreationState {
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  if (plannerRun.planId) {
    return { status: 'exists', plannerRun, planId: plannerRun.planId }
  }
  const existingPlan = findRuntimeThreadPlan(input.store, plannerRun.threadId)
  if (existingPlan) {
    attachPlannerRunToRuntimePlan({
      store: input.store,
      runId: plannerRun.id,
      planId: existingPlan.id,
      source: 'movscript_create_plan',
      now: input.now,
    })
    return { status: 'attached', plannerRun: requireRuntimePlannerRun(input.store, plannerRun.id), planId: existingPlan.id }
  }
  return { status: 'create', plannerRun }
}

export function finalizeRuntimeAgentPlanCreation(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  planId: string
  taskCount: number
  now: string
}): { plannerRun: AgentRun; planId: string } {
  const plannerRun = attachPlannerRunToRuntimePlan({
    store: input.store,
    runId: input.plannerRunId,
    planId: input.planId,
    source: 'movscript_create_plan',
    now: input.now,
  })
  const plan = requireRuntimePlan(input.store, input.planId)
  plan.status = input.taskCount > 0 ? 'running' : 'blocked'
  plan.updatedAt = input.now
  input.store.updatePlan(plan)
  return { plannerRun, planId: plan.id }
}

export function buildRuntimeAgentPlanToolResult(input: {
  status: 'exists' | 'attached' | 'created'
  planId: string
  plannerRunId: string
  snapshot: AgentPlanSnapshot
}): JSONValue {
  return {
    status: input.status,
    planId: input.planId,
    plannerRunId: input.plannerRunId,
    snapshot: input.snapshot,
  } as unknown as JSONValue
}

export function getRuntimeAgentPlan(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
}): JSONValue {
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  const planId = normalizeNonEmptyString(input.request?.planId) ?? plannerRun.planId ?? findRuntimeThreadPlan(input.store, plannerRun.threadId)?.id
  if (!planId) throw new Error('get_plan requires planId or a planner run plan')
  const plan = requireRuntimePlan(input.store, planId)
  if (plan.threadId !== plannerRun.threadId) throw new Error(`planner run ${plannerRun.id} cannot inspect plan ${planId}`)
  return {
    status: 'ok',
    planId,
    plannerRunId: plannerRun.id,
    snapshot: input.getPlanSnapshot(planId),
  } as unknown as JSONValue
}

export function prepareRuntimeAgentReplan(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: string
}): { plannerRun: AgentRun; planId: string; replanInput: ReplanRunInput } {
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  const request = input.request ?? {}
  const planId = resolveRuntimePlannerRunPlanId({
    store: input.store,
    plannerRun,
    inputPlanId: request.planId,
    source: 'movscript_replan',
    action: 'replan',
    now: input.now,
  })
  return {
    plannerRun,
    planId,
    replanInput: {
      ...request,
      planId,
      plannerRunId: plannerRun.id,
    },
  }
}

export function buildRuntimeAgentReplanResult(input: {
  planId: string
  plannerRunId: string
  result: ReplanRunResult
  snapshot: AgentPlanSnapshot
}): JSONValue {
  return {
    status: 'updated',
    planId: input.planId,
    plannerRunId: input.plannerRunId,
    createdTaskIds: input.result.createdTaskIds,
    updatedTaskIds: input.result.updatedTaskIds,
    resetTaskIds: input.result.resetTaskIds,
    ...(input.result.dispatch ? { dispatch: input.result.dispatch } : {}),
    snapshot: input.snapshot,
  } as unknown as JSONValue
}
