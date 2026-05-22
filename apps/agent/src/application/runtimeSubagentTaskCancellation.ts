import type { JSONValue } from '../types.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask, UpdateTaskGraphTaskInput } from '../state/types.js'
import { resolveTaskOwnerRunId } from '../state/planTaskOwner.js'
import { buildSubagentSnapshotView } from '../state/planContextView.js'
import { resolveSubagentNameInput as resolveSubagentNameInputState } from '../state/subagentNameValidation.js'
import { toSubagentRunSummary } from '../state/subagentRunView.js'
import {
  buildPendingSubagentTaskCancellationUpdate,
  subagentTaskTarget,
} from '../state/subagentTaskCancellation.js'
import { requireRuntimePlannerRun } from './runtimePlanBinding.js'
import { requireRuntimeRun, requireRuntimeTask } from './runtimeStoreLookup.js'
import type { AgentTaskGraphSnapshot } from '../state/types.js'

export type RuntimeSubagentCancellationTarget =
  | {
    kind: 'pending_task'
    taskGraphId: string
    plannerRunId: string
    taskId: string
  }
  | {
    kind: 'run'
    taskGraphId: string
    plannerRunId: string
    runId: string
  }

export function resolveRuntimeSubagentCancellationTarget(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'listTasks'>
  plannerRun: AgentRun
  request?: Record<string, JSONValue>
}): RuntimeSubagentCancellationTarget {
  const { store, plannerRun } = input
  const taskGraphId = plannerRun.taskGraphId
  if (!taskGraphId) throw new Error('task-graph subagent cancellation requires the planner run to be attached to a task graph')
  const request = input.request ?? {}
  const resolvedInput = resolveSubagentNameInputState({ taskGraphId, rawInput: request, tasks: store.listTasks(taskGraphId) })
  const taskId = normalizeNonEmptyString(resolvedInput.taskId)
  const runId = normalizeNonEmptyString(resolvedInput.runId) ?? resolveTaskOwnerRunId({
    taskGraphId,
    taskIdInput: taskId,
    getTask: (targetTaskId) => store.getTask(targetTaskId),
  })
  if (!runId && !taskId) throw new Error('cancel_subagent requires runId or taskId')
  if (!runId && taskId) return {
    kind: 'pending_task',
    taskGraphId,
    plannerRunId: plannerRun.id,
    taskId,
  }

  const targetRunId = runId!
  const childRun = requireRuntimeRun(store, targetRunId)
  if (childRun.taskGraphId !== taskGraphId) throw new Error(`run ${targetRunId} does not belong to task graph ${taskGraphId}`)
  if (childRun.role !== 'worker') {
    throw new Error(`cancel_subagent can only cancel worker subagent runs`)
  }
  return {
    kind: 'run',
    taskGraphId,
    plannerRunId: plannerRun.id,
    runId: targetRunId,
  }
}

export function cancelPendingRuntimeSubagentTask(input: {
  store: Pick<AgentStore, 'getTask'>
  plannerRun: AgentRun
  taskId: string
  reason?: unknown
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
}): {
  status: 'cancelled' | 'unchanged'
  taskGraphId: string
  plannerRunId: string
  target: { kind: 'task'; task: JSONValue }
  cancelledRunIds: string[]
} {
  const { store, plannerRun, taskId, reason, updateTask } = input
  const taskGraphId = plannerRun.taskGraphId
  if (!taskGraphId) throw new Error('task-graph subagent cancellation requires the planner run to be attached to a task graph')
  const task = requireRuntimeTask(store, taskId)
  if (task.taskGraphId !== taskGraphId) throw new Error(`task ${taskId} does not belong to task graph ${taskGraphId}`)
  if (task.ownerRunId) throw new Error(`task ${taskId} is already owned by run ${task.ownerRunId}`)
  const cancellationUpdate = buildPendingSubagentTaskCancellationUpdate({
    task,
    plannerRunId: plannerRun.id,
    reason,
  })
  const cancelledTask = cancellationUpdate ? updateTask(task.id, cancellationUpdate) : task
  return {
    status: cancellationUpdate ? 'cancelled' : 'unchanged',
    taskGraphId,
    plannerRunId: plannerRun.id,
    target: {
      kind: 'task',
      task: subagentTaskTarget(cancelledTask) as unknown as JSONValue,
    },
    cancelledRunIds: [],
  }
}

