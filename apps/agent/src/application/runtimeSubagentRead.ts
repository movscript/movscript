import { buildSubagentSnapshotView } from '../state/planContextView.js'
import { normalizePositiveInteger } from '../state/planTaskInput.js'
import { resolveSubagentNameInput as resolveSubagentNameInputState } from '../state/subagentNameValidation.js'
import { resolveSubagentWaitTarget } from '../state/subagentWaitTarget.js'
import type { AgentStore } from '../state/store.js'
import type { AgentPlanSnapshot, JSONValue } from '../state/types.js'
import {
  requireRuntimePlannerRun,
  resolveRuntimePlannerRunPlanId,
} from './runtimePlanBinding.js'

export interface RuntimeSubagentListResult {
  status: 'ok'
  planId: string
  plannerRunId: string
  snapshot: Record<string, JSONValue>
}

export interface RuntimeSubagentWaitResult {
  status: string
  done: boolean
  target: Record<string, JSONValue>
  planId: string
  plannerRunId: string
  snapshot: Record<string, JSONValue>
}

export function listRuntimeSubagents(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'listPlans' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: string
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
}): RuntimeSubagentListResult {
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  const planId = resolveRuntimePlannerRunPlanId({
    store: input.store,
    plannerRun,
    inputPlanId: input.request?.planId,
    source: 'movscript_list_subagents',
    action: 'inspect',
    now: input.now,
  })
  return {
    status: 'ok',
    planId,
    plannerRunId: plannerRun.id,
    snapshot: buildSubagentSnapshotView({ snapshot: input.getPlanSnapshot(planId), plannerRunId: plannerRun.id }),
  }
}

export async function waitRuntimeSubagent(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'getTask' | 'listPlans' | 'listTasks' | 'updateRun' | 'updatePlan'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: string
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  currentTimeMs?: () => number
  sleep?: (ms: number) => Promise<void>
}): Promise<RuntimeSubagentWaitResult> {
  const request = input.request ?? {}
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  const planId = resolveRuntimePlannerRunPlanId({
    store: input.store,
    plannerRun,
    inputPlanId: request.planId,
    source: 'movscript_wait_subagent',
    action: 'wait on',
    now: input.now,
  })
  const nowMs = input.currentTimeMs ?? (() => Date.now())
  const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = Math.min(30_000, Math.max(0, normalizePositiveInteger(request.timeoutMs) ?? 0))
  const deadline = nowMs() + timeoutMs
  const resolvedInput = resolveSubagentNameInputState({ planId, rawInput: request, tasks: input.store.listTasks(planId) })
  const resolveTarget = () => resolveSubagentWaitTarget({
    planId,
    runId: resolvedInput.runId,
    taskId: resolvedInput.taskId,
    getRun: (runId) => input.store.getRun(runId),
    getTask: (taskId) => input.store.getTask(taskId),
    getPlan: (targetPlanId) => input.store.getPlan(targetPlanId),
  })
  let result = resolveTarget()
  while (!result.done && nowMs() < deadline) {
    await sleep(100)
    result = resolveTarget()
  }
  return {
    status: result.status,
    done: result.done,
    target: result.target,
    planId,
    plannerRunId: plannerRun.id,
    snapshot: buildSubagentSnapshotView({ snapshot: input.getPlanSnapshot(planId), plannerRunId: plannerRun.id }),
  }
}
