import { isJSONRecord, isRecord } from '../jsonValue.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentPlanSnapshot,
  AgentTask,
  DispatchPlanInput,
  DispatchPlanResult,
  UpdatePlanTaskInput,
} from '../state/types.js'
import type { JSONValue } from '../types.js'
import { buildSubagentSnapshotView } from '../state/planContextView.js'
import {
  buildAgentTask,
  normalizePlanTaskInputs,
  normalizeStringList,
  taskExecutionOverrideMetadata,
} from '../state/planTaskInput.js'
import {
  buildRequestedSubagentNameMap,
  nextSubagentName,
  normalizeSubagentNameAt,
  subagentNameFromTask,
} from '../state/subagentIdentity.js'
import {
  assertUniqueSubagentNameForTask,
  collectSubagentNames,
} from '../state/subagentNameValidation.js'
import { toSubagentRunSummary } from '../state/subagentRunView.js'
import { requireRuntimePlannerRun } from './runtimePlanBinding.js'
import { normalizeNonEmptyString, uniqueStrings } from './runtimeScalarInput.js'
import { requireRuntimeTask } from './runtimeStoreLookup.js'

const SPAWN_SUBAGENT_PLAN_REQUIRED_MESSAGE = 'spawn_subagent requires the planner run to be attached to the session plan. Call movscript_create_plan first with the task list or goal, then call movscript_spawn_subagent using taskIds or tasks and explicit English human subagentName values such as Einstein or Turing.'

export interface RuntimeSubagentSpawnPreparation {
  planId: string
  plannerRunId: string
  tasksToCreate: AgentTask[]
  requestedTaskIds: string[]
  subagentNameByTaskId: Map<string, string>
}

export interface RuntimeSubagentSpawnApplication {
  createdTaskIds: string[]
}

export function prepareRuntimeSubagentSpawn(input: {
  store: Pick<AgentStore, 'getRun' | 'getTask' | 'listTasks' | 'listRuns'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  now: string
}): RuntimeSubagentSpawnPreparation {
  const { store, now } = input
  const plannerRun = requireRuntimePlannerRun(store, input.plannerRunId)
  const planId = plannerRun.planId
  if (!planId) throw new Error(SPAWN_SUBAGENT_PLAN_REQUIRED_MESSAGE)
  const request = input.request ?? {}
  const taskInputs = normalizePlanTaskInputs(request.tasks)
  const usedSubagentNames = collectSubagentNames(store.listTasks(planId), store.listRuns({ planId }))
  const tasksToCreate: AgentTask[] = []
  for (const [index, taskInput] of taskInputs.entries()) {
    const subagentName = normalizeNonEmptyString(taskInput.subagentName)
      ?? normalizeSubagentNameAt(request.subagentNames, index)
      ?? nextSubagentName(usedSubagentNames)
    if (usedSubagentNames.has(subagentName)) throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
    usedSubagentNames.add(subagentName)
    const task = buildAgentTask(planId, {
      ...taskInput,
      metadata: {
        ...(isJSONRecord(taskInput.metadata) ? taskInput.metadata : {}),
        executionMode: 'worker',
        createdByPlannerRunId: plannerRun.id,
        ...(subagentName ? { subagentName } : {}),
        ...taskExecutionOverrideMetadata(taskInput),
      },
    }, now)
    if (store.getTask(task.id)) throw new Error(`task already exists: ${task.id}`)
    if (tasksToCreate.some((item) => item.id === task.id)) throw new Error(`task already exists: ${task.id}`)
    tasksToCreate.push(task)
  }

  const taskToCreateById = new Map(tasksToCreate.map((task) => [task.id, task]))
  const requestedTaskIds = uniqueStrings([
    ...normalizeStringList(request.taskIds),
    ...(typeof request.taskId === 'string' && request.taskId.trim() ? [request.taskId.trim()] : []),
    ...tasksToCreate.map((task) => task.id),
  ])
  const subagentNameByTaskId = buildRequestedSubagentNameMap(request, requestedTaskIds)
  for (const taskId of requestedTaskIds) {
    if (!subagentNameByTaskId.has(taskId)) {
      const task = taskToCreateById.get(taskId) ?? requireRuntimeTask(store, taskId)
      if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
      const existingName = subagentNameFromTask(task)
      const name = existingName ?? nextSubagentName(usedSubagentNames)
      subagentNameByTaskId.set(taskId, name)
      usedSubagentNames.add(name)
    }
  }
  for (const taskId of requestedTaskIds) {
    const task = taskToCreateById.get(taskId) ?? requireRuntimeTask(store, taskId)
    if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
    const subagentName = subagentNameByTaskId.get(taskId)
    if (!subagentName) continue
    assertUniqueSubagentNameForTask({
      planId,
      taskId,
      subagentName,
      requestedNames: subagentNameByTaskId,
      tasks: store.listTasks(planId),
      runs: store.listRuns({ planId }),
    })
  }

  return {
    planId,
    plannerRunId: plannerRun.id,
    tasksToCreate,
    requestedTaskIds,
    subagentNameByTaskId,
  }
}