export function buildRuntimePendingSubagentTaskCancellationResult(input: {
  result: ReturnType<typeof cancelPendingRuntimeSubagentTask>
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
}): ReturnType<typeof cancelPendingRuntimeSubagentTask> & {
  snapshot: Record<string, JSONValue>
} {
  return {
    ...input.result,
    snapshot: buildSubagentSnapshotView({
      snapshot: input.getTaskGraphSnapshot(input.result.taskGraphId),
      plannerRunId: input.result.plannerRunId,
    }),
  }
}

export function buildRuntimeSubagentRunCancellationResult(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask'>
  plannerRun: AgentRun
  runId: string
  cancelledRunIds: string[]
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
}): {
  status: 'cancelled' | 'unchanged'
  taskGraphId: string
  plannerRunId: string
  target: { kind: 'run'; run: JSONValue }
  cancelledRunIds: string[]
  snapshot: Record<string, JSONValue>
} {
  const taskGraphId = input.plannerRun.taskGraphId
  if (!taskGraphId) throw new Error('task-graph subagent cancellation requires the planner run to be attached to a task graph')
  const cancelledRun = requireRuntimeRun(input.store, input.runId)
  return {
    status: input.cancelledRunIds.length > 0 ? 'cancelled' : 'unchanged',
    taskGraphId,
    plannerRunId: input.plannerRun.id,
    target: {
      kind: 'run',
      run: toSubagentRunSummary(
        cancelledRun,
        cancelledRun.taskId ? input.store.getTask(cancelledRun.taskId) : undefined,
      ) as unknown as JSONValue,
    },
    cancelledRunIds: input.cancelledRunIds,
    snapshot: buildSubagentSnapshotView({ snapshot: input.getTaskGraphSnapshot(taskGraphId), plannerRunId: input.plannerRun.id }),
  }
}

export function applyRuntimeSubagentCancellationFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'listTasks' | 'listRuns'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  cancelSubtree: (runId: string, input?: { reason?: unknown }) => { cancelledRunIds: string[] }
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
}): JSONValue {
  const request = input.request ?? {}
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  if (!plannerRun.taskGraphId && typeof request.taskGraphId !== 'string') {
    const runId = normalizeNonEmptyString(request.runId)
      ?? runIdForSubagentName(input.store.listRuns({ parentRunId: plannerRun.id }), request.subagentName)
    if (!runId) throw new Error('cancel_subagent requires runId or subagentName')
    const targetRun = requireRuntimeRun(input.store, runId)
    if (targetRun.parentRunId !== plannerRun.id) throw new Error(`run ${runId} is not a child of planner run ${plannerRun.id}`)
    const result = input.cancelSubtree(runId, { reason: request.reason })
    return {
      status: result.cancelledRunIds.length > 0 ? 'cancelled' : 'unchanged',
      plannerRunId: plannerRun.id,
      target: {
        kind: 'run',
        run: toSubagentRunSummary(targetRun) as unknown as JSONValue,
      },
      cancelledRunIds: result.cancelledRunIds,
      snapshot: {
        schema: 'movscript.agent.child-agent-monitor.v1',
        plannerRunId: plannerRun.id,
        runs: input.store.listRuns({ parentRunId: plannerRun.id }).map((run) => toSubagentRunSummary(run) as unknown as JSONValue),
      },
    } as unknown as JSONValue
  }
  const target = resolveRuntimeSubagentCancellationTarget({
    store: input.store,
    plannerRun,
    request,
  })
  if (target.kind === 'pending_task') {
    const result = cancelPendingRuntimeSubagentTask({
      store: input.store,
      plannerRun,
      taskId: target.taskId,
      reason: request.reason,
      updateTask: input.updateTask,
    })
    return buildRuntimePendingSubagentTaskCancellationResult({
      result,
      getTaskGraphSnapshot: input.getTaskGraphSnapshot,
    }) as unknown as JSONValue
  }

  const result = input.cancelSubtree(target.runId, { reason: request.reason })
  return buildRuntimeSubagentRunCancellationResult({
    store: input.store,
    plannerRun,
    runId: target.runId,
    cancelledRunIds: result.cancelledRunIds,
    getTaskGraphSnapshot: input.getTaskGraphSnapshot,
  }) as unknown as JSONValue
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function runIdForSubagentName(runs: AgentRun[], value: unknown): string | undefined {
  const name = normalizeNonEmptyString(value)
  if (!name) return undefined
  return runs.find((run) => run.metadata?.subagentName === name)?.id
}
