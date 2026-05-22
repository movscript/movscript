import { buildSubagentSnapshotView } from '../state/planContextView.js'
import { normalizePositiveInteger } from '../state/planTaskInput.js'
import { resolveSubagentNameInput as resolveSubagentNameInputState } from '../state/subagentNameValidation.js'
import { resolveSubagentWaitTarget } from '../state/subagentWaitTarget.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTaskGraphSnapshot, JSONValue } from '../state/types.js'
import {
  requireRuntimePlannerRun,
  resolveRuntimePlannerRunPlanId,
} from './runtimePlanBinding.js'

export interface RuntimeSubagentListResult {
  status: 'ok'
  taskGraphId?: string
  plannerRunId: string
  snapshot: Record<string, JSONValue>
}

export interface RuntimeSubagentWaitResult {
  status: string
  done: boolean
  target: Record<string, JSONValue>
  taskGraphId?: string
  plannerRunId: string
  snapshot: Record<string, JSONValue>
}

export function listRuntimeSubagents(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph' | 'listTaskGraphs' | 'listRuns' | 'updateRun' | 'updateTaskGraph'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: string
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
}): RuntimeSubagentListResult {
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  if (!plannerRun.taskGraphId && typeof input.request?.taskGraphId !== 'string') {
    return {
      status: 'ok',
      plannerRunId: plannerRun.id,
      snapshot: buildDirectSubagentSnapshot(plannerRun, input.store.listRuns({ parentRunId: plannerRun.id })),
    }
  }
  const taskGraphId = resolveRuntimePlannerRunPlanId({
    store: input.store,
    plannerRun,
    inputPlanId: input.request?.taskGraphId,
    source: 'core_subagent_list',
    action: 'inspect',
    now: input.now,
  })
  return {
    status: 'ok',
    taskGraphId,
    plannerRunId: plannerRun.id,
    snapshot: {
      ...buildSubagentSnapshotView({ snapshot: input.getTaskGraphSnapshot(taskGraphId), plannerRunId: plannerRun.id }),
      runs: buildDirectSubagentRuns(input.store.listRuns({ parentRunId: plannerRun.id })),
    } as unknown as Record<string, JSONValue>,
  }
}

export async function waitRuntimeSubagent(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph' | 'getTask' | 'listTaskGraphs' | 'listTasks' | 'listRuns' | 'updateRun' | 'updateTaskGraph'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: string
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  currentTimeMs?: () => number
  sleep?: (ms: number) => Promise<void>
}): Promise<RuntimeSubagentWaitResult> {
  const request = input.request ?? {}
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  const nowMs = input.currentTimeMs ?? (() => Date.now())
  const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = Math.min(30_000, Math.max(0, normalizePositiveInteger(request.timeoutMs) ?? 0))
  const deadline = nowMs() + timeoutMs
  const requestedRunId = normalizeNonEmptyString(request.runId)
  const requestedName = normalizeNonEmptyString(request.subagentName)
  const shouldUseDirectTarget = typeof request.taskGraphId !== 'string'
    && typeof request.taskId !== 'string'
    && (!plannerRun.taskGraphId
      || (!!requestedRunId && !!input.store.listRuns({ parentRunId: plannerRun.id }).find((run) => run.id === requestedRunId && !run.taskGraphId))
      || (!!requestedName && !!input.store.listRuns({ parentRunId: plannerRun.id }).find((run) => run.metadata?.subagentName === requestedName && !run.taskGraphId)))
  if (shouldUseDirectTarget) {
    const resolveDirectTarget = () => resolveDirectSubagentTarget({
      plannerRun,
      request,
      runs: input.store.listRuns({ parentRunId: plannerRun.id }),
      getRun: (runId) => input.store.getRun(runId),
    })
    let direct = resolveDirectTarget()
    while (!direct.done && nowMs() < deadline) {
      await sleep(100)
      direct = resolveDirectTarget()
    }
    return {
      status: direct.status,
      done: direct.done,
      target: direct.target,
      plannerRunId: plannerRun.id,
      snapshot: buildDirectSubagentSnapshot(plannerRun, input.store.listRuns({ parentRunId: plannerRun.id })),
    }
  }
  const taskGraphId = resolveRuntimePlannerRunPlanId({
    store: input.store,
    plannerRun,
    inputPlanId: request.taskGraphId,
    source: 'core_subagent_wait',
    action: 'wait on',
    now: input.now,
  })
  const resolvedInput = resolveSubagentNameInputState({ taskGraphId, rawInput: request, tasks: input.store.listTasks(taskGraphId) })
  const resolveTarget = () => resolveSubagentWaitTarget({
    taskGraphId,
    runId: resolvedInput.runId,
    taskId: resolvedInput.taskId,
    getRun: (runId) => input.store.getRun(runId),
    getTask: (taskId) => input.store.getTask(taskId),
    getTaskGraph: (targetPlanId) => input.store.getTaskGraph(targetPlanId),
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
    taskGraphId,
    plannerRunId: plannerRun.id,
    snapshot: buildSubagentSnapshotView({ snapshot: input.getTaskGraphSnapshot(taskGraphId), plannerRunId: plannerRun.id }),
  }
}

function buildDirectSubagentSnapshot(plannerRun: AgentRun, runs: AgentRun[]): Record<string, JSONValue> {
  return {
    schema: 'movscript.agent.child-agent-monitor.v1',
    plannerRunId: plannerRun.id,
    runs: buildDirectSubagentRuns(runs),
  } as unknown as Record<string, JSONValue>
}

function buildDirectSubagentRuns(runs: AgentRun[]): JSONValue[] {
  return runs.map((run) => ({
      id: run.id,
      status: run.status,
      role: run.role,
      parentRunId: run.parentRunId,
      subagentName: typeof run.metadata?.subagentName === 'string' ? run.metadata.subagentName : undefined,
      taskId: run.taskId,
      taskGraphId: run.taskGraphId,
      progress: run.progress,
      blockedReason: run.blockedReason,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      failedAt: run.failedAt,
      cancelledAt: run.cancelledAt,
      error: run.error,
      warnings: run.warnings ?? [],
    }) as unknown as JSONValue)
}

function resolveDirectSubagentTarget(input: {
  plannerRun: AgentRun
  request: Record<string, JSONValue>
  runs: AgentRun[]
  getRun: (runId: string) => AgentRun | undefined
}): { status: string; done: boolean; target: Record<string, JSONValue> } {
  const requestedRunId = typeof input.request.runId === 'string' && input.request.runId.trim() ? input.request.runId.trim() : undefined
  const requestedName = typeof input.request.subagentName === 'string' && input.request.subagentName.trim() ? input.request.subagentName.trim() : undefined
  const run = requestedRunId
    ? input.getRun(requestedRunId)
    : requestedName
      ? input.runs.find((candidate) => candidate.metadata?.subagentName === requestedName)
      : input.runs[0]
  if (!run) throw new Error('wait_subagent requires runId or subagentName')
  if (run.parentRunId !== input.plannerRun.id) throw new Error(`run ${run.id} is not a child of planner run ${input.plannerRun.id}`)
  const done = run.status === 'completed'
    || run.status === 'completed_with_warnings'
    || run.status === 'failed'
    || run.status === 'cancelled'
  return {
    status: run.status,
    done,
    target: {
      kind: 'run',
      runId: run.id,
      subagentName: typeof run.metadata?.subagentName === 'string' ? run.metadata.subagentName : undefined,
      status: run.status,
    } as unknown as Record<string, JSONValue>,
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
