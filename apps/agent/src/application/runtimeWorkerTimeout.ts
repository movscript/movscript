import type { AgentStore } from '../state/store.js'
import type { AgentTask } from '../state/types.js'
import { markTimedOutWorkerTask } from '../state/planTaskLifecycle.js'

export function markRuntimeTimedOutWorkerTask(input: {
  store: Pick<AgentStore, 'getTask' | 'updateTask'>
  taskId: string
  workerRunId: string
  timeoutMs: number
  now: string
}): AgentTask | undefined {
  const task = input.store.getTask(input.taskId)
  if (!task) return undefined

  markTimedOutWorkerTask(task, {
    runId: input.workerRunId,
    timeoutMs: input.timeoutMs,
    now: input.now,
  })
  input.store.updateTask(task)
  return task
}
