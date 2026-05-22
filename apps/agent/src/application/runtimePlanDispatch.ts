import { planSupervisorDispatch, type SupervisorDispatchDecision } from '../orchestration/supervisorGraph.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentTaskGraph,
  AgentRun,
  AgentTask,
  CreateRunInput,
  DispatchTaskGraphInput,
  DispatchTaskGraphResult,
  UpdateTaskGraphTaskInput,
} from '../state/types.js'
import {
  assertDispatchTaskGraphnerRunForTaskGraph,
  assertDispatchRequestedTasks,
  buildDispatchWorkerRunInput,
  normalizeDispatchTaskGraphControls,
  normalizeDispatchTaskGraphId,
  type NormalizedTaskGraphDispatchControls,
} from '../state/planDispatchInput.js'
import { subagentNameFromTask } from '../state/subagentIdentity.js'
import { buildDispatchSubagentNameMap } from '../state/subagentNameValidation.js'
import { requireRuntimeTaskGraph } from './runtimeStoreLookup.js'
import { requireRuntimePlannerRun } from './runtimePlanBinding.js'
import {
  markRuntimeTaskDispatchBlocked,
  markRuntimeTaskDispatchedToWorker,
} from './runtimeTaskDispatch.js'
import { applyRuntimeRetryablePlanTaskReset } from './runtimePlanTaskMaintenance.js'
import { applyRuntimeTimedOutPlanWorkers } from './runtimeWorkerTimeout.js'

export interface RuntimeTaskGraphDispatchRequest {
  taskGraph: AgentTaskGraph
  dispatch: NormalizedTaskGraphDispatchControls
  plannerRun: AgentRun
}

export interface RuntimeTaskGraphDispatchDecision {
  decision: SupervisorDispatchDecision
  subagentNameByTaskId: Map<string, string>
}

export interface RuntimeTaskGraphDispatchApplication {
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
}

export function resolveRuntimeTaskGraphDispatchRequest(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'getRun'>
  dispatchInput: DispatchTaskGraphInput
}): RuntimeTaskGraphDispatchRequest {
  const taskGraphId = normalizeDispatchTaskGraphId(input.dispatchInput.taskGraphId)
  const taskGraph = requireRuntimeTaskGraph(input.store, taskGraphId)
  const dispatch = normalizeDispatchTaskGraphControls(input.dispatchInput, taskGraph)
  const plannerRun = requireRuntimePlannerRun(input.store, dispatch.plannerRunId)
  assertDispatchTaskGraphnerRunForTaskGraph(plannerRun, taskGraph)
  return { taskGraph, dispatch, plannerRun }
}

