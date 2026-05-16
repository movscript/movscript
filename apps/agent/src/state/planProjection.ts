import type { AgentPlan, AgentTask } from './types.js'
import { normalizeProgress } from './planTaskInput.js'

export interface PlanTaskProjectionResult {
  previousStatus: AgentPlan['status']
  nextStatus: AgentPlan['status']
  completedNow: boolean
}

export function projectTasksOntoPlan(plan: AgentPlan, tasks: AgentTask[], now: string): PlanTaskProjectionResult {
  const previousStatus = plan.status
  const progress = tasks.length === 0
    ? plan.progress
    : tasks.reduce((sum, task) => sum + normalizeProgress(task.progress)!, 0) / tasks.length
  const nextStatus = resolvePlanStatusFromTasks(plan.status, tasks)
  plan.progress = Math.max(0, Math.min(1, progress))
  plan.status = nextStatus
  plan.updatedAt = now
  if (nextStatus === 'done' && !plan.completedAt) plan.completedAt = now
  if (nextStatus === 'failed' && !plan.failedAt) plan.failedAt = now
  if (nextStatus === 'cancelled' && !plan.cancelledAt) plan.cancelledAt = now
  const firstBlocked = tasks.find((task) => task.status === 'blocked' && task.blockedReason)
  if (firstBlocked?.blockedReason) plan.blockedReason = firstBlocked.blockedReason
  else delete plan.blockedReason
  return {
    previousStatus,
    nextStatus,
    completedNow: previousStatus !== 'done' && nextStatus === 'done',
  }
}

export function resolvePlanStatusFromTasks(currentStatus: AgentPlan['status'], tasks: AgentTask[]): AgentPlan['status'] {
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
