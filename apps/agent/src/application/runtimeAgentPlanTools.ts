import type { JSONValue } from '../types.js'
import type {
  AgentPlanSnapshot,
  AgentRun,
  CreatePlanInput,
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

export async function applyRuntimeAgentPlanCreationToolFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: () => string
  createPlan: (planInput: CreatePlanInput) => Promise<AgentPlanSnapshot>
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
}): Promise<JSONValue> {
  const creation = prepareRuntimeAgentPlanCreation({
    store: input.store,
    plannerRunId: input.plannerRunId,
    now: input.now(),
  })
  if (creation.status !== 'create') {
    return buildRuntimeAgentPlanToolResult({
      status: creation.status,
      planId: creation.planId,
      plannerRunId: creation.plannerRun.id,
      snapshot: input.getPlanSnapshot(creation.planId),
    })
  }

  const snapshot = await input.createPlan({
    ...input.request,
    threadId: creation.plannerRun.threadId,
    createPlannerRun: false,
  })
  const finalized = finalizeRuntimeAgentPlanCreation({
    store: input.store,
    plannerRunId: creation.plannerRun.id,
    planId: snapshot.plan.id,
    taskCount: snapshot.tasks.length,
    now: input.now(),
  })
  return buildRuntimeAgentPlanToolResult({
    status: 'created',
    planId: finalized.planId,
    plannerRunId: finalized.plannerRun.id,
    snapshot: input.getPlanSnapshot(finalized.planId),
  })
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

export function applyRuntimeAgentReplanToolFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: () => string
  replanRun: (runId: string, replanInput: ReplanRunInput) => ReplanRunResult
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
}): JSONValue {
  const prepared = prepareRuntimeAgentReplan({
    store: input.store,
    plannerRunId: input.plannerRunId,
    request: input.request,
    now: input.now(),
  })
  const result = input.replanRun(prepared.plannerRun.id, prepared.replanInput)
  return buildRuntimeAgentReplanResult({
    planId: prepared.planId,
    plannerRunId: prepared.plannerRun.id,
    result,
    snapshot: input.getPlanSnapshot(prepared.planId),
  })
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
