import type { AgentRun, JSONValue } from './types.js'
import { cancelPendingRunInteractions } from './runInteractionState.js'

export const DEFAULT_RUN_CANCEL_REASON = '用户停止了当前会话。'

export function isActiveRunStatus(status: AgentRun['status']): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'requires_action'
}

export function isFinishedRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed'
}

export function isFinishedOrCancelledRunStatus(status: AgentRun['status']): boolean {
  return isFinishedRunStatus(status) || status === 'cancelled'
}

export function applyRunExecutionStart(run: AgentRun, startedAt: string): AgentRun {
  run.status = 'in_progress'
  run.startedAt = startedAt
  run.updatedAt = startedAt
  return run
}

export function applyRunCancellation(run: AgentRun, now: string, reason?: string): AgentRun {
  if (run.status === 'cancelled') return run
  const cancelReason = reason ?? DEFAULT_RUN_CANCEL_REASON
  const cancelledInteractions = cancelPendingRunInteractions(run, now)
  run.pendingApprovals = cancelledInteractions.pendingApprovals
  run.pendingInputRequests = cancelledInteractions.pendingInputRequests
  run.status = 'cancelled'
  run.cancelledAt = now
  run.completedAt = now
  run.updatedAt = now
  run.warnings = Array.from(new Set([...(run.warnings ?? []), cancelReason]))
  return run
}

export function applyRunCompletion(run: AgentRun, input: {
  now: string
  assistantMessageId: string
  warnings?: string[]
  metadataPatch?: Record<string, JSONValue>
}): AgentRun {
  const warnings = input.warnings && input.warnings.length > 0 ? [...input.warnings] : undefined
  run.assistantMessageId = input.assistantMessageId
  run.warnings = warnings
  if (input.metadataPatch) {
    run.metadata = {
      ...(run.metadata ?? {}),
      ...input.metadataPatch,
    }
  }
  run.status = warnings ? 'completed_with_warnings' : 'completed'
  run.completedAt = input.now
  run.updatedAt = input.now
  return run
}

export function applyRunFailure(run: AgentRun, now: string, error: string): AgentRun {
  run.status = 'failed'
  run.error = error
  run.failedAt = now
  run.updatedAt = now
  return run
}
