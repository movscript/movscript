import type { AgentStore } from '../state/store.js'
import type { AgentTask, UpdatePlanTaskInput } from '../state/types.js'
import { applyPlanTaskUpdate } from '../state/planTaskUpdate.js'
import { assertRunCanOwnTask } from '../state/planTaskOwner.js'
import { snapshotTaskForProtocolEvent } from '../state/taskProtocolEvent.js'
import { assertUniqueSubagentNameForTask } from '../state/subagentNameValidation.js'
import {
  requireRuntimeRun,
  requireRuntimeTask,
} from './runtimeStoreLookup.js'

export interface RuntimeTaskUpdateResult {
  task: AgentTask
  previousTask: AgentTask
}

export function updateRuntimeTask(input: {
  store: Pick<AgentStore, 'getTask' | 'getRun' | 'listTasks' | 'listRuns' | 'updateTask'>
  taskId: string
  update: UpdatePlanTaskInput
  now: string
}): RuntimeTaskUpdateResult {
  const task = requireRuntimeTask(input.store, input.taskId)
  const previousTask = snapshotTaskForProtocolEvent(task)

  applyPlanTaskUpdate({
    task,
    update: input.update,
    now: input.now,
    planTasks: input.store.listTasks(task.planId),
    getTask: (id) => input.store.getTask(id),
    validateOwnerRun: (ownerRunId, targetTask) => {
      assertRunCanOwnTask(requireRuntimeRun(input.store, ownerRunId), targetTask)
    },
    validateSubagentName: (targetTaskId, subagentName) => {
      assertUniqueSubagentNameForTask({
        planId: task.planId,
        taskId: targetTaskId,
        subagentName,
        requestedNames: new Map([[targetTaskId, subagentName]]),
        tasks: input.store.listTasks(task.planId),
        runs: input.store.listRuns({ planId: task.planId }),
      })
    },
  })

  input.store.updateTask(task)
  return { task, previousTask }
}
