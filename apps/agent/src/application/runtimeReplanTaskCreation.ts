import type { AgentStore } from '../state/store.js'
import type { AgentTask, CreatePlanTaskInput } from '../state/types.js'
import { buildAndValidatePlanTasksToCreate } from '../state/planTaskCreation.js'
import { assertUniqueSubagentNameForTask } from '../state/subagentNameValidation.js'

export function buildRuntimeReplanTasksToCreate(input: {
  store: Pick<AgentStore, 'getTask' | 'listTasks' | 'listRuns'>
  planId: string
  inputs: CreatePlanTaskInput[]
  now: string
}): AgentTask[] {
  const { store, planId, inputs, now } = input
  return buildAndValidatePlanTasksToCreate({
    planId,
    inputs,
    now,
    existingTasks: store.listTasks(planId),
    getTask: (taskId) => store.getTask(taskId),
    validateSubagentName: (taskId, subagentName, requestedNames) => {
      assertUniqueSubagentNameForTask({
        planId,
        taskId,
        subagentName,
        requestedNames,
        tasks: store.listTasks(planId),
        runs: store.listRuns({ planId }),
      })
    },
  })
}
