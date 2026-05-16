import type { AgentTask, JSONValue, UpdatePlanTaskInput } from './types.js'
import {
  normalizeProgress,
  normalizeStringList,
  normalizeTaskArtifacts,
  normalizeTaskStatus,
} from './planTaskInput.js'
import {
  assertTaskDependencyGraphAcyclic,
  assertTaskParentGraphAcyclic,
} from './planTaskGraph.js'

export interface ApplyPlanTaskUpdateInput {
  task: AgentTask
  update: UpdatePlanTaskInput
  now: string
  planTasks: AgentTask[]
  getTask: (taskId: string) => AgentTask | undefined
  validateOwnerRun?: (ownerRunId: string, task: AgentTask) => void
  validateSubagentName?: (taskId: string, subagentName: string) => void
}

export function applyPlanTaskUpdate(input: ApplyPlanTaskUpdateInput): AgentTask {
  const { task, update, now } = input
  const nextStatus = normalizeTaskStatus(update.status)
  if (nextStatus) {
    task.status = nextStatus
    if (nextStatus === 'running' && !task.startedAt) task.startedAt = now
    if (nextStatus === 'done') task.completedAt = now
    if (nextStatus === 'failed') task.failedAt = now
    if (nextStatus === 'cancelled') task.cancelledAt = now
  }

  const parentId = normalizeNonEmptyString(update.parentId)
  if (parentId) {
    assertTaskReferenceInPlan(task.planId, input.getTask, parentId, 'parent task')
    if (parentId === task.id) throw new Error(`task ${task.id} cannot use itself as parent`)
    assertTaskParentGraphAcyclic(input.planTasks, new Map([[task.id, parentId]]))
    task.parentId = parentId
  } else if ('parentId' in update) {
    assertTaskParentGraphAcyclic(input.planTasks, new Map([[task.id, undefined]]))
    delete task.parentId
  }

  if (Array.isArray(update.deps)) {
    const deps = normalizeStringList(update.deps)
    for (const depId of deps) {
      assertTaskReferenceInPlan(task.planId, input.getTask, depId, 'dependency task')
      if (depId === task.id) throw new Error(`task ${task.id} cannot depend on itself`)
    }
    assertTaskDependencyGraphAcyclic(input.planTasks, new Map([[task.id, deps]]))
    task.deps = deps
  }

  const title = normalizeNonEmptyString(update.title)
  if (title) task.title = title
  if (typeof update.description === 'string') {
    const description = update.description.trim()
    if (description) task.description = description
    else delete task.description
  }
  const progress = normalizeProgress(update.progress)
  if (progress !== undefined) task.progress = progress

  const ownerRunId = normalizeNonEmptyString(update.ownerRunId)
  if (ownerRunId) {
    input.validateOwnerRun?.(ownerRunId, task)
    task.ownerRunId = ownerRunId
  }

  if (typeof update.blockedReason === 'string') {
    const blockedReason = update.blockedReason.trim()
    if (blockedReason) task.blockedReason = blockedReason
    else delete task.blockedReason
  }
  const artifacts = normalizeTaskArtifacts(update.artifacts, now)
  if (artifacts.length > 0) task.artifacts = [...task.artifacts, ...artifacts]
  if (isJSONRecord(update.metadata)) {
    const nextSubagentName = normalizeNonEmptyString(update.metadata.subagentName)
    if (nextSubagentName) input.validateSubagentName?.(task.id, nextSubagentName)
    task.metadata = { ...(task.metadata ?? {}), ...update.metadata }
  }
  task.updatedAt = now
  return task
}

function assertTaskReferenceInPlan(
  planId: string,
  getTask: (taskId: string) => AgentTask | undefined,
  taskId: string,
  label: string,
): void {
  const referencedTask = getTask(taskId)
  if (!referencedTask) throw new Error(`task not found: ${taskId}`)
  if (referencedTask.planId !== planId) throw new Error(`${label} ${taskId} does not belong to plan ${planId}`)
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
