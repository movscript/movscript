import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask } from '../state/types.js'
import { projectRunOntoTask } from '../state/taskProjection.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'

export interface RuntimeTaskRunSyncResult {
  run: AgentRun
  task: AgentTask
  previousTask: AgentTask
  planId: string
}

export function syncRuntimeTaskFromRun(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask'>
  runId: string
  now: string
}): RuntimeTaskRunSyncResult | undefined {
  const run = input.store.getRun(input.runId)
  if (!run?.planId || !run.taskId) return undefined

  const task = input.store.getTask(run.taskId)
  if (!task) return undefined

  const previousTask = snapshotTaskForProtocolEvent(task)
  if (!projectRunOntoTask(task, run, input.now)) return undefined

  input.store.updateTask(task)
  return { run, task, previousTask, planId: run.planId }
}
