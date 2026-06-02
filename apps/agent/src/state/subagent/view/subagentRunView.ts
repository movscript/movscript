import type { AgentTaskGraph, AgentRun, AgentTask, JSONValue } from '../../shared/types.js'
import { subagentNameFromRun, subagentNameFromTask } from '../identity/subagentIdentity.js'

export type SubagentWaitStatus = 'completed' | 'failed' | 'cancelled' | 'blocked' | 'needs_review' | 'pending'

export function toSubagentRunSummary(run: AgentRun, task?: AgentTask): Record<string, JSONValue> {
  const subagentName = subagentNameFromRun(run) ?? (task ? subagentNameFromTask(task) : undefined)
  return {
    id: run.id,
    ...(subagentName ? { subagentName } : {}),
    threadId: run.threadId,
    status: run.status,
    ...(run.role ? { role: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.taskGraphId ? { taskGraphId: run.taskGraphId } : {}),
    ...(run.taskId ? { taskId: run.taskId } : {}),
    ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
    ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.cancelledAt ? { cancelledAt: run.cancelledAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings?.length ? { warnings: run.warnings } : {}),
    stepCount: run.steps.length,
    pendingApprovalCount: (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length,
    pendingInputCount: (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length,
  }
}

export function isTerminalRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'requires_action' || status === 'failed' || status === 'cancelled'
}

export function isTerminalPlanStatus(status: AgentTaskGraph['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

export function waitStatusFromRunStatus(status: AgentRun['status']): Exclude<SubagentWaitStatus, 'needs_review'> {
  if (status === 'completed' || status === 'completed_with_warnings') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'requires_action') return 'blocked'
  return 'pending'
}

export function waitStatusFromTaskStatus(status: AgentTask['status']): SubagentWaitStatus {
  if (status === 'done') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'blocked') return 'blocked'
  if (status === 'needs_review') return 'needs_review'
  return 'pending'
}

export function waitStatusFromPlanStatus(status: AgentTaskGraph['status']): SubagentWaitStatus {
  if (status === 'done') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'blocked') return 'blocked'
  if (status === 'needs_review') return 'needs_review'
  return 'pending'
}
