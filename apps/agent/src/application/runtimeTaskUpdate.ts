import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentTask, UpdateTaskGraphTaskInput } from '../state/types.js'
import { applyPlanTaskUpdate } from '../state/planTaskUpdate.js'
import { assertRunCanOwnTask } from '../state/planTaskOwner.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'
import { assertUniqueSubagentNameForTask } from '../state/subagentNameValidation.js'
import {
  requireRuntimeRun,
  requireRuntimeTask,
} from './runtimeStoreLookup.js'
import {
  applyRuntimeTaskProtocolEvents,
  type RuntimeTaskProtocolTraceInput,
} from './runtimeTaskProtocolEvents.js'

export interface RuntimeTaskUpdateResult {
  task: AgentTask
  previousTask: AgentTask
}

export function updateRuntimeTask(input: {
  store: Pick<AgentStore, 'getTask' | 'getRun' | 'listTasks' | 'listRuns' | 'updateTask'>
  taskId: string
  update: UpdateTaskGraphTaskInput
  now: string
}): RuntimeTaskUpdateResult {
  const task = requireRuntimeTask(input.store, input.taskId)
  const previousTask = snapshotTaskForProtocolEvent(task)

  applyPlanTaskUpdate({
    task,
    update: input.update,
    now: input.now,
    planTasks: input.store.listTasks(task.taskGraphId),
    getTask: (id) => input.store.getTask(id),
    validateOwnerRun: (ownerRunId, targetTask) => {
      assertRunCanOwnTask(requireRuntimeRun(input.store, ownerRunId), targetTask)
    },
    validateSubagentName: (targetTaskId, subagentName) => {
      assertUniqueSubagentNameForTask({
        taskGraphId: task.taskGraphId,
        taskId: targetTaskId,
        subagentName,
        requestedNames: new Map([[targetTaskId, subagentName]]),
        tasks: input.store.listTasks(task.taskGraphId),
        runs: input.store.listRuns({ taskGraphId: task.taskGraphId }),
      })
    },
  })

  input.store.updateTask(task)
  return { task, previousTask }
}

export function applyRuntimeTaskUpdate(input: {
  store: Pick<AgentStore, 'getTask' | 'getRun' | 'listTasks' | 'listRuns' | 'updateTask'>
  taskId: string
  update: UpdateTaskGraphTaskInput
  now: string
  onPlanRecomputed: (taskGraphId: string) => void
  onTaskUpdated: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimeTaskUpdateResult {
  const result = updateRuntimeTask({
    store: input.store,
    taskId: input.taskId,
    update: input.update,
    now: input.now,
  })
  input.onPlanRecomputed(result.task.taskGraphId)
  input.onTaskUpdated(result.task, result.previousTask)
  return result
}

export function applyRuntimeTaskUpdateRequest(input: {
  store: Pick<AgentStore, 'getTask' | 'getRun' | 'listTasks' | 'listRuns' | 'updateTask' | 'getTaskGraph'>
  taskId: string
  update: UpdateTaskGraphTaskInput
  now: string
  recomputePlanStatus: (taskGraphId: string) => void
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
  emitPlanTaskEvent: (taskGraphId: string, task: AgentTask) => void
}): RuntimeTaskUpdateResult {
  return applyRuntimeTaskUpdate({
    store: input.store,
    taskId: input.taskId,
    update: input.update,
    now: input.now,
    onPlanRecomputed: input.recomputePlanStatus,
    onTaskUpdated: (task, previousTask) => {
      applyRuntimeTaskProtocolEvents({
        store: input.store,
        task,
        previous: previousTask,
        recordTrace: input.recordTrace,
      })
      input.emitPlanTaskEvent(task.taskGraphId, task)
    },
  })
}
