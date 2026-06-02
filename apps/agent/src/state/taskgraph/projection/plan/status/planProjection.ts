import type { AgentTaskGraph, AgentTask } from '../../../../shared/types.js'
import { normalizeProgress } from '../../../input/task/planTaskInput.js'

export interface PlanTaskProjectionResult {
  previousStatus: AgentTaskGraph['status']
  nextStatus: AgentTaskGraph['status']
  completedNow: boolean
}

export function projectTasksOntoTaskGraph(taskGraph: AgentTaskGraph, tasks: AgentTask[], now: string): PlanTaskProjectionResult {
  const previousStatus = taskGraph.status
  const progress = tasks.length === 0
    ? taskGraph.progress
    : tasks.reduce((sum, task) => sum + normalizeProgress(task.progress)!, 0) / tasks.length
  const nextStatus = resolvePlanStatusFromTasks(taskGraph.status, tasks)
  taskGraph.progress = Math.max(0, Math.min(1, progress))
  taskGraph.status = nextStatus
  taskGraph.updatedAt = now
  if (nextStatus === 'done' && !taskGraph.completedAt) taskGraph.completedAt = now
  if (nextStatus === 'failed' && !taskGraph.failedAt) taskGraph.failedAt = now
  if (nextStatus === 'cancelled' && !taskGraph.cancelledAt) taskGraph.cancelledAt = now
  const firstBlocked = tasks.find((task) => task.status === 'blocked' && task.blockedReason)
  if (firstBlocked?.blockedReason) taskGraph.blockedReason = firstBlocked.blockedReason
  else delete taskGraph.blockedReason
  return {
    previousStatus,
    nextStatus,
    completedNow: previousStatus !== 'done' && nextStatus === 'done',
  }
}

export function resolvePlanStatusFromTasks(currentStatus: AgentTaskGraph['status'], tasks: AgentTask[]): AgentTaskGraph['status'] {
  const statuses = new Set(tasks.map((task) => task.status))
  return statuses.has('failed') ? 'failed'
    : statuses.has('cancelled') && tasks.every((task) => task.status === 'cancelled') ? 'cancelled'
      : statuses.has('blocked') ? 'blocked'
        : statuses.has('needs_review') ? 'needs_review'
          : tasks.length > 0 && tasks.every((task) => task.status === 'done') ? 'done'
            : statuses.has('running') ? 'running'
              : tasks.length > 0 && tasks.every((task) => task.status === 'pending') ? 'pending'
                : tasks.length > 0 ? 'running'
                  : currentStatus
}
