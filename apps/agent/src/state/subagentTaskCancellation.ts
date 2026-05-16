import type { AgentTask, JSONValue, UpdatePlanTaskInput } from './types.js'
import { subagentNameFromTask } from './subagentIdentity.js'

const DEFAULT_PENDING_SUBAGENT_CANCEL_REASON = 'Subagent task was cancelled before a worker run started.'

export function isPendingSubagentTaskCancellable(task: AgentTask): boolean {
  return task.status === 'pending' || task.status === 'blocked' || task.status === 'needs_review'
}

export function buildPendingSubagentTaskCancellationUpdate(input: {
  task: AgentTask
  plannerRunId: string
  reason?: unknown
}): UpdatePlanTaskInput | undefined {
  if (!isPendingSubagentTaskCancellable(input.task)) return undefined
  return {
    status: 'cancelled',
    progress: input.task.progress,
    blockedReason: normalizeNonEmptyString(input.reason) ?? DEFAULT_PENDING_SUBAGENT_CANCEL_REASON,
    metadata: {
      cancelledByPlannerRunId: input.plannerRunId,
    },
  }
}

export function subagentTaskTarget(task: AgentTask): Record<string, JSONValue> {
  return {
    ...task,
    ...(subagentNameFromTask(task) ? { subagentName: subagentNameFromTask(task) } : {}),
  } as unknown as Record<string, JSONValue>
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
