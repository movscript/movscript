import type { AgentRun, AgentTask } from './types.js'
import { normalizeStringList, taskExecutionMaxTaskAttempts, taskExecutionWorkerTimeoutMs } from './planTaskInput.js'

export function timedOutWorkerRun(input: {
  run: AgentRun
  task?: AgentTask
  defaultTimeoutMs?: number
  nowMs: number
}): { timeoutMs: number } | undefined {
  if (input.run.status !== 'queued' && input.run.status !== 'in_progress') return undefined
  const timeoutMs = taskExecutionWorkerTimeoutMs(input.task, input.defaultTimeoutMs)
  if (!timeoutMs) return undefined
  const startedAt = new Date(input.run.startedAt ?? input.run.createdAt).getTime()
  if (!Number.isFinite(startedAt) || input.nowMs - startedAt < timeoutMs) return undefined
  return { timeoutMs }
}

export function retryablePlanTask(input: {
  task: AgentTask
  attempts: number
  defaultMaxTaskAttempts: number
}): { maxTaskAttempts: number } | undefined {
  if (input.task.status !== 'failed' && input.task.status !== 'cancelled') return undefined
  const maxTaskAttempts = taskExecutionMaxTaskAttempts(input.task, input.defaultMaxTaskAttempts)
  if (input.attempts >= maxTaskAttempts) return undefined
  return { maxTaskAttempts }
}

export interface ReplanTaskResetPolicy {
  explicitTaskIds: Set<string>
  resetBlocked: boolean
  resetNeedsReview: boolean
  resetFailed: boolean
  resetCancelled: boolean
}

export function buildReplanTaskResetPolicy(input: {
  resetTaskIds?: unknown
  resetBlocked?: unknown
  resetNeedsReview?: unknown
  resetFailed?: unknown
  resetCancelled?: unknown
}): ReplanTaskResetPolicy {
  return {
    explicitTaskIds: new Set(normalizeStringList(input.resetTaskIds)),
    resetBlocked: input.resetBlocked === true,
    resetNeedsReview: input.resetNeedsReview === true,
    resetFailed: input.resetFailed === true,
    resetCancelled: input.resetCancelled === true,
  }
}

export function shouldResetTaskForReplan(task: AgentTask, policy: ReplanTaskResetPolicy): boolean {
  const explicitlyReset = policy.explicitTaskIds.has(task.id)
  const selectedByStatus = (policy.resetBlocked && task.status === 'blocked')
    || (policy.resetNeedsReview && task.status === 'needs_review')
    || (policy.resetFailed && task.status === 'failed')
    || (policy.resetCancelled && task.status === 'cancelled')
  if (!explicitlyReset && !selectedByStatus) return false
  return explicitlyReset
    || task.status === 'blocked'
    || task.status === 'needs_review'
    || task.status === 'failed'
    || task.status === 'cancelled'
}

export function hasReplanTaskResetPolicy(policy: ReplanTaskResetPolicy): boolean {
  return policy.explicitTaskIds.size > 0
    || policy.resetBlocked
    || policy.resetNeedsReview
    || policy.resetFailed
    || policy.resetCancelled
}
