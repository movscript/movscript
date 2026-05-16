import type { AgentTask } from './types.js'

export function markTaskAssignedToPlannerRun(task: AgentTask, runId: string, now: string): AgentTask {
  task.status = 'running'
  task.progress = 0
  task.ownerRunId = runId
  task.startedAt = now
  task.updatedAt = now
  task.metadata = {
    ...(task.metadata ?? {}),
    executionMode: 'planner_inline',
  }
  delete task.blockedReason
  return task
}

export function markTaskDispatchedToWorker(task: AgentTask, runId: string, now: string): AgentTask {
  task.status = 'running'
  task.progress = 0
  task.ownerRunId = runId
  task.startedAt = now
  task.updatedAt = now
  delete task.blockedReason
  return task
}

export function markTaskDispatchBlocked(task: AgentTask, blockedReason: string, now: string): AgentTask {
  task.blockedReason = blockedReason
  task.updatedAt = now
  return task
}

export function markTaskRetryPending(task: AgentTask, input: {
  attempts: number
  maxTaskAttempts: number
  now: string
}): AgentTask {
  task.status = 'pending'
  task.progress = 0
  task.metadata = {
    ...(task.metadata ?? {}),
    retryAttempt: input.attempts + 1,
    maxTaskAttempts: input.maxTaskAttempts,
    previousOwnerRunId: task.ownerRunId ?? null,
  }
  delete task.ownerRunId
  delete task.blockedReason
  task.updatedAt = input.now
  return task
}

export function markTaskReplanPending(task: AgentTask, now: string): AgentTask {
  const previousStatus = task.status
  task.status = 'pending'
  task.progress = 0
  task.metadata = {
    ...(task.metadata ?? {}),
    replannedAt: now,
    previousOwnerRunId: task.ownerRunId ?? null,
    previousStatus,
  }
  delete task.ownerRunId
  delete task.blockedReason
  delete task.startedAt
  delete task.completedAt
  delete task.failedAt
  delete task.cancelledAt
  task.updatedAt = now
  return task
}

export function markTimedOutWorkerTask(task: AgentTask, input: {
  runId: string
  timeoutMs: number
  now: string
}): AgentTask {
  task.metadata = {
    ...(task.metadata ?? {}),
    timedOutRunId: input.runId,
    workerTimeoutMs: input.timeoutMs,
    previousOwnerRunId: input.runId,
    previousStatus: 'running',
  }
  task.updatedAt = input.now
  return task
}
