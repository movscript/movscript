import type { AgentStore } from '../state/store.js'
import type { AgentTask } from '../state/types.js'
import { markTimedOutWorkerTask } from '../state/planTaskLifecycle.js'
import { timedOutWorkerRun } from '../state/planWorkerMaintenance.js'

export interface RuntimeTimedOutPlanWorkersResult {
  timedOutRunIds: string[]
}

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

export function applyRuntimeTimedOutPlanWorkers(input: {
  store: Pick<AgentStore, 'listRuns' | 'getTask' | 'updateTask'>
  planId: string
  defaultTimeoutMs?: number
  nowMs: number
  now: string
  cancelRun: (runId: string, reason: string) => void
  syncTaskFromRun: (runId: string) => void
  onTaskTimedOut?: (task: AgentTask) => void
}): RuntimeTimedOutPlanWorkersResult {
  const timedOutRunIds: string[] = []
  for (const run of input.store.listRuns({ planId: input.planId, role: 'worker' })) {
    const task = run.taskId ? input.store.getTask(run.taskId) : undefined
    const timeout = timedOutWorkerRun({
      run,
      task,
      defaultTimeoutMs: input.defaultTimeoutMs,
      nowMs: input.nowMs,
    })
    if (!timeout) continue
    input.cancelRun(run.id, `Worker run timed out after ${timeout.timeoutMs}ms.`)
    input.syncTaskFromRun(run.id)
    const updatedTask = run.taskId ? markRuntimeTimedOutWorkerTask({
      store: input.store,
      taskId: run.taskId,
      workerRunId: run.id,
      timeoutMs: timeout.timeoutMs,
      now: input.now,
    }) : undefined
    if (updatedTask) input.onTaskTimedOut?.(updatedTask)
    timedOutRunIds.push(run.id)
  }
  return { timedOutRunIds }
}
