import type { JSONValue } from '../types.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask, UpdatePlanTaskInput } from '../state/types.js'
import { resolveTaskOwnerRunId } from '../state/planTaskOwner.js'
import { buildSubagentSnapshotView } from '../state/planContextView.js'
import { resolveSubagentNameInput as resolveSubagentNameInputState } from '../state/subagentNameValidation.js'
import { toSubagentRunSummary } from '../state/subagentRunView.js'
import {
  buildPendingSubagentTaskCancellationUpdate,
  subagentTaskTarget,
} from '../state/subagentTaskCancellation.js'
import { requireRuntimeRun, requireRuntimeTask } from './runtimeStoreLookup.js'
import type { AgentPlanSnapshot } from '../state/types.js'

export type RuntimeSubagentCancellationTarget =
  | {
    kind: 'pending_task'
    planId: string
    plannerRunId: string
    taskId: string
  }
  | {
    kind: 'run'
    planId: string
    plannerRunId: string
    runId: string
  }

export function resolveRuntimeSubagentCancellationTarget(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'listTasks'>
  plannerRun: AgentRun
  request?: Record<string, JSONValue>
}): RuntimeSubagentCancellationTarget {
  const { store, plannerRun } = input
  const planId = plannerRun.planId
  if (!planId) throw new Error('cancel_subagent requires the planner run to be attached to a plan')
  const request = input.request ?? {}
  const resolvedInput = resolveSubagentNameInputState({ planId, rawInput: request, tasks: store.listTasks(planId) })
  const taskId = normalizeNonEmptyString(resolvedInput.taskId)
  const runId = normalizeNonEmptyString(resolvedInput.runId) ?? resolveTaskOwnerRunId({
    planId,
    taskIdInput: taskId,
    getTask: (targetTaskId) => store.getTask(targetTaskId),
  })
  if (!runId && !taskId) throw new Error('cancel_subagent requires runId or taskId')
  if (!runId && taskId) return {
    kind: 'pending_task',
    planId,
    plannerRunId: plannerRun.id,
    taskId,
  }

  const targetRunId = runId!
  const childRun = requireRuntimeRun(store, targetRunId)
  if (childRun.planId !== planId) throw new Error(`run ${targetRunId} does not belong to plan ${planId}`)
  if (childRun.role !== 'worker') {
    throw new Error(`cancel_subagent can only cancel worker subagent runs`)
  }
  return {
    kind: 'run',
    planId,
    plannerRunId: plannerRun.id,
    runId: targetRunId,
  }
}

export function cancelPendingRuntimeSubagentTask(input: {
  store: Pick<AgentStore, 'getTask'>
  plannerRun: AgentRun
  taskId: string
  reason?: unknown
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
}): {
  status: 'cancelled' | 'unchanged'
  planId: string
  plannerRunId: string
  target: { kind: 'task'; task: JSONValue }
  cancelledRunIds: string[]
} {
  const { store, plannerRun, taskId, reason, updateTask } = input
  const planId = plannerRun.planId
  if (!planId) throw new Error('cancel_subagent requires the planner run to be attached to a plan')
  const task = requireRuntimeTask(store, taskId)
  if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
  if (task.ownerRunId) throw new Error(`task ${taskId} is already owned by run ${task.ownerRunId}`)
  const cancellationUpdate = buildPendingSubagentTaskCancellationUpdate({
    task,
    plannerRunId: plannerRun.id,
    reason,
  })
  const cancelledTask = cancellationUpdate ? updateTask(task.id, cancellationUpdate) : task
  return {
    status: cancellationUpdate ? 'cancelled' : 'unchanged',
    planId,
    plannerRunId: plannerRun.id,
    target: {
      kind: 'task',
      task: subagentTaskTarget(cancelledTask) as unknown as JSONValue,
    },
    cancelledRunIds: [],
  }
}

export function buildRuntimeSubagentRunCancellationResult(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask'>
  plannerRun: AgentRun
  runId: string
  cancelledRunIds: string[]
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
}): {
  status: 'cancelled' | 'unchanged'
  planId: string
  plannerRunId: string
  target: { kind: 'run'; run: JSONValue }
  cancelledRunIds: string[]
  snapshot: Record<string, JSONValue>
} {
  const planId = input.plannerRun.planId
  if (!planId) throw new Error('cancel_subagent requires the planner run to be attached to a plan')
  const cancelledRun = requireRuntimeRun(input.store, input.runId)
  return {
    status: input.cancelledRunIds.length > 0 ? 'cancelled' : 'unchanged',
    planId,
    plannerRunId: input.plannerRun.id,
    target: {
      kind: 'run',
      run: toSubagentRunSummary(
        cancelledRun,
        cancelledRun.taskId ? input.store.getTask(cancelledRun.taskId) : undefined,
      ) as unknown as JSONValue,
    },
    cancelledRunIds: input.cancelledRunIds,
    snapshot: buildSubagentSnapshotView({ snapshot: input.getPlanSnapshot(planId), plannerRunId: input.plannerRun.id }),
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
