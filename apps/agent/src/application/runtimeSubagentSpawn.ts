import { isJSONRecord, isRecord } from '../jsonValue.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentTaskGraphSnapshot,
  AgentRun,
  AgentTask,
  CreateRunInput,
  DispatchTaskGraphInput,
  DispatchTaskGraphResult,
  UpdateTaskGraphTaskInput,
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

export interface RuntimeSubagentSpawnPreparation {
  taskGraphId: string
  plannerRunId: string
  tasksToCreate: AgentTask[]
  requestedTaskIds: string[]
  subagentNameByTaskId: Map<string, string>
}

export interface RuntimeDirectSubagentSpawnResult {
  status: 'spawned'
  plannerRunId: string
  spawnedRuns: AgentRun[]
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
  const taskGraphId = plannerRun.taskGraphId
  if (!taskGraphId) throw new Error('task graph dispatch requires planner run taskGraphId; direct child agent spawn does not require a task graph')
  const request = input.request ?? {}
  const taskInputs = normalizePlanTaskInputs(request.tasks)
  const usedSubagentNames = collectSubagentNames(store.listTasks(taskGraphId), store.listRuns({ taskGraphId }))
  const tasksToCreate: AgentTask[] = []
  for (const [index, taskInput] of taskInputs.entries()) {
    const subagentName = normalizeNonEmptyString(taskInput.subagentName)
      ?? normalizeSubagentNameAt(request.subagentNames, index)
      ?? nextSubagentName(usedSubagentNames)
    if (usedSubagentNames.has(subagentName)) throw new Error(`subagent name already exists in task graph ${taskGraphId}: ${subagentName}`)
    usedSubagentNames.add(subagentName)
    const task = buildAgentTask(taskGraphId, {
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
      if (task.taskGraphId !== taskGraphId) throw new Error(`task ${taskId} does not belong to task graph ${taskGraphId}`)
      const existingName = subagentNameFromTask(task)
      const name = existingName ?? nextSubagentName(usedSubagentNames)
      subagentNameByTaskId.set(taskId, name)
      usedSubagentNames.add(name)
    }
  }
  for (const taskId of requestedTaskIds) {
    const task = taskToCreateById.get(taskId) ?? requireRuntimeTask(store, taskId)
    if (task.taskGraphId !== taskGraphId) throw new Error(`task ${taskId} does not belong to task graph ${taskGraphId}`)
    const subagentName = subagentNameByTaskId.get(taskId)
    if (!subagentName) continue
    assertUniqueSubagentNameForTask({
      taskGraphId,
      taskId,
      subagentName,
      requestedNames: subagentNameByTaskId,
      tasks: store.listTasks(taskGraphId),
      runs: store.listRuns({ taskGraphId }),
    })
  }

  return {
    taskGraphId,
    plannerRunId: plannerRun.id,
    tasksToCreate,
    requestedTaskIds,
    subagentNameByTaskId,
  }
}

export function applyRuntimeDirectSubagentSpawnFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'listRuns'>
  plannerRunId: string
  request?: Record<string, JSONValue>
  createRun: (input: CreateRunInput) => AgentRun
}): RuntimeDirectSubagentSpawnResult {
  const plannerRun = requireRuntimePlannerRun(input.store, input.plannerRunId)
  const request = input.request ?? {}
  const taskInputs = normalizePlanTaskInputs(request.tasks)
  const directTasks = taskInputs.length > 0
    ? taskInputs
    : [{
        title: normalizeNonEmptyString(request.title) ?? normalizeNonEmptyString(request.message) ?? 'Child agent task',
        description: normalizeNonEmptyString(request.description) ?? normalizeNonEmptyString(request.instructions) ?? normalizeNonEmptyString(request.message),
        metadata: isJSONRecord(request.metadata) ? request.metadata : undefined,
      }]
  const usedNames = new Set(input.store
    .listRuns({ threadId: plannerRun.threadId })
    .flatMap((run) => {
      const name = isRecord(run.metadata) && typeof run.metadata.subagentName === 'string' ? run.metadata.subagentName.trim() : ''
      return name ? [name] : []
    }))
  const spawnedRuns = directTasks.map((task, index) => {
    const subagentName = normalizeNonEmptyString(task.subagentName)
      ?? normalizeSubagentNameAt(request.subagentNames, index)
      ?? (index === 0 ? normalizeNonEmptyString(request.subagentName) : undefined)
      ?? nextSubagentName(usedNames)
    if (usedNames.has(subagentName)) throw new Error(`child agent name already exists in thread ${plannerRun.threadId}: ${subagentName}`)
    usedNames.add(subagentName)
    const taskId = normalizeNonEmptyString(task.id) ?? `child_agent_${index + 1}`
    const instructions = [
      `Child agent task: ${task.title}`,
      task.description ? `Description: ${task.description}` : undefined,
      isJSONRecord(task.metadata) && typeof task.metadata.expectedOutput === 'string' ? `Expected output: ${task.metadata.expectedOutput}` : undefined,
      isJSONRecord(task.metadata) && typeof task.metadata.writeScope === 'string' ? `Write scope: ${task.metadata.writeScope}` : undefined,
    ].filter(Boolean).join('\n\n')
    return input.createRun({
      threadId: plannerRun.threadId,
      userMessage: instructions,
      role: 'worker',
      parentRunId: plannerRun.id,
      task: {
        id: taskId,
        title: task.title,
        ...(task.description ? { description: task.description } : {}),
        instructions,
      },
      progress: 0,
      metadata: {
        subagentName,
        childAgent: true,
        createdByPlannerRunId: plannerRun.id,
        ...(isJSONRecord(task.metadata) ? { taskMetadata: task.metadata } : {}),
      },
      agentManifest: request.agentManifest ?? plannerRun.agentManifest,
      approvedToolNames: request.approvedToolNames,
      policy: request.policy ?? plannerRun.policy,
      backendAuthToken: request.backendAuthToken,
      backendAPIBaseURL: request.backendAPIBaseURL,
      sandboxMode: request.sandboxMode,
    })
  })
  return {
    status: 'spawned',
    plannerRunId: plannerRun.id,
    spawnedRuns,
  }
}

