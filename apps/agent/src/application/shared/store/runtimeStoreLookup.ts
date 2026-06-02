import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun, AgentSession, AgentTask, AgentThread } from '../../../state/shared/types.js'

export function requireRuntimeSession(store: Pick<AgentStore, 'getSession'>, id: string): AgentSession {
  const session = store.getSession(id)
  if (!session) throw new Error(`session not found: ${id}`)
  return session
}

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

export function requireRuntimeTaskGraph(store: Pick<AgentStore, 'getTaskGraph'>, id: string): AgentTaskGraph {
  const taskGraph = store.getTaskGraph(id)
  if (!taskGraph) throw new Error(`taskGraph not found: ${id}`)
  return taskGraph
}

export function requireRuntimeTask(store: Pick<AgentStore, 'getTask'>, id: string): AgentTask {
  const task = store.getTask(id)
  if (!task) throw new Error(`task not found: ${id}`)
  return task
}
