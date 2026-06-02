import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentTask } from '../../../../state/shared/types.js'
import { markTaskAssignedToPlannerRun } from '../../../../state/taskgraph/task/lifecycle/planTaskLifecycle.js'
import { snapshotTaskForProtocolEvent } from '../../../../state/taskgraph/projection/task/protocol/taskProtocolEvent.js'
import { requireRuntimeRun, requireRuntimeTask } from '../../../shared/store/runtimeStoreLookup.js'

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
