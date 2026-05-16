import type { AgentStore } from '../state/store.js'
import type {
  AgentPlan,
  AgentRun,
  AgentTask,
  DispatchPlanInput,
  DispatchPlanResult,
  ReplanRunInput,
  ReplanRunResult,
  UpdatePlanTaskInput,
} from '../state/types.js'
import {
  normalizeAndValidateReplanTaskUpdates,
  normalizeReplanTaskInputsForPlan,
  normalizeReplanTaskUpdateInputs,
} from '../state/replanTaskValidation.js'
import {
  assertPlannerRunCanUsePlan,
  selectReplanPlannerRunId,
} from '../state/planRunBinding.js'
import { assertRunCanOwnTask } from '../state/planTaskOwner.js'
import { assertSubagentNamesUniqueForTaskMap } from '../state/subagentNameValidation.js'
import { requireRuntimePlan, requireRuntimeRun } from './runtimeStoreLookup.js'
import { requireRuntimePlannerRun } from './runtimePlanBinding.js'
import { buildRuntimeReplanTasksToCreate } from './runtimeReplanTaskCreation.js'
import { applyRuntimeReplanTaskReset } from './runtimePlanTaskMaintenance.js'

export interface RuntimeReplanPreparation {
  run: AgentRun
  plan: AgentPlan
  plannerRunId: string
  plannerRun: AgentRun
  tasksToCreate: AgentTask[]
  updatesToApply: Array<{ taskId: string; update: UpdatePlanTaskInput }>
}

export interface RuntimeReplanTaskApplication {
  createdTaskIds: string[]
  updatedTaskIds: string[]
}

export function prepareRuntimeReplan(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'getTask' | 'listTasks' | 'listRuns'>
  runId: string
  replanInput?: ReplanRunInput
  now: string
}): RuntimeReplanPreparation {
  const replanInput = input.replanInput ?? {}
  const run = requireRuntimeRun(input.store, input.runId)
  if (!run.planId) throw new Error(`run ${input.runId} is not attached to a plan`)
  const plan = requireRuntimePlan(input.store, run.planId)
  const plannerRunId = selectReplanPlannerRunId({ run, plan, inputPlannerRunId: replanInput.plannerRunId })
  const plannerRun = requireRuntimePlannerRun(input.store, plannerRunId)
  assertPlannerRunCanUsePlan({ plannerRun, plan, action: 'replan' })

  const taskInputs = normalizeReplanTaskInputsForPlan({
    planId: plan.id,
    tasks: replanInput.tasks,
    addTasks: replanInput.addTasks,
    getTask: (taskId) => input.store.getTask(taskId),
  })
  const tasksToCreate = buildRuntimeReplanTasksToCreate({
    store: input.store,
    planId: plan.id,
    inputs: taskInputs.creates,
    now: input.now,
  })
  const updatesToApply = normalizeAndValidateReplanTaskUpdates({
    planId: plan.id,
    existingTasks: input.store.listTasks(plan.id),
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
      planId: plan.id,
      tasksById,
      runs: input.store.listRuns({ planId: plan.id }),
    }),
  })

  return {
    run,
    plan,
    plannerRunId,
    plannerRun,
    tasksToCreate,
    updatesToApply,
  }
}

export function applyRuntimeReplanTaskChanges(input: {
  store: Pick<AgentStore, 'createTask'>
  tasksToCreate: AgentTask[]
  updatesToApply: Array<{ taskId: string; update: UpdatePlanTaskInput }>
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
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

export function finalizeRuntimeReplan(input: {
  store: Pick<AgentStore, 'getPlan'>
  planId: string
  plannerRunId: string
  replanInput: ReplanRunInput
  appliedTasks: RuntimeReplanTaskApplication
  resetTaskIds: string[]
  recomputePlan: (planId: string) => void
  dispatchPlan: (dispatchInput: DispatchPlanInput) => DispatchPlanResult
}): ReplanRunResult {
  input.recomputePlan(input.planId)
  const shouldDispatch = input.replanInput.dispatch !== false
  const dispatch = shouldDispatch
    ? input.dispatchPlan({
      ...input.replanInput,
      planId: input.planId,
      plannerRunId: input.plannerRunId,
    })
    : undefined
  return {
    plan: requireRuntimePlan(input.store, input.planId),
    createdTaskIds: input.appliedTasks.createdTaskIds,
    updatedTaskIds: input.appliedTasks.updatedTaskIds,
    resetTaskIds: input.resetTaskIds,
    ...(dispatch ? { dispatch } : {}),
  }
}

export function applyRuntimeReplanRunRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan' | 'getTask' | 'listTasks' | 'listRuns' | 'createTask' | 'updateTask'>
  runId: string
  replanInput?: ReplanRunInput
  now: string
  resetNow: string
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  recomputePlan: (planId: string) => void
  dispatchPlan: (dispatchInput: DispatchPlanInput) => DispatchPlanResult
  onTaskCreated?: (task: AgentTask) => void
  onTaskReset?: (task: AgentTask, previousTask: AgentTask) => void
}): ReplanRunResult {
  const replanInput = input.replanInput ?? {}
  const prepared = prepareRuntimeReplan({
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
    planId: prepared.plan.id,
    resetTaskIds: replanInput.resetTaskIds,
    resetBlocked: replanInput.resetBlocked,
    resetNeedsReview: replanInput.resetNeedsReview,
    resetFailed: replanInput.resetFailed,
    resetCancelled: replanInput.resetCancelled,
    now: input.resetNow,
    onTaskReset: input.onTaskReset,
  }).resetTaskIds
  return finalizeRuntimeReplan({
    store: input.store,
    planId: prepared.plan.id,
    plannerRunId: prepared.plannerRunId,
    replanInput,
    appliedTasks,
    resetTaskIds,
    recomputePlan: input.recomputePlan,
    dispatchPlan: input.dispatchPlan,
  })
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}
