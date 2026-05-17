import { isRecord } from '../jsonValue.js'
import type { AgentRun, AgentTask, JSONValue } from './types.js'
import { normalizeStringList } from './planTaskInput.js'

export const DEFAULT_SUBAGENT_NAMES = [
  'Agent 1',
  'Agent 2',
  'Agent 3',
  'Agent 4',
  'Agent 5',
  'Agent 6',
  'Agent 7',
  'Agent 8',
  'Agent 9',
  'Agent 10',
] as const

export function buildRequestedSubagentNameMap(input: Record<string, JSONValue>, taskIds: string[]): Map<string, string> {
  const result = new Map<string, string>()
  const singleTaskId = normalizeNonEmptyString(input.taskId)
  const singleName = normalizeNonEmptyString(input.subagentName)
  if (singleTaskId && singleName) result.set(singleTaskId, singleName)
  if (singleName && taskIds.length === 1) result.set(taskIds[0]!, singleName)
  if (isRecord(input.subagentNames)) {
    for (const [taskId, value] of Object.entries(input.subagentNames)) {
      const name = normalizeNonEmptyString(value)
      if (name) result.set(taskId, name)
    }
  }
  const names = normalizeStringList(input.subagentNames)
  taskIds.forEach((taskId, index) => {
    const name = names[index]
    if (name) result.set(taskId, name)
  })
  return result
}

export function normalizeSubagentNameAt(value: unknown, index: number): string | undefined {
  return normalizeStringList(value)[index]
}

export function nextSubagentName(used: Set<string>): string {
  for (const name of DEFAULT_SUBAGENT_NAMES) {
    if (!used.has(name)) return name
  }
  let index = DEFAULT_SUBAGENT_NAMES.length + 1
  while (used.has(`Agent ${index}`)) index += 1
  return `Agent ${index}`
}

export function subagentNameFromTask(task: AgentTask): string | undefined {
  const metadata = isRecord(task.metadata) ? task.metadata : undefined
  return normalizeNonEmptyString(metadata?.subagentName)
}

export function subagentNameFromRun(run: AgentRun): string | undefined {
  const metadata = isRecord(run.metadata) ? run.metadata : undefined
  return normalizeNonEmptyString(metadata?.subagentName)
}

export function subagentNameConflicts(tasks: AgentTask[]): Array<{ subagentName: string; taskIds: string[] }> {
  const byName = new Map<string, string[]>()
  for (const task of tasks) {
    const subagentName = subagentNameFromTask(task)
    if (!subagentName) continue
    byName.set(subagentName, [...(byName.get(subagentName) ?? []), task.id])
  }
  return Array.from(byName.entries())
    .filter(([, taskIds]) => taskIds.length > 1)
    .map(([subagentName, taskIds]) => ({ subagentName, taskIds }))
    .sort((a, b) => a.subagentName.localeCompare(b.subagentName))
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
