import type { AgentTask, CreatePlanTaskInput, JSONValue, ReplanRunInput, UpdatePlanTaskInput } from './types.js'
import { normalizePlanTaskInputs, normalizePlanTaskUpdateInputs, normalizeStringList } from './planTaskInput.js'
import {
  assertTaskDependencyGraphAcyclic,
  assertTaskParentGraphAcyclic,
  cloneTaskForValidation,
} from './planTaskGraph.js'

export interface ReplanTaskUpdateValidationInput {
  planId: string
  existingTasks: AgentTask[]
  tasksToCreate: AgentTask[]
  updates: UpdatePlanTaskInput[]
  getTask: (taskId: string) => AgentTask | undefined
  validateOwnerRun?: (ownerRunId: string, task: AgentTask) => void
  validateTaskNames?: (tasksById: Map<string, AgentTask>) => void
}

export interface NormalizedReplanTaskInputs {
  creates: CreatePlanTaskInput[]
  updates: UpdatePlanTaskInput[]
}

export function normalizeReplanTaskInputsForPlan(input: {
  planId: string
  tasks?: unknown
  addTasks?: unknown
  getTask: (taskId: string) => AgentTask | undefined
}): NormalizedReplanTaskInputs {
  const creates: CreatePlanTaskInput[] = [...normalizePlanTaskInputs(input.addTasks)]
  const updates: UpdatePlanTaskInput[] = []
  for (const item of normalizePlanTaskInputs(input.tasks)) {
    const taskId = normalizeNonEmptyString(item.id)
    const existing = taskId ? input.getTask(taskId) : undefined
    if (existing) {
      if (existing.planId !== input.planId) throw new Error(`task ${taskId} does not belong to plan ${input.planId}`)
      updates.push(item)
    } else {
      creates.push(item)
    }
  }
  return { creates, updates }
}

export function normalizeReplanTaskUpdateInputs(input: Pick<ReplanRunInput, 'updates' | 'updateTasks'>): UpdatePlanTaskInput[] {
  return [
    ...normalizePlanTaskUpdateInputs(input.updates),
    ...normalizePlanTaskUpdateInputs(input.updateTasks),
  ]
}

export function normalizeAndValidateReplanTaskUpdates(
  input: ReplanTaskUpdateValidationInput,
): Array<{ taskId: string; update: UpdatePlanTaskInput }> {
  const tasksById = new Map<string, AgentTask>()
  for (const task of input.existingTasks) tasksById.set(task.id, cloneTaskForValidation(task))
  for (const task of input.tasksToCreate) tasksById.set(task.id, cloneTaskForValidation(task))

  const normalized: Array<{ taskId: string; update: UpdatePlanTaskInput }> = []
  for (const update of input.updates) {
    const taskId = normalizeNonEmptyString(update.id)
    if (!taskId) throw new Error('task update id is required')
    const task = tasksById.get(taskId)
    if (!task) {
      const existing = input.getTask(taskId)
      if (existing && existing.planId !== input.planId) throw new Error(`task ${taskId} does not belong to plan ${input.planId}`)
      throw new Error(`task not found: ${taskId}`)
    }

    const ownerRunId = normalizeNonEmptyString(update.ownerRunId)
    if (ownerRunId) input.validateOwnerRun?.(ownerRunId, task)

    const parentId = normalizeNonEmptyString(update.parentId)
    if (parentId) {
      assertTaskReferenceInTaskMap(input.planId, tasksById, input.getTask, parentId, 'parent task')
      if (parentId === task.id) throw new Error(`task ${task.id} cannot use itself as parent`)
      task.parentId = parentId
    } else if ('parentId' in update) {
      delete task.parentId
    }

    if (Array.isArray(update.deps)) {
      const deps = normalizeStringList(update.deps)
      for (const depId of deps) {
        assertTaskReferenceInTaskMap(input.planId, tasksById, input.getTask, depId, 'dependency task')
        if (depId === task.id) throw new Error(`task ${task.id} cannot depend on itself`)
      }
      task.deps = deps
    }

    if (isJSONRecord(update.metadata)) {
      task.metadata = { ...(task.metadata ?? {}), ...update.metadata }
    }

    normalized.push({ taskId, update })
  }

  input.validateTaskNames?.(tasksById)
  const validationTasks = Array.from(tasksById.values())
  assertTaskParentGraphAcyclic(validationTasks)
  assertTaskDependencyGraphAcyclic(validationTasks)
  return normalized
}

function assertTaskReferenceInTaskMap(
  planId: string,
  tasksById: Map<string, AgentTask>,
  getTask: (taskId: string) => AgentTask | undefined,
  taskId: string,
  label: string,
): void {
  if (tasksById.has(taskId)) return
  const referencedTask = getTask(taskId)
  if (referencedTask && referencedTask.planId !== planId) throw new Error(`${label} ${taskId} does not belong to plan ${planId}`)
  throw new Error(`task not found: ${taskId}`)
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}
