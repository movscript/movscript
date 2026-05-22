import type { AgentRun, AgentTask } from './types.js'

export function assertRunCanOwnTask(ownerRun: AgentRun, task: AgentTask): void {
  if (ownerRun.taskGraphId !== task.taskGraphId) {
    throw new Error(`owner run ${ownerRun.id} does not belong to taskGraph ${task.taskGraphId}`)
  }
  if (ownerRun.taskId && ownerRun.taskId !== task.id) {
    throw new Error(`owner run ${ownerRun.id} is attached to task ${ownerRun.taskId}, not task ${task.id}`)
  }
}

export function resolveTaskOwnerRunId(input: {
  taskGraphId: string
  taskIdInput: unknown
  getTask: (taskId: string) => AgentTask | undefined
}): string | undefined {
  const taskId = normalizeNonEmptyString(input.taskIdInput)
  if (!taskId) return undefined
  const task = input.getTask(taskId)
  if (!task) throw new Error(`task not found: ${taskId}`)
  if (task.taskGraphId !== input.taskGraphId) throw new Error(`task ${taskId} does not belong to taskGraph ${input.taskGraphId}`)
  return task.ownerRunId
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
