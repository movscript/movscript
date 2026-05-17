import { isRecord } from '../jsonValue.js'
import type { AgentTask, CreatePlanTaskInput } from './types.js'
import { buildAgentTask } from './planTaskInput.js'
import {
  assertTaskDependencyGraphAcyclic,
  assertTaskParentGraphAcyclic,
} from './planTaskGraph.js'

export interface BuildPlanTasksToCreateInput {
  planId: string
  inputs: CreatePlanTaskInput[]
  now: string
  existingTasks?: AgentTask[]
  getTask: (taskId: string) => AgentTask | undefined
  validateSubagentName?: (taskId: string, subagentName: string, requestedNames: Map<string, string>) => void
}

export function buildAndValidatePlanTasksToCreate(input: BuildPlanTasksToCreateInput): AgentTask[] {
  const tasksToCreate: AgentTask[] = []
  const requestedNames = new Map<string, string>()
  for (const taskInput of input.inputs) {
    const subagentName = normalizeNonEmptyString(taskInput.subagentName)
      ?? normalizeNonEmptyString(isRecord(taskInput.metadata) ? taskInput.metadata.subagentName : undefined)
    const task = buildAgentTask(input.planId, taskInput, input.now)
    if (input.getTask(task.id)) throw new Error(`task already exists: ${task.id}`)
    if (tasksToCreate.some((item) => item.id === task.id)) throw new Error(`task already exists: ${task.id}`)
    if (subagentName) {
      requestedNames.set(task.id, subagentName)
      input.validateSubagentName?.(task.id, subagentName, requestedNames)
    }
    tasksToCreate.push(task)
  }
  assertTaskCreateReferences(input.planId, tasksToCreate, input.getTask)
  const validationTasks = [...(input.existingTasks ?? []), ...tasksToCreate]
  assertTaskParentGraphAcyclic(validationTasks)
  assertTaskDependencyGraphAcyclic(validationTasks)
  return tasksToCreate
}

export function assertTaskCreateReferences(
  planId: string,
  tasksToCreate: AgentTask[],
  getTask: (taskId: string) => AgentTask | undefined,
): void {
  const createdIds = new Set(tasksToCreate.map((task) => task.id))
  for (const task of tasksToCreate) {
    const references = [
      ...(task.parentId ? [{ id: task.parentId, label: 'parent task' }] : []),
      ...task.deps.map((id) => ({ id, label: 'dependency task' })),
    ]
    for (const reference of references) {
      if (reference.id === task.id) {
        throw new Error(reference.label === 'parent task'
          ? `task ${task.id} cannot use itself as parent`
          : `task ${task.id} cannot depend on itself`)
      }
      if (createdIds.has(reference.id)) continue
      const referencedTask = getTask(reference.id)
      if (referencedTask && referencedTask.planId !== planId) {
        throw new Error(`${reference.label} ${reference.id} does not belong to plan ${planId}`)
      }
      if (!referencedTask) throw new Error(`task not found: ${reference.id}`)
    }
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
