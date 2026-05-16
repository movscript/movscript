import type { AgentStore } from '../state/store.js'
import type { AgentTask } from '../state/types.js'
import { markTaskAssignedToPlannerRun } from '../state/planTaskLifecycle.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'
import { requireRuntimeRun, requireRuntimeTask } from './runtimeStoreLookup.js'

export function assignRuntimeTaskToPlannerRun(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'updateTask'>
  taskId: string
  runId: string
  now: string
}): { task: AgentTask; previousTask: AgentTask } {
  const { store, taskId, runId, now } = input
  const task = requireRuntimeTask(store, taskId)
  const run = requireRuntimeRun(store, runId)
  if (run.role !== 'planner') throw new Error(`run ${runId} is not a planner run`)
  const previousTask = snapshotTaskForProtocolEvent(task)
  markTaskAssignedToPlannerRun(task, run.id, now)
  store.updateTask(task)
  return { task, previousTask }
}