export function applyRuntimeSubagentSpawnPreparation(input: {
  store: Pick<AgentStore, 'createTask' | 'getTask'>
  spawn: RuntimeSubagentSpawnPreparation
  retryFailed?: unknown
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  onTaskCreated?: (task: AgentTask) => void
}): RuntimeSubagentSpawnApplication {
  const createdTaskIds: string[] = []
  for (const task of input.spawn.tasksToCreate) {
    input.store.createTask(task)
    input.onTaskCreated?.(task)
    createdTaskIds.push(task.id)
  }

  for (const taskId of input.spawn.requestedTaskIds) {
    let task = requireRuntimeTask(input.store, taskId)
    const subagentName = input.spawn.subagentNameByTaskId.get(taskId)
    if (subagentName && (!isRecord(task.metadata) || task.metadata.subagentName !== subagentName)) {
      task = input.updateTask(task.id, {
        metadata: {
          ...(task.metadata ?? {}),
          subagentName,
        },
      })
    }
    if (task.status === 'blocked' || ((task.status === 'failed' || task.status === 'cancelled') && input.retryFailed !== true)) {
      input.updateTask(task.id, {
        status: 'pending',
        progress: 0,
        metadata: {
          ...(task.metadata ?? {}),
          executionMode: 'worker',
          resetByPlannerRunId: input.spawn.plannerRunId,
        },
      })
    }
  }

  return { createdTaskIds }
}

export function applyRuntimeSubagentSpawnFlow(input: {
  store: Pick<AgentStore, 'createTask' | 'getTask'>
  spawn: RuntimeSubagentSpawnPreparation
  request?: Record<string, JSONValue>
  updateTask: (taskId: string, update: UpdatePlanTaskInput) => AgentTask
  dispatchPlan: (input: DispatchPlanInput) => DispatchPlanResult
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  onTaskCreated?: (task: AgentTask) => void
}): JSONValue {
  const request = input.request ?? {}
  const { createdTaskIds } = applyRuntimeSubagentSpawnPreparation({
    store: input.store,
    spawn: input.spawn,
    retryFailed: request.retryFailed,
    updateTask: input.updateTask,
    onTaskCreated: input.onTaskCreated,
  })
  const dispatch = input.dispatchPlan({
    planId: input.spawn.planId,
    plannerRunId: input.spawn.plannerRunId,
    ...(input.spawn.requestedTaskIds.length > 0 ? { taskIds: input.spawn.requestedTaskIds } : {}),
    maxWorkers: request.maxWorkers,
    maxTaskAttempts: request.maxTaskAttempts,
    retryFailed: request.retryFailed,
    workerTimeoutMs: request.workerTimeoutMs,
  })
  return buildRuntimeSubagentSpawnResult({
    planId: input.spawn.planId,
    plannerRunId: input.spawn.plannerRunId,
    createdTaskIds,
    dispatch,
    snapshot: input.getPlanSnapshot(input.spawn.planId),
  })
}

export function buildRuntimeSubagentSpawnResult(input: {
  planId: string
  plannerRunId: string
  createdTaskIds: string[]
  dispatch: Pick<DispatchPlanResult, 'spawnedRuns' | 'blockedTaskIds' | 'retriedTaskIds' | 'timedOutRunIds'>
  snapshot: AgentPlanSnapshot
}): JSONValue {
  return {
    status: input.dispatch.spawnedRuns.length > 0 ? 'spawned' : 'no_runnable_tasks',
    planId: input.planId,
    plannerRunId: input.plannerRunId,
    createdTaskIds: input.createdTaskIds,
    spawnedRuns: input.dispatch.spawnedRuns.map((run) => toSubagentRunSummary(run)),
    blockedTaskIds: input.dispatch.blockedTaskIds,
    retriedTaskIds: input.dispatch.retriedTaskIds,
    timedOutRunIds: input.dispatch.timedOutRunIds,
    snapshot: buildSubagentSnapshotView({ snapshot: input.snapshot, plannerRunId: input.plannerRunId }),
  } as unknown as JSONValue
}
