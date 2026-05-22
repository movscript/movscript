import type { AgentStore } from '../state/store.js'
import type { AgentTask } from '../state/types.js'
import {
  markTaskReplanPending,
  markTaskRetryPending,
} from '../state/planTaskLifecycle.js'
import {
  buildReplanTaskResetPolicy,
  hasReplanTaskResetPolicy,
  retryablePlanTask,
  shouldResetTaskForRetaskGraph,
} from '../state/planWorkerMaintenance.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'

export interface RuntimeTaskGraphTaskChange {
  task: AgentTask
  previousTask: AgentTask
}

export interface RuntimeRetryablePlanTasksResult {
  retriedTaskIds: string[]
  changes: RuntimeTaskGraphTaskChange[]
}

export function resetRetryableRuntimeTaskGraphTasks(input: {
  store: Pick<AgentStore, 'listTasks' | 'listRuns' | 'updateTask'>
  taskGraphId: string
  maxTaskAttempts: number
  now: string
}): RuntimeRetryablePlanTasksResult {
  const changes: RuntimeTaskGraphTaskChange[] = []
  const retriedTaskIds: string[] = []

  for (const task of input.store.listTasks(input.taskGraphId)) {
    const attempts = input.store.listRuns({ taskGraphId: input.taskGraphId, taskId: task.id, role: 'worker' }).length
    const retry = retryablePlanTask({ task, attempts, defaultMaxTaskAttempts: input.maxTaskAttempts })
    if (!retry) continue

    const previousTask = snapshotTaskForProtocolEvent(task)
    markTaskRetryPending(task, { attempts, maxTaskAttempts: retry.maxTaskAttempts, now: input.now })
    input.store.updateTask(task)
    retriedTaskIds.push(task.id)
    changes.push({ task, previousTask })
  }

  return { retriedTaskIds, changes }
}

export function applyRuntimeRetryablePlanTaskReset(input: {
  store: Pick<AgentStore, 'listTasks' | 'listRuns' | 'updateTask'>
  taskGraphId: string
  maxTaskAttempts: number
  now: string
  onTaskReset?: (task: AgentTask, previousTask: AgentTask) => void
  onTasksReset?: (retriedTaskIds: string[]) => void
}): RuntimeRetryablePlanTasksResult {
  const result = resetRetryableRuntimeTaskGraphTasks(input)
  for (const { task, previousTask } of result.changes) {
    input.onTaskReset?.(task, previousTask)
  }
  if (result.retriedTaskIds.length > 0) {
    input.onTasksReset?.(result.retriedTaskIds)
  }
  return result
}

export interface RuntimeReplanTaskResetResult {
  resetTaskIds: string[]
  changes: RuntimeTaskGraphTaskChange[]
}

export function resetRuntimeTaskGraphTasksForRetaskGraph(input: {
  store: Pick<AgentStore, 'listTasks' | 'updateTask'>
  taskGraphId: string
  resetTaskIds?: unknown
  resetBlocked?: unknown
  resetNeedsReview?: unknown
  resetFailed?: unknown
  resetCancelled?: unknown
  now: string
}): RuntimeReplanTaskResetResult {
  const resetTaskIds: string[] = []
  const changes: RuntimeTaskGraphTaskChange[] = []
  const policy = buildReplanTaskResetPolicy(input)
  if (!hasReplanTaskResetPolicy(policy)) return { resetTaskIds, changes }

  for (const task of input.store.listTasks(input.taskGraphId)) {
    if (!shouldResetTaskForRetaskGraph(task, policy)) continue

    const previousTask = snapshotTaskForProtocolEvent(task)
    markTaskReplanPending(task, input.now)
    input.store.updateTask(task)
    resetTaskIds.push(task.id)
    changes.push({ task, previousTask })
  }

  return { resetTaskIds, changes }
}

export function applyRuntimeReplanTaskReset(input: {
  store: Pick<AgentStore, 'listTasks' | 'updateTask'>
  taskGraphId: string
  resetTaskIds?: unknown
  resetBlocked?: unknown
  resetNeedsReview?: unknown
  resetFailed?: unknown
  resetCancelled?: unknown
  now: string
  onTaskReset?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimeReplanTaskResetResult {
  const result = resetRuntimeTaskGraphTasksForRetaskGraph(input)
  for (const { task, previousTask } of result.changes) {
    input.onTaskReset?.(task, previousTask)
  }
  return result
}
