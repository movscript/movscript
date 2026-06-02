import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentTask } from '../../../../state/shared/types.js'
import {
  markTaskDispatchBlocked,
  markTaskDispatchedToWorker,
} from '../../../../state/taskgraph/task/lifecycle/planTaskLifecycle.js'
import { snapshotTaskForProtocolEvent } from '../../../../state/taskgraph/projection/task/protocol/taskProtocolEvent.js'
import { requireRuntimeTask } from '../../../shared/store/runtimeStoreLookup.js'

export interface RuntimeTaskDispatchChange {
  task: AgentTask
  previousTask: AgentTask
}

export function markRuntimeTaskDispatchBlocked(input: {
  store: Pick<AgentStore, 'getTask' | 'updateTask'>
  taskId: string
  blockedReason: string
  now: string
}): AgentTask | undefined {
  const task = input.store.getTask(input.taskId)
  if (!task || task.blockedReason === input.blockedReason) return undefined

  markTaskDispatchBlocked(task, input.blockedReason, input.now)
  input.store.updateTask(task)
  return task
}

export function markRuntimeTaskDispatchedToWorker(input: {
  store: Pick<AgentStore, 'getTask' | 'updateTask'>
  taskId: string
  workerRunId: string
  now: string
}): RuntimeTaskDispatchChange {
  const task = requireRuntimeTask(input.store, input.taskId)
  const previousTask = snapshotTaskForProtocolEvent(task)
  markTaskDispatchedToWorker(task, input.workerRunId, input.now)
  input.store.updateTask(task)
  return { task, previousTask }
}