export function applyRuntimeSubagentSpawnPreparation(input: {
  store: Pick<AgentStore, 'createTask' | 'getTask'>
  spawn: RuntimeSubagentSpawnPreparation
  retryFailed?: unknown
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
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
  updateTask: (taskId: string, update: UpdateTaskGraphTaskInput) => AgentTask
  dispatchTaskGraph: (input: DispatchTaskGraphInput) => DispatchTaskGraphResult
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
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
  const dispatch = input.dispatchTaskGraph({
    taskGraphId: input.spawn.taskGraphId,
    plannerRunId: input.spawn.plannerRunId,
    ...(input.spawn.requestedTaskIds.length > 0 ? { taskIds: input.spawn.requestedTaskIds } : {}),
    maxWorkers: request.maxWorkers,
    maxTaskAttempts: request.maxTaskAttempts,
    retryFailed: request.retryFailed,
    workerTimeoutMs: request.workerTimeoutMs,
  })
  return buildRuntimeSubagentSpawnResult({
    taskGraphId: input.spawn.taskGraphId,
    plannerRunId: input.spawn.plannerRunId,
    createdTaskIds,
    dispatch,
    snapshot: input.getTaskGraphSnapshot(input.spawn.taskGraphId),
  })
}

export function buildRuntimeSubagentSpawnResult(input: {
  taskGraphId: string
  plannerRunId: string
  createdTaskIds: string[]
  dispatch: Pick<DispatchTaskGraphResult, 'spawnedRuns' | 'blockedTaskIds' | 'retriedTaskIds' | 'timedOutRunIds'>
  snapshot: AgentTaskGraphSnapshot
}): JSONValue {
  return {
    status: input.dispatch.spawnedRuns.length > 0 ? 'spawned' : 'no_runnable_tasks',
    taskGraphId: input.taskGraphId,
    plannerRunId: input.plannerRunId,
    createdTaskIds: input.createdTaskIds,
    spawnedRuns: input.dispatch.spawnedRuns.map((run) => toSubagentRunSummary(run)),
    blockedTaskIds: input.dispatch.blockedTaskIds,
    retriedTaskIds: input.dispatch.retriedTaskIds,
    timedOutRunIds: input.dispatch.timedOutRunIds,
    snapshot: buildSubagentSnapshotView({ snapshot: input.snapshot, plannerRunId: input.plannerRunId }),
  } as unknown as JSONValue
}
