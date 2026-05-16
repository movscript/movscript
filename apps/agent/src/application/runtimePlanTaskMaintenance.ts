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
  shouldResetTaskForReplan,
} from '../state/planWorkerMaintenance.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'

export interface RuntimePlanTaskChange {
  task: AgentTask
  previousTask: AgentTask
}

export interface RuntimeRetryablePlanTasksResult {
  retriedTaskIds: string[]
  changes: RuntimePlanTaskChange[]
}

export function resetRetryableRuntimePlanTasks(input: {
  store: Pick<AgentStore, 'listTasks' | 'listRuns' | 'updateTask'>
  planId: string
  maxTaskAttempts: number
  now: string
}): RuntimeRetryablePlanTasksResult {
  const changes: RuntimePlanTaskChange[] = []
  const retriedTaskIds: string[] = []

  for (const task of input.store.listTasks(input.planId)) {
    const attempts = input.store.listRuns({ planId: input.planId, taskId: task.id, role: 'worker' }).length
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

export interface RuntimeReplanTaskResetResult {
  resetTaskIds: string[]
  changes: RuntimePlanTaskChange[]
}

export function resetRuntimePlanTasksForReplan(input: {
  store: Pick<AgentStore, 'listTasks' | 'updateTask'>
  planId: string
  resetTaskIds?: unknown
  resetBlocked?: unknown
  resetNeedsReview?: unknown
  resetFailed?: unknown
  resetCancelled?: unknown
  now: string
}): RuntimeReplanTaskResetResult {
  const resetTaskIds: string[] = []
  const changes: RuntimePlanTaskChange[] = []
  const policy = buildReplanTaskResetPolicy(input)
  if (!hasReplanTaskResetPolicy(policy)) return { resetTaskIds, changes }

  for (const task of input.store.listTasks(input.planId)) {
    if (!shouldResetTaskForReplan(task, policy)) continue

    const previousTask = snapshotTaskForProtocolEvent(task)
    markTaskReplanPending(task, input.now)
    input.store.updateTask(task)
    resetTaskIds.push(task.id)
    changes.push({ task, previousTask })
  }

  return { resetTaskIds, changes }
}
