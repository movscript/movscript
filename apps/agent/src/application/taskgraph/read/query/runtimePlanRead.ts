import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentTask } from '../../../../state/shared/types.js'
import { requireRuntimeTaskGraph } from '../../../shared/store/runtimeStoreLookup.js'

export function listRuntimePlans(input: {
  store: Pick<AgentStore, 'listTaskGraphs'>
}): AgentTaskGraph[] {
  return input.store.listTaskGraphs()
}

export function getRuntimeTaskGraph(input: {
  store: Pick<AgentStore, 'getTaskGraph'>
  taskGraphId: string
}): AgentTaskGraph | undefined {
  return input.store.getTaskGraph(input.taskGraphId)
}

export function getRuntimeTaskTree(input: {
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks'>
  taskGraphId: string
}): AgentTask[] {
  requireRuntimeTaskGraph(input.store, input.taskGraphId)
  return input.store.listTasks(input.taskGraphId)
}
