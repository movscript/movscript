import { planSupervisorDispatch, type SupervisorDispatchDecision } from '../orchestration/supervisorGraph.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentPlan,
  AgentRun,
  AgentTask,
  CreateRunInput,
  DispatchPlanInput,
  DispatchPlanResult,
  UpdatePlanTaskInput,
} from '../state/types.js'
import {
  assertDispatchPlannerRunForPlan,
  assertDispatchRequestedTasks,
  buildDispatchWorkerRunInput,
  normalizeDispatchPlanControls,
  normalizeDispatchPlanId,
  type NormalizedDispatchPlanControls,
} from '../state/planDispatchInput.js'
import { subagentNameFromTask } from '../state/subagentIdentity.js'
import { buildDispatchSubagentNameMap } from '../state/subagentNameValidation.js'
import { requireRuntimePlan } from './runtimeStoreLookup.js'
import { requireRuntimePlannerRun } from './runtimePlanBinding.js'
import {
  markRuntimeTaskDispatchBlocked,
  markRuntimeTaskDispatchedToWorker,
} from './runtimeTaskDispatch.js'
import { applyRuntimeRetryablePlanTaskReset } from './runtimePlanTaskMaintenance.js'
import { applyRuntimeTimedOutPlanWorkers } from './runtimeWorkerTimeout.js'

export interface RuntimePlanDispatchRequest {
  plan: AgentPlan
  dispatch: NormalizedDispatchPlanControls
  plannerRun: AgentRun
}

export interface RuntimePlanDispatchDecision {
  decision: SupervisorDispatchDecision
  subagentNameByTaskId: Map<string, string>
}

export interface RuntimePlanDispatchApplication {
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
}

export function resolveRuntimePlanDispatchRequest(input: {
  store: Pick<AgentStore, 'getPlan' | 'getRun'>
  dispatchInput: DispatchPlanInput
}): RuntimePlanDispatchRequest {
  const planId = normalizeDispatchPlanId(input.dispatchInput.planId)
  const plan = requireRuntimePlan(input.store, planId)
  const dispatch = normalizeDispatchPlanControls(input.dispatchInput, plan)
  const plannerRun = requireRuntimePlannerRun(input.store, dispatch.plannerRunId)
  assertDispatchPlannerRunForPlan(plannerRun, plan)
  return { plan, dispatch, plannerRun }
}

export function buildRuntimePlanDispatchDecision(input: {
  store: Pick<AgentStore, 'getTask' | 'listTasks' | 'listRuns'>
  plan: AgentPlan
  dispatch: NormalizedDispatchPlanControls
}): RuntimePlanDispatchDecision {
  const requestedTaskIds = input.dispatch.requestedTaskIds
  assertDispatchRequestedTasks({
    planId: input.plan.id,
    taskIds: requestedTaskIds,
    getTask: (taskId) => input.store.getTask(taskId),
  })
  const tasks = input.store.listTasks(input.plan.id)
  const runs = input.store.listRuns({ planId: input.plan.id })
  const decision = planSupervisorDispatch({
    plan: input.plan,
    tasks,
    runs,
    maxWorkers: input.dispatch.maxWorkers,
    ...(requestedTaskIds.length > 0 ? { taskIds: requestedTaskIds } : {}),
  })
  return {
    decision,
    subagentNameByTaskId: buildDispatchSubagentNameMap({
      runnableTasks: decision.runnableTasks,
      tasks,
      runs,
    }),
  }
}

