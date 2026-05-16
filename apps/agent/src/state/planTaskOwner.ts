import type { AgentRun, AgentTask } from './types.js'

export function assertRunCanOwnTask(ownerRun: AgentRun, task: AgentTask): void {
  if (ownerRun.planId !== task.planId) {
    throw new Error(`owner run ${ownerRun.id} does not belong to plan ${task.planId}`)
  }
  if (ownerRun.taskId && ownerRun.taskId !== task.id) {
    throw new Error(`owner run ${ownerRun.id} is attached to task ${ownerRun.taskId}, not task ${task.id}`)
  }
}

export function resolveTaskOwnerRunId(input: {
  planId: string
  taskIdInput: unknown
  getTask: (taskId: string) => AgentTask | undefined
}): string | undefined {
  const taskId = normalizeNonEmptyString(input.taskIdInput)
  if (!taskId) return undefined
  const task = input.getTask(taskId)
  if (!task) throw new Error(`task not found: ${taskId}`)
  if (task.planId !== input.planId) throw new Error(`task ${taskId} does not belong to plan ${input.planId}`)
  return task.ownerRunId
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
