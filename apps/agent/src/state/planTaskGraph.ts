import { cloneJSONValue } from '../jsonValue.js'
import type { AgentTask, JSONValue } from './types.js'

export function cloneTaskForValidation(task: AgentTask): AgentTask {
  return {
    ...task,
    deps: [...task.deps],
    artifacts: task.artifacts.map((artifact) => ({
      ...artifact,
      ...(artifact.metadata ? { metadata: cloneJSONValue(artifact.metadata) } : {}),
    })),
    ...(task.metadata ? { metadata: cloneJSONValue(task.metadata as Record<string, JSONValue>) } : {}),
  }
}

export function assertTaskDependencyGraphAcyclic(
  tasks: AgentTask[],
  overrides: Map<string, string[]> = new Map(),
): void {
  const depsByTaskId = new Map<string, string[]>()
  for (const task of tasks) depsByTaskId.set(task.id, [...task.deps])
  for (const [taskId, deps] of overrides.entries()) depsByTaskId.set(taskId, [...deps])
  assertStringGraphAcyclic(depsByTaskId, 'task dependency cycle detected')
}

export function assertTaskParentGraphAcyclic(
  tasks: AgentTask[],
  overrides: Map<string, string | undefined> = new Map(),
): void {
  const parentByTaskId = new Map<string, string | undefined>()
  for (const task of tasks) parentByTaskId.set(task.id, task.parentId)
  for (const [taskId, parentId] of overrides.entries()) parentByTaskId.set(taskId, parentId)
  assertStringGraphAcyclic(parentByTaskId, 'task parent cycle detected')
}

function assertStringGraphAcyclic(edgesByNodeId: Map<string, string[] | string | undefined>, message: string): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return
    if (visiting.has(nodeId)) {
      const start = path.indexOf(nodeId)
      const cycle = [...path.slice(start >= 0 ? start : 0), nodeId]
      throw new Error(`${message}: ${cycle.join(' -> ')}`)
    }
    visiting.add(nodeId)
    path.push(nodeId)
    const edges = edgesByNodeId.get(nodeId)
    const nextNodeIds = Array.isArray(edges) ? edges : edges ? [edges] : []
    for (const nextNodeId of nextNodeIds) {
      if (edgesByNodeId.has(nextNodeId)) visit(nextNodeId)
    }
    path.pop()
    visiting.delete(nodeId)
    visited.add(nodeId)
  }
  for (const nodeId of edgesByNodeId.keys()) visit(nodeId)
}