export function applyRuntimePlanDispatchDecision(input: {
  store: Pick<AgentStore, 'getTask' | 'updateTask'>
  plan: AgentPlan
  plannerRun: AgentRun
  dispatchInput: DispatchPlanInput
  decision: SupervisorDispatchDecision
  subagentNameByTaskId: Map<string, string>
  now: string
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimePlanDispatchApplication {
  for (const blocked of input.decision.blockedTasks) {
    const task = markRuntimeTaskDispatchBlocked({
      store: input.store,
      taskId: blocked.task.id,
      blockedReason: blocked.blockedReason,
      now: input.now,
    })
    if (task) input.onTaskBlocked?.(task)
  }

  const spawnedRuns: AgentRun[] = []
  for (const task of input.decision.runnableTasks) {
    const existingSubagentName = subagentNameFromTask(task)
    const subagentName = input.subagentNameByTaskId.get(task.id)
    if (!subagentName) throw new Error(`subagent name was not prepared for task ${task.id}`)
    const workerTask = existingSubagentName === subagentName
      ? task
      : input.updateTask(task.id, {
        metadata: {
          ...(task.metadata ?? {}),
          subagentName,
        },
      })
    const run = input.createRun(buildDispatchWorkerRunInput({
      plan: input.plan,
      plannerRun: input.plannerRun,
      task: workerTask,
      subagentName,
      dispatchInput: input.dispatchInput,
    }))
    const { task: dispatchedTask, previousTask } = markRuntimeTaskDispatchedToWorker({
      store: input.store,
      taskId: task.id,
      workerRunId: run.id,
      now: input.now,
    })
    input.onTaskDispatched?.(dispatchedTask, previousTask)
    spawnedRuns.push(run)
  }

  return {
    spawnedRuns,
    blockedTaskIds: input.decision.blockedTasks.map((item) => item.task.id),
  }
}

export function applyRuntimePlanDispatch(input: {
  store: Pick<AgentStore, 'getPlan' | 'getTask' | 'listTasks' | 'listRuns' | 'updateTask'>
  plan: AgentPlan
  dispatch: NormalizedDispatchPlanControls
  plannerRun: AgentRun
  dispatchInput: DispatchPlanInput
  retriedTaskIds: string[]
  timedOutRunIds: string[]
  now: string
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  recomputePlan: (planId: string) => void
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): DispatchPlanResult {
  const { decision, subagentNameByTaskId } = buildRuntimePlanDispatchDecision({
    store: input.store,
    plan: input.plan,
    dispatch: input.dispatch,
  })
  const application = applyRuntimePlanDispatchDecision({
    store: input.store,
    plan: input.plan,
    plannerRun: input.plannerRun,
    dispatchInput: input.dispatchInput,
    decision,
    subagentNameByTaskId,
    now: input.now,
    updateTask: input.updateTask,
    createRun: input.createRun,
    onTaskBlocked: input.onTaskBlocked,
    onTaskDispatched: input.onTaskDispatched,
  })
  input.recomputePlan(input.plan.id)
  return {
    plan: requireRuntimePlan(input.store, input.plan.id),
    spawnedRuns: application.spawnedRuns,
    blockedTaskIds: application.blockedTaskIds,
    retriedTaskIds: input.retriedTaskIds,
    timedOutRunIds: input.timedOutRunIds,
  }
}

export function applyRuntimePlanDispatchFlow(input: {
  store: Pick<AgentStore, 'getPlan' | 'getTask' | 'listTasks' | 'listRuns' | 'updateTask'>
  plan: AgentPlan
  dispatch: NormalizedDispatchPlanControls
  plannerRun: AgentRun
  dispatchInput: DispatchPlanInput
  now: string
  nowMs: number
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  cancelRun: (runId: string, reason: string) => void
  syncTaskFromRun: (runId: string) => void
  recomputePlan: (planId: string) => void
  onTaskTimedOut?: (task: AgentTask) => void
  onTaskRetryReset?: (task: AgentTask, previousTask: AgentTask) => void
  onTasksRetried?: (retriedTaskIds: string[]) => void
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): DispatchPlanResult {
  const timedOutRunIds = applyRuntimeTimedOutPlanWorkers({
    store: input.store,
    planId: input.plan.id,
    defaultTimeoutMs: input.dispatch.workerTimeoutMs,
    nowMs: input.nowMs,
    now: input.now,
    cancelRun: input.cancelRun,
    syncTaskFromRun: input.syncTaskFromRun,
    onTaskTimedOut: input.onTaskTimedOut,
  }).timedOutRunIds
  const retriedTaskIds = input.dispatch.retryFailed
    ? applyRuntimeRetryablePlanTaskReset({
      store: input.store,
      planId: input.plan.id,
      maxTaskAttempts: input.dispatch.maxTaskAttempts,
      now: input.now,
      onTaskReset: input.onTaskRetryReset,
      onTasksReset: (ids) => {
        input.onTasksRetried?.(ids)
        input.recomputePlan(input.plan.id)
      },
    }).retriedTaskIds
    : []

  return applyRuntimePlanDispatch({
    store: input.store,
    plan: input.plan,
    dispatch: input.dispatch,
    plannerRun: input.plannerRun,
    dispatchInput: input.dispatchInput,
    retriedTaskIds,
    timedOutRunIds,
    now: input.now,
    updateTask: input.updateTask,
    createRun: input.createRun,
    recomputePlan: input.recomputePlan,
    onTaskBlocked: input.onTaskBlocked,
    onTaskDispatched: input.onTaskDispatched,
  })
}

export function applyRuntimePlanDispatchRequest(input: {
  store: Pick<AgentStore, 'getPlan' | 'getRun' | 'getTask' | 'listTasks' | 'listRuns' | 'updateTask'>
  dispatchInput: DispatchPlanInput
  now: string
  nowMs: number
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  cancelRun: (runId: string, reason: string) => void
  syncTaskFromRun: (runId: string) => void
  recomputePlan: (planId: string) => void
  onTaskTimedOut?: (task: AgentTask) => void
  onTaskRetryReset?: (task: AgentTask, previousTask: AgentTask) => void
  onTasksRetried?: (retriedTaskIds: string[]) => void
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): DispatchPlanResult {
  const { plan, dispatch, plannerRun } = resolveRuntimePlanDispatchRequest({
    store: input.store,
    dispatchInput: input.dispatchInput,
  })
  return applyRuntimePlanDispatchFlow({
    store: input.store,
    plan,
    dispatch,
    plannerRun,
    dispatchInput: input.dispatchInput,
    now: input.now,
    nowMs: input.nowMs,
    updateTask: input.updateTask,
    createRun: input.createRun,
    cancelRun: input.cancelRun,
    syncTaskFromRun: input.syncTaskFromRun,
    recomputePlan: input.recomputePlan,
    onTaskTimedOut: input.onTaskTimedOut,
    onTaskRetryReset: input.onTaskRetryReset,
    onTasksRetried: input.onTasksRetried,
    onTaskBlocked: input.onTaskBlocked,
    onTaskDispatched: input.onTaskDispatched,
  })
}
