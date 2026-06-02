import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  AgentTaskGraph,
  AgentRun,
  AgentTask,
  DispatchTaskGraphInput,
  DispatchTaskGraphResult,
  UpdateTaskGraphInput,
  UpdateTaskGraphResult,
  UpdateTaskGraphTaskInput,
} from '../../../../state/shared/types.js'
import {
  normalizeAndValidateReplanTaskUpdates,
  normalizeReplanTaskInputsForTaskGraph,
  normalizeReplanTaskUpdateInputs,
} from '../../../../state/taskgraph/replan/replanTaskValidation.js'
import {
  assertPlannerRunCanUseTaskGraph,
  selectReplanPlannerRunId,
} from '../../../../state/taskgraph/binding/planRunBinding.js'
import { assertRunCanOwnTask } from '../../../../state/taskgraph/task/ownership/planTaskOwner.js'
import { assertSubagentNamesUniqueForTaskMap } from '../../../../state/subagent/naming/subagentNameValidation.js'
import { requireRuntimeTaskGraph, requireRuntimeRun } from '../../../shared/store/runtimeStoreLookup.js'
import { requireRuntimePlannerRun } from '../../binding/runtimePlanBinding.js'
import { buildRuntimeReplanTasksToCreate } from '../tasks/runtimeReplanTaskCreation.js'
import { applyRuntimeReplanTaskReset } from '../../maintenance/task-reset/runtimePlanTaskMaintenance.js'

export interface RuntimeReplanPreparation {
  run: AgentRun
  taskGraph: AgentTaskGraph
  plannerRunId: string
  plannerRun: AgentRun
  tasksToCreate: AgentTask[]
  updatesToApply: Array<{ taskId: string; update: UpdateTaskGraphTaskInput }>
}

export interface RuntimeReplanTaskApplication {
  createdTaskIds: string[]
  updatedTaskIds: string[]
}

export function prepareRuntimeRetaskGraph(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph' | 'getTask' | 'listTasks' | 'listRuns'>
  runId: string
  replanInput?: UpdateTaskGraphInput
  now: string
}): RuntimeReplanPreparation {
  const replanInput = input.replanInput ?? {}
  const run = requireRuntimeRun(input.store, input.runId)
  if (!run.taskGraphId) throw new Error(`run ${input.runId} is not attached to a task graph`)
  const taskGraph = requireRuntimeTaskGraph(input.store, run.taskGraphId)
  const plannerRunId = selectReplanPlannerRunId({ run, taskGraph, inputPlannerRunId: replanInput.plannerRunId })
  const plannerRun = requireRuntimePlannerRun(input.store, plannerRunId)
  assertPlannerRunCanUseTaskGraph({ plannerRun, taskGraph, action: 'updateTaskGraph' })

  const taskInputs = normalizeReplanTaskInputsForTaskGraph({
    taskGraphId: taskGraph.id,
    tasks: replanInput.tasks,
    addTasks: replanInput.addTasks,
    getTask: (taskId) => input.store.getTask(taskId),
  })
  const tasksToCreate = buildRuntimeReplanTasksToCreate({
    store: input.store,
    taskGraphId: taskGraph.id,
    inputs: taskInputs.creates,
    now: input.now,
  })
  const updatesToApply = normalizeAndValidateReplanTaskUpdates({
    taskGraphId: taskGraph.id,
    existingTasks: input.store.listTasks(taskGraph.id),
    tasksToCreate,
    updates: [
      ...taskInputs.updates,
      ...normalizeReplanTaskUpdateInputs(replanInput),
    ],
    getTask: (taskId) => input.store.getTask(taskId),
    validateOwnerRun: (ownerRunId, task) => {
      assertRunCanOwnTask(requireRuntimeRun(input.store, ownerRunId), task)
    },
    validateTaskNames: (tasksById) => assertSubagentNamesUniqueForTaskMap({
      taskGraphId: taskGraph.id,
      tasksById,
      runs: input.store.listRuns({ taskGraphId: taskGraph.id }),
    }),
  })

  return {
    run,
    taskGraph,
    plannerRunId,
    plannerRun,
    tasksToCreate,
    updatesToApply,
  }
}

