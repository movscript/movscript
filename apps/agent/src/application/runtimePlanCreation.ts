import type { AgentStore } from '../state/store.js'
import type {
  GeneratePlanTasksInput,
  GeneratePlanTasksResult,
} from '../orchestration/planGenerator.js'
import type {
  AgentPlan,
  AgentPlanSnapshot,
  AgentRun,
  AgentTask,
  AgentThread,
  CreatePlanInput,
  CreatePlanTaskInput,
  CreateRunInput,
} from '../state/types.js'
import {
  buildAgentPlan,
  buildCreatePlanPlannerRunInput,
  createPlanGoal,
  normalizeCreatePlanThreadId,
} from '../state/planFactory.js'
import { normalizePlanTaskInputs, normalizePositiveInteger, selectPlannerInlineTask } from '../state/planTaskInput.js'
import { buildAndValidatePlanTasksToCreate } from '../state/planTaskCreation.js'
import { findRuntimeThreadPlan } from './runtimePlanBinding.js'
import { requireRuntimeThread } from './runtimeStoreLookup.js'
import { assignRuntimeTaskToPlannerRun } from './runtimeTaskAssignment.js'
import { normalizeNonEmptyString } from './runtimeScalarInput.js'
import {
  normalizeBackendAPIBaseURL,
  normalizeBackendAuthToken,
} from './runAuth.js'

export interface RuntimePlanCreationPreparation {
  thread: AgentThread
  taskInputs: CreatePlanTaskInput[]
  goal?: string
}

export function prepareRuntimePlanCreation(input: {
  store: Pick<AgentStore, 'getThread' | 'listPlans'>
  planInput: CreatePlanInput
}): RuntimePlanCreationPreparation {
  const threadId = normalizeCreatePlanThreadId(input.planInput.threadId)
  if (!threadId) throw new Error('threadId is required')
  const thread = requireRuntimeThread(input.store, threadId)
  const existingPlan = findRuntimeThreadPlan(input.store, thread.id)
  if (existingPlan) throw new Error(`thread ${thread.id} already has plan ${existingPlan.id}`)
  const taskInputs = normalizePlanTaskInputs(input.planInput.tasks)
  const goal = createPlanGoal(input.planInput)
  return {
    thread,
    taskInputs,
    ...(goal ? { goal } : {}),
  }
}

export interface RuntimePlanCreationTaskResolution {
  taskInputs: CreatePlanTaskInput[]
  plannerSource?: GeneratePlanTasksResult['source']
  plannerWarnings: string[]
}

export async function resolveRuntimePlanCreationTasks(input: {
  preparation: RuntimePlanCreationPreparation
  planInput: CreatePlanInput
  generatePlanTasks: (input: GeneratePlanTasksInput) => Promise<GeneratePlanTasksResult>
}): Promise<RuntimePlanCreationTaskResolution> {
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
  }
}

export interface RuntimePlanCreationResult {
  plan: AgentPlan
  tasks: AgentTask[]
}

export function createRuntimePlanWithTasks(input: {
  store: Pick<AgentStore, 'getTask' | 'createPlan' | 'createTask'>
  planId: string
  thread: AgentThread
  planInput: CreatePlanInput
  taskInputs: CreatePlanTaskInput[]
  now: string
  goal?: string
  plannerSource?: string
  plannerWarnings?: string[]
}): RuntimePlanCreationResult {
  const plan = buildAgentPlan({
    id: input.planId,
    thread: input.thread,
    planInput: input.planInput,
    taskCount: input.taskInputs.length,
    now: input.now,
    ...(input.goal ? { goal: input.goal } : {}),
    ...(input.plannerSource ? { plannerSource: input.plannerSource } : {}),
    ...(input.plannerWarnings && input.plannerWarnings.length > 0 ? { plannerWarnings: input.plannerWarnings } : {}),
  })
  const tasks = buildAndValidatePlanTasksToCreate({
    planId: plan.id,
    inputs: input.taskInputs,
    now: input.now,
    getTask: (taskId) => input.store.getTask(taskId),
  })

  input.store.createPlan(plan)
  for (const task of tasks) input.store.createTask(task)

  return { plan, tasks }
}

export interface RuntimePlanCreationRootRunResult {
  rootRun?: AgentRun
  inlineTaskAssignment?: {
    task: AgentTask
    previousTask: AgentTask
  }
}