export function buildRuntimeTaskGraphDispatchDecision(input: {
  store: Pick<AgentStore, 'getTask' | 'listTasks' | 'listRuns'>
  taskGraph: AgentTaskGraph
  dispatch: NormalizedTaskGraphDispatchControls
}): RuntimeTaskGraphDispatchDecision {
  const requestedTaskIds = input.dispatch.requestedTaskIds
  assertDispatchRequestedTasks({
    taskGraphId: input.taskGraph.id,
    taskIds: requestedTaskIds,
    getTask: (taskId) => input.store.getTask(taskId),
  })
  const tasks = input.store.listTasks(input.taskGraph.id)
  const runs = input.store.listRuns({ taskGraphId: input.taskGraph.id })
  const decision = planSupervisorDispatch({
    taskGraph: input.taskGraph,
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

export function applyRuntimeTaskGraphDispatchDecision(input: {
  store: Pick<AgentStore, 'getTask' | 'updateTask'>
  taskGraph: AgentTaskGraph
  plannerRun: AgentRun
  dispatchInput: DispatchTaskGraphInput
  decision: SupervisorDispatchDecision
  subagentNameByTaskId: Map<string, string>
  now: string
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimeTaskGraphDispatchApplication {
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
      taskGraph: input.taskGraph,
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

export function applyRuntimeTaskGraphDispatch(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'getTask' | 'listTasks' | 'listRuns' | 'updateTask'>
  taskGraph: AgentTaskGraph
  dispatch: NormalizedTaskGraphDispatchControls
  plannerRun: AgentRun
  dispatchInput: DispatchTaskGraphInput
  retriedTaskIds: string[]
  timedOutRunIds: string[]
  now: string
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  recomputeTaskGraph: (taskGraphId: string) => void
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): DispatchTaskGraphResult {
  const { decision, subagentNameByTaskId } = buildRuntimeTaskGraphDispatchDecision({
    store: input.store,
    taskGraph: input.taskGraph,
    dispatch: input.dispatch,
  })
  const application = applyRuntimeTaskGraphDispatchDecision({
    store: input.store,
    taskGraph: input.taskGraph,
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
  input.recomputeTaskGraph(input.taskGraph.id)
  return {
    taskGraph: requireRuntimeTaskGraph(input.store, input.taskGraph.id),
    spawnedRuns: application.spawnedRuns,
    blockedTaskIds: application.blockedTaskIds,
    retriedTaskIds: input.retriedTaskIds,
    timedOutRunIds: input.timedOutRunIds,
  }
}

export function applyRuntimeTaskGraphDispatchFlow(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'getTask' | 'listTasks' | 'listRuns' | 'updateTask'>
  taskGraph: AgentTaskGraph
  dispatch: NormalizedTaskGraphDispatchControls
  plannerRun: AgentRun
  dispatchInput: DispatchTaskGraphInput
  now: string
  nowMs: number
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  cancelRun: (runId: string, reason: string) => void
  syncTaskFromRun: (runId: string) => void
  recomputeTaskGraph: (taskGraphId: string) => void
  onTaskTimedOut?: (task: AgentTask) => void
  onTaskRetryReset?: (task: AgentTask, previousTask: AgentTask) => void
  onTasksRetried?: (retriedTaskIds: string[]) => void
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): DispatchTaskGraphResult {
  const timedOutRunIds = applyRuntimeTimedOutPlanWorkers({
    store: input.store,
    taskGraphId: input.taskGraph.id,
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
      taskGraphId: input.taskGraph.id,
      maxTaskAttempts: input.dispatch.maxTaskAttempts,
      now: input.now,
      onTaskReset: input.onTaskRetryReset,
      onTasksReset: (ids) => {
        input.onTasksRetried?.(ids)
        input.recomputeTaskGraph(input.taskGraph.id)
      },
    }).retriedTaskIds
    : []

  return applyRuntimeTaskGraphDispatch({
    store: input.store,
    taskGraph: input.taskGraph,
    dispatch: input.dispatch,
    plannerRun: input.plannerRun,
    dispatchInput: input.dispatchInput,
    retriedTaskIds,
    timedOutRunIds,
    now: input.now,
    updateTask: input.updateTask,
    createRun: input.createRun,
    recomputeTaskGraph: input.recomputeTaskGraph,
    onTaskBlocked: input.onTaskBlocked,
    onTaskDispatched: input.onTaskDispatched,
  })
}

export function applyRuntimeTaskGraphDispatchRequest(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'getRun' | 'getTask' | 'listTasks' | 'listRuns' | 'updateTask'>
  dispatchInput: DispatchTaskGraphInput
  now: string
  nowMs: number
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  createRun: (input: CreateRunInput) => AgentRun
  cancelRun: (runId: string, reason: string) => void
  syncTaskFromRun: (runId: string) => void
  recomputeTaskGraph: (taskGraphId: string) => void
  onTaskTimedOut?: (task: AgentTask) => void
  onTaskRetryReset?: (task: AgentTask, previousTask: AgentTask) => void
  onTasksRetried?: (retriedTaskIds: string[]) => void
  onTaskBlocked?: (task: AgentTask) => void
  onTaskDispatched?: (task: AgentTask, previousTask: AgentTask) => void
}): DispatchTaskGraphResult {
  const { taskGraph, dispatch, plannerRun } = resolveRuntimeTaskGraphDispatchRequest({
    store: input.store,
    dispatchInput: input.dispatchInput,
  })
  return applyRuntimeTaskGraphDispatchFlow({
    store: input.store,
    taskGraph,
    dispatch,
    plannerRun,
    dispatchInput: input.dispatchInput,
    now: input.now,
    nowMs: input.nowMs,
    updateTask: input.updateTask,
    createRun: input.createRun,
    cancelRun: input.cancelRun,
    syncTaskFromRun: input.syncTaskFromRun,
    recomputeTaskGraph: input.recomputeTaskGraph,
    onTaskTimedOut: input.onTaskTimedOut,
    onTaskRetryReset: input.onTaskRetryReset,
    onTasksRetried: input.onTasksRetried,
    onTaskBlocked: input.onTaskBlocked,
    onTaskDispatched: input.onTaskDispatched,
  })
}
