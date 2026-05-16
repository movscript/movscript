import type { AgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask, AgentThread } from '../state/types.js'

export function requireRuntimeThread(store: Pick<AgentStore, 'getThread'>, id: string): AgentThread {
  const thread = store.getThread(id)
  if (!thread) throw new Error(`thread not found: ${id}`)
  return thread
}

export function requireRuntimeRun(store: Pick<AgentStore, 'getRun'>, id: string): AgentRun {
  const run = store.getRun(id)
  if (!run) throw new Error(`run not found: ${id}`)
  return run
}

export function requireRuntimePlan(store: Pick<AgentStore, 'getPlan'>, id: string): AgentPlan {
  const plan = store.getPlan(id)
  if (!plan) throw new Error(`plan not found: ${id}`)
  return plan
}

export function requireRuntimeTask(store: Pick<AgentStore, 'getTask'>, id: string): AgentTask {
  const task = store.getTask(id)
  if (!task) throw new Error(`task not found: ${id}`)
  return task
}