export function applyRuntimeReplanTaskChanges(input: {
  store: Pick<AgentStore, 'createTask'>
  tasksToCreate: AgentTask[]
  updatesToApply: Array<{ taskId: string; update: UpdateTaskGraphTaskInput }>
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  onTaskCreated?: (task: AgentTask) => void
}): RuntimeReplanTaskApplication {
  const createdTaskIds: string[] = []
  for (const task of input.tasksToCreate) {
    input.store.createTask(task)
    input.onTaskCreated?.(task)
    createdTaskIds.push(task.id)
  }

  const updatedTaskIds: string[] = []
  for (const { taskId, update } of input.updatesToApply) {
    input.updateTask(taskId, update)
    updatedTaskIds.push(taskId)
  }

  return {
    createdTaskIds,
    updatedTaskIds: uniqueStrings(updatedTaskIds),
  }
}

export function finalizeRuntimeRetaskGraph(input: {
  store: Pick<AgentStore, 'getTaskGraph'>
  taskGraphId: string
  plannerRunId: string
  replanInput: UpdateTaskGraphInput
  appliedTasks: RuntimeReplanTaskApplication
  resetTaskIds: string[]
  recomputeTaskGraph: (taskGraphId: string) => void
  dispatchTaskGraph: (dispatchInput: DispatchTaskGraphInput) => DispatchTaskGraphResult
}): UpdateTaskGraphResult {
  input.recomputeTaskGraph(input.taskGraphId)
  const shouldDispatch = input.replanInput.dispatch !== false
  const dispatch = shouldDispatch
    ? input.dispatchTaskGraph({
      ...input.replanInput,
      taskGraphId: input.taskGraphId,
      plannerRunId: input.plannerRunId,
    })
    : undefined
  return {
    taskGraph: requireRuntimeTaskGraph(input.store, input.taskGraphId),
    createdTaskIds: input.appliedTasks.createdTaskIds,
    updatedTaskIds: input.appliedTasks.updatedTaskIds,
    resetTaskIds: input.resetTaskIds,
    ...(dispatch ? { dispatch } : {}),
  }
}

export function applyRuntimeReplanRunRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getTaskGraph' | 'getTask' | 'listTasks' | 'listRuns' | 'createTask' | 'updateTask'>
  runId: string
  replanInput?: UpdateTaskGraphInput
  now: string
  resetNow: string
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  recomputeTaskGraph: (taskGraphId: string) => void
  dispatchTaskGraph: (dispatchInput: DispatchTaskGraphInput) => DispatchTaskGraphResult
  onTaskCreated?: (task: AgentTask) => void
  onTaskReset?: (task: AgentTask, previousTask: AgentTask) => void
}): UpdateTaskGraphResult {
  const replanInput = input.replanInput ?? {}
  const prepared = prepareRuntimeRetaskGraph({
    store: input.store,
    runId: input.runId,
    replanInput,
    now: input.now,
  })
  const appliedTasks = applyRuntimeReplanTaskChanges({
    store: input.store,
    tasksToCreate: prepared.tasksToCreate,
    updatesToApply: prepared.updatesToApply,
    updateTask: input.updateTask,
    onTaskCreated: input.onTaskCreated,
  })
  const resetTaskIds = applyRuntimeReplanTaskReset({
    store: input.store,
    taskGraphId: prepared.taskGraph.id,
    resetTaskIds: replanInput.resetTaskIds,
    resetBlocked: replanInput.resetBlocked,
    resetNeedsReview: replanInput.resetNeedsReview,
    resetFailed: replanInput.resetFailed,
    resetCancelled: replanInput.resetCancelled,
    now: input.resetNow,
    onTaskReset: input.onTaskReset,
  }).resetTaskIds
  return finalizeRuntimeRetaskGraph({
    store: input.store,
    taskGraphId: prepared.taskGraph.id,
    plannerRunId: prepared.plannerRunId,
    replanInput,
    appliedTasks,
    resetTaskIds,
    recomputeTaskGraph: input.recomputeTaskGraph,
    dispatchTaskGraph: input.dispatchTaskGraph,
  })
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}
