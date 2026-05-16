import type { AgentRun, AgentTask, JSONValue } from './types.js'
import { subagentNameFromRun, subagentNameFromTask } from './subagentIdentity.js'

export function collectSubagentNames(tasks: AgentTask[], runs: AgentRun[]): Set<string> {
  const names = new Set<string>()
  for (const task of tasks) {
    const name = subagentNameFromTask(task)
    if (name) names.add(name)
  }
  for (const run of runs) {
    const name = subagentNameFromRun(run)
    if (name) names.add(name)
  }
  return names
}

export function requireTaskBySubagentName(planId: string, tasks: AgentTask[], subagentName: string): AgentTask {
  const matches = tasks.filter((task) => subagentNameFromTask(task) === subagentName)
  if (matches.length === 0) throw new Error(`subagent not found by name: ${subagentName}`)
  if (matches.length > 1) throw new Error(`subagent name is ambiguous in plan ${planId}: ${subagentName}`)
  return matches[0]!
}

export function resolveSubagentNameInput(input: {
  planId: string
  rawInput: Record<string, JSONValue>
  tasks: AgentTask[]
}): Record<string, JSONValue> {
  const subagentName = normalizeNonEmptyString(input.rawInput.subagentName)
  if (!subagentName) return input.rawInput
  const task = requireTaskBySubagentName(input.planId, input.tasks, subagentName)
  return {
    ...input.rawInput,
    taskId: task.id,
    ...(task.ownerRunId ? { runId: task.ownerRunId } : {}),
  }
}

export function assertUniqueSubagentNameForTask(input: {
  planId: string
  taskId: string
  subagentName: string
  requestedNames: Map<string, string>
  tasks: AgentTask[]
  runs: AgentRun[]
}): void {
  for (const [otherTaskId, otherName] of input.requestedNames.entries()) {
    if (otherTaskId !== input.taskId && otherName === input.subagentName) {
      throw duplicateSubagentNameError(input.planId, input.subagentName)
    }
  }
  for (const task of input.tasks) {
    if (task.id !== input.taskId && subagentNameFromTask(task) === input.subagentName) {
      throw duplicateSubagentNameError(input.planId, input.subagentName)
    }
  }
  for (const run of input.runs) {
    if (run.taskId !== input.taskId && subagentNameFromRun(run) === input.subagentName) {
      throw duplicateSubagentNameError(input.planId, input.subagentName)
    }
  }
}

export function assertSubagentNamesUniqueForTaskMap(input: {
  planId: string
  tasksById: Map<string, AgentTask>
  runs: AgentRun[]
}): void {
  const taskIdsByName = new Map<string, string[]>()
  for (const task of input.tasksById.values()) {
    const subagentName = subagentNameFromTask(task)
    if (!subagentName) continue
    taskIdsByName.set(subagentName, [...(taskIdsByName.get(subagentName) ?? []), task.id])
  }
  for (const [subagentName, taskIds] of taskIdsByName.entries()) {
    if (taskIds.length > 1) throw duplicateSubagentNameError(input.planId, subagentName)
  }
  for (const run of input.runs) {
    const subagentName = subagentNameFromRun(run)
    if (!subagentName) continue
    const taskIds = taskIdsByName.get(subagentName) ?? []
    if (taskIds.some((taskId) => taskId !== run.taskId)) throw duplicateSubagentNameError(input.planId, subagentName)
  }
}

function duplicateSubagentNameError(planId: string, subagentName: string): Error {
  return new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