export function applyRuntimePlanCreationRootRun(input: {
  store: Pick<AgentStore, 'updatePlan' | 'getRun' | 'getTask' | 'updateTask'>
  plan: AgentPlan
  thread: AgentThread
  planInput: CreatePlanInput
  tasks: AgentTask[]
  now: string
  createRun: (runInput: CreateRunInput) => AgentRun
  onInlineTaskAssigned?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimePlanCreationRootRunResult {
  if (input.planInput.createPlannerRun === false) return {}

  const inlinePlannerTask = selectPlannerInlineTask(input.tasks)
  const rootRun = input.createRun(buildCreatePlanPlannerRunInput({
    plan: input.plan,
    thread: input.thread,
    planInput: input.planInput,
    ...(inlinePlannerTask ? { inlinePlannerTask } : {}),
  }))
  input.plan.rootRunId = rootRun.id
  input.plan.status = 'running'
  input.plan.updatedAt = input.now
  input.store.updatePlan(input.plan)

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

export interface RuntimePlanCreationFlowResult extends RuntimePlanCreationResult {
  rootRun?: AgentRun
}

export function applyRuntimePlanCreationFlow(input: {
  store: Pick<AgentStore, 'getTask' | 'createPlan' | 'createTask' | 'updatePlan' | 'getRun' | 'updateTask'>
  planId: string
  preparation: RuntimePlanCreationPreparation
  planInput: CreatePlanInput
  resolvedTasks: RuntimePlanCreationTaskResolution
  now: string
  createRun: (runInput: CreateRunInput) => AgentRun
  onTaskCreated?: (task: AgentTask) => void
  onInlineTaskAssigned?: (task: AgentTask, previousTask: AgentTask) => void
}): RuntimePlanCreationFlowResult {
  const { plan, tasks } = createRuntimePlanWithTasks({
    store: input.store,
    planId: input.planId,
    thread: input.preparation.thread,
    planInput: input.planInput,
    taskInputs: input.resolvedTasks.taskInputs,
    now: input.now,
    ...(input.preparation.goal ? { goal: input.preparation.goal } : {}),
    ...(input.resolvedTasks.plannerSource ? { plannerSource: input.resolvedTasks.plannerSource } : {}),
    ...(input.resolvedTasks.plannerWarnings.length > 0 ? { plannerWarnings: input.resolvedTasks.plannerWarnings } : {}),
  })
  for (const task of tasks) input.onTaskCreated?.(task)

  const root = applyRuntimePlanCreationRootRun({
    store: input.store,
    plan,
    thread: input.preparation.thread,
    planInput: input.planInput,
    tasks,
    now: input.now,
    createRun: input.createRun,
    onInlineTaskAssigned: input.onInlineTaskAssigned,
  })

  return {
    plan,
    tasks,
    ...(root.rootRun ? { rootRun: root.rootRun } : {}),
  }
}

export async function applyRuntimePlanCreationRequest(input: {
  store: Pick<AgentStore, 'getThread' | 'listPlans' | 'getTask' | 'createPlan' | 'createTask' | 'updatePlan' | 'getRun' | 'updateTask'>
  planInput: CreatePlanInput
  planId: string
  now: string
  generatePlanTasks: (input: GeneratePlanTasksInput) => Promise<GeneratePlanTasksResult>
  createRun: (runInput: CreateRunInput) => AgentRun
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  onTaskCreated?: (task: AgentTask) => void
  onInlineTaskAssigned?: (task: AgentTask, previousTask: AgentTask) => void
}): Promise<AgentPlanSnapshot> {
  const preparation = prepareRuntimePlanCreation({
    store: input.store,
    planInput: input.planInput,
  })
  const resolvedTasks = await resolveRuntimePlanCreationTasks({
    preparation,
    planInput: input.planInput,
    generatePlanTasks: input.generatePlanTasks,
  })
  const { plan } = applyRuntimePlanCreationFlow({
    store: input.store,
    planId: input.planId,
    preparation,
    planInput: input.planInput,
    resolvedTasks,
    now: input.now,
    createRun: input.createRun,
    ...(input.onTaskCreated ? { onTaskCreated: input.onTaskCreated } : {}),
    ...(input.onInlineTaskAssigned ? { onInlineTaskAssigned: input.onInlineTaskAssigned } : {}),
  })
  return input.getPlanSnapshot(plan.id)
}
