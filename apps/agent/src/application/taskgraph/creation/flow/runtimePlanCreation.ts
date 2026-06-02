import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  GeneratePlanTasksInput,
  GeneratePlanTasksResult,
} from '../../../../orchestration/model/planning/generation/planGenerator.js'
import type {
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentRun,
  AgentTask,
  AgentThread,
  CreateTaskGraphInput,
  CreateTaskGraphTaskInput,
  CreateRunInput,
} from '../../../../state/shared/types.js'
import {
  buildAgentTaskGraph,
  buildCreatePlanPlannerRunInput,
  createTaskGraphGoal,
  normalizeCreatePlanThreadId,
} from '../../../../state/taskgraph/core/factory/planFactory.js'
import { normalizePlanTaskInputs, normalizePositiveInteger, selectPlannerInlineTask } from '../../../../state/taskgraph/input/task/planTaskInput.js'
import { buildAndValidatePlanTasksToCreate } from '../../../../state/taskgraph/task/creation/planTaskCreation.js'
import { findRuntimeThreadTaskGraph } from '../../binding/runtimePlanBinding.js'
import { requireRuntimeThread } from '../../../shared/store/runtimeStoreLookup.js'
import { assignRuntimeTaskToPlannerRun } from '../../task/assignment/runtimeTaskAssignment.js'
import { normalizeNonEmptyString } from '../input/runtimeScalarInput.js'
import {
  normalizeBackendAPIBaseURL,
  normalizeBackendAuthToken,
} from '../../../run/auth/runAuth.js'

export interface RuntimeTaskGraphCreationPreparation {
  thread: AgentThread
  taskInputs: CreateTaskGraphTaskInput[]
  goal?: string
}

export function prepareRuntimeTaskGraphCreation(input: {
  store: Pick<AgentStore, 'getThread' | 'listTaskGraphs'>
  planInput: CreateTaskGraphInput
}): RuntimeTaskGraphCreationPreparation {
  const threadId = normalizeCreatePlanThreadId(input.planInput.threadId)
  if (!threadId) throw new Error('threadId is required')
  const thread = requireRuntimeThread(input.store, threadId)
  const existingTaskGraph = findRuntimeThreadTaskGraph(input.store, thread.id)
  if (existingTaskGraph) throw new Error(`thread ${thread.id} already has taskGraph ${existingTaskGraph.id}`)
  const taskInputs = normalizePlanTaskInputs(input.planInput.tasks)
  const goal = createTaskGraphGoal(input.planInput)
  return {
    thread,
    taskInputs,
    ...(goal ? { goal } : {}),
  }
}

export interface RuntimeTaskGraphCreationTaskResolution {
  taskInputs: CreateTaskGraphTaskInput[]
  plannerSource?: GeneratePlanTasksResult['source']
  plannerWarnings: string[]
  plannerAssessment?: GeneratePlanTasksResult['assessment']
}

export async function resolveRuntimeTaskGraphCreationTasks(input: {
  preparation: RuntimeTaskGraphCreationPreparation
  planInput: CreateTaskGraphInput
  generatePlanTasks: (input: GeneratePlanTasksInput) => Promise<GeneratePlanTasksResult>
}): Promise<RuntimeTaskGraphCreationTaskResolution> {
  if (input.preparation.taskInputs.length > 0 || !input.preparation.goal) {
    return {
      taskInputs: input.preparation.taskInputs,
      plannerWarnings: [],
    }
  }

  const generated = await input.generatePlanTasks({
    goal: input.preparation.goal,
    title: normalizeNonEmptyString(input.planInput.title),
    maxTasks: normalizePositiveInteger(input.planInput.maxTasks),
    auth: {
      ...normalizeBackendAuthToken(input.planInput.backendAuthToken),
      ...normalizeBackendAPIBaseURL(input.planInput.backendAPIBaseURL),
    },
  })
  return {
    taskInputs: generated.tasks,
    plannerSource: generated.source,
    plannerWarnings: generated.warnings,
    ...(generated.assessment ? { plannerAssessment: generated.assessment } : {}),
  }
}

export interface RuntimeTaskGraphCreationResult {
  taskGraph: AgentTaskGraph
  tasks: AgentTask[]
}

export function createRuntimePlanWithTasks(input: {
  store: Pick<AgentStore, 'getTask' | 'createTaskGraph' | 'createTask'>
  taskGraphId: string
  thread: AgentThread
  planInput: CreateTaskGraphInput
  taskInputs: CreateTaskGraphTaskInput[]
  now: string
  goal?: string
  plannerSource?: string
  plannerWarnings?: string[]
  plannerAssessment?: GeneratePlanTasksResult['assessment']
}): RuntimeTaskGraphCreationResult {
  const taskGraph = buildAgentTaskGraph({
    id: input.taskGraphId,
    thread: input.thread,
    planInput: input.planInput,
    taskCount: input.taskInputs.length,
    now: input.now,
    ...(input.goal ? { goal: input.goal } : {}),
    ...(input.plannerSource ? { plannerSource: input.plannerSource } : {}),
    ...(input.plannerWarnings && input.plannerWarnings.length > 0 ? { plannerWarnings: input.plannerWarnings } : {}),
    ...(input.plannerAssessment ? { plannerAssessment: input.plannerAssessment } : {}),
  })
  const tasks = buildAndValidatePlanTasksToCreate({
    taskGraphId: taskGraph.id,
    inputs: input.taskInputs,
    now: input.now,
    getTask: (taskId) => input.store.getTask(taskId),
  })

  input.store.createTaskGraph(taskGraph)
  for (const task of tasks) input.store.createTask(task)

  return { taskGraph, tasks }
}

