import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentTask, CreateTaskGraphTaskInput } from '../../../../state/shared/types.js'
import { buildAndValidatePlanTasksToCreate } from '../../../../state/taskgraph/task/creation/planTaskCreation.js'
import { assertUniqueSubagentNameForTask } from '../../../../state/subagent/naming/subagentNameValidation.js'

export function buildRuntimeReplanTasksToCreate(input: {
  store: Pick<AgentStore, 'getTask' | 'listTasks' | 'listRuns'>
  taskGraphId: string
  inputs: CreateTaskGraphTaskInput[]
  now: string
}): AgentTask[] {
  const { store, taskGraphId, inputs, now } = input
  return buildAndValidatePlanTasksToCreate({
    taskGraphId,
    inputs,
    now,
    existingTasks: store.listTasks(taskGraphId),
    getTask: (taskId) => store.getTask(taskId),
    validateSubagentName: (taskId, subagentName, requestedNames) => {
      assertUniqueSubagentNameForTask({
        taskGraphId,
        taskId,
        subagentName,
        requestedNames,
        tasks: store.listTasks(taskGraphId),
        runs: store.listRuns({ taskGraphId }),
      })
    },
  })
}