export interface RuntimeTaskGraphCreationRootRunResult {
  rootRun?: AgentRun
  inlineTaskAssignment?: {
    task: AgentTask
    previousTask: AgentTask
  }
}

export function applyRuntimeTaskGraphCreationRootRun(input: {
  store: Pick<AgentStore, 'updateTaskGraph' | 'getRun' | 'getTask' | 'updateTask'>
  taskGraph: AgentTaskGraph
  thread: AgentThread
  planInput: CreateTaskGraphInput
  tasks: AgentTask[]
  now: string
  createRun: (runInput: CreateRunInput) => AgentRun
  onInlineTaskAssigned?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimeTaskGraphCreationRootRunResult {
  if (input.planInput.createPlannerRun === false) return {}

  const inlinePlannerTask = selectPlannerInlineTask(input.tasks)
  const rootRun = input.createRun(buildCreatePlanPlannerRunInput({
    taskGraph: input.taskGraph,
    thread: input.thread,
    planInput: input.planInput,
    ...(inlinePlannerTask ? { inlinePlannerTask } : {}),
  }))
  input.taskGraph.rootRunId = rootRun.id
  input.taskGraph.status = 'running'
  input.taskGraph.updatedAt = input.now
  input.store.updateTaskGraph(input.taskGraph)

  if (!inlinePlannerTask) return { rootRun }

  const inlineTaskAssignment = assignRuntimeTaskToPlannerRun({
    store: input.store,
    taskId: inlinePlannerTask.id,
    runId: rootRun.id,
    now: input.now,
  })
  input.onInlineTaskAssigned?.(inlineTaskAssignment.task, inlineTaskAssignment.previousTask)

  return { rootRun, inlineTaskAssignment }
}

export interface RuntimeTaskGraphCreationFlowResult extends RuntimeTaskGraphCreationResult {
  rootRun?: AgentRun
}

export function applyRuntimeTaskGraphCreationFlow(input: {
  store: Pick<AgentStore, 'getTask' | 'createTaskGraph' | 'createTask' | 'updateTaskGraph' | 'getRun' | 'updateTask'>
  taskGraphId: string
  preparation: RuntimeTaskGraphCreationPreparation
  planInput: CreateTaskGraphInput
  resolvedTasks: RuntimeTaskGraphCreationTaskResolution
  now: string
  createRun: (runInput: CreateRunInput) => AgentRun
  onTaskCreated?: (task: AgentTask) => void
  onInlineTaskAssigned?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimeTaskGraphCreationFlowResult {
  const { taskGraph, tasks } = createRuntimePlanWithTasks({
    store: input.store,
    taskGraphId: input.taskGraphId,
    thread: input.preparation.thread,
    planInput: input.planInput,
    taskInputs: input.resolvedTasks.taskInputs,
    now: input.now,
    ...(input.preparation.goal ? { goal: input.preparation.goal } : {}),
    ...(input.resolvedTasks.plannerSource ? { plannerSource: input.resolvedTasks.plannerSource } : {}),
    ...(input.resolvedTasks.plannerWarnings.length > 0 ? { plannerWarnings: input.resolvedTasks.plannerWarnings } : {}),
    ...(input.resolvedTasks.plannerAssessment ? { plannerAssessment: input.resolvedTasks.plannerAssessment } : {}),
  })
  for (const task of tasks) input.onTaskCreated?.(task)

  const root = applyRuntimeTaskGraphCreationRootRun({
    store: input.store,
    taskGraph,
    thread: input.preparation.thread,
    planInput: input.planInput,
    tasks,
    now: input.now,
    createRun: input.createRun,
    onInlineTaskAssigned: input.onInlineTaskAssigned,
  })

  return {
    taskGraph,
    tasks,
    ...(root.rootRun ? { rootRun: root.rootRun } : {}),
  }
}

export async function applyRuntimeTaskGraphCreationRequest(input: {
  store: Pick<AgentStore, 'getThread' | 'listTaskGraphs' | 'getTask' | 'createTaskGraph' | 'createTask' | 'updateTaskGraph' | 'getRun' | 'updateTask'>
  planInput: CreateTaskGraphInput
  taskGraphId: string
  now: string
  generatePlanTasks: (input: GeneratePlanTasksInput) => Promise<GeneratePlanTasksResult>
  createRun: (runInput: CreateRunInput) => AgentRun
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  onTaskCreated?: (task: AgentTask) => void
  onInlineTaskAssigned?: (task: AgentTask, previousTask: AgentTask) => void
}): Promise<AgentTaskGraphSnapshot> {
  const preparation = prepareRuntimeTaskGraphCreation({
    store: input.store,
    planInput: input.planInput,
  })
  const resolvedTasks = await resolveRuntimeTaskGraphCreationTasks({
    preparation,
    planInput: input.planInput,
    generatePlanTasks: input.generatePlanTasks,
  })
  const { taskGraph } = applyRuntimeTaskGraphCreationFlow({
    store: input.store,
    taskGraphId: input.taskGraphId,
    preparation,
    planInput: input.planInput,
    resolvedTasks,
    now: input.now,
    createRun: input.createRun,
    ...(input.onTaskCreated ? { onTaskCreated: input.onTaskCreated } : {}),
    ...(input.onInlineTaskAssigned ? { onInlineTaskAssigned: input.onInlineTaskAssigned } : {}),
  })
  return input.getTaskGraphSnapshot(taskGraph.id)
}
