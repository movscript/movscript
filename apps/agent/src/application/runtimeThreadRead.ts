import type { AgentStore } from '../state/store.js'
import type { AgentThread, AgentThreadSummary } from '../state/types.js'

export function listRuntimeThreads(input: {
  store: Pick<AgentStore, 'listThreads'>
}): AgentThread[] {
  return input.store.listThreads()
}

export function listRuntimeThreadSummaries(input: {
  store: Pick<AgentStore, 'listThreadSummaries'>
}): AgentThreadSummary[] {
  return input.store.listThreadSummaries()
}

export function getRuntimeThread(input: {
  store: Pick<AgentStore, 'getThread'>
  threadId: string
}): AgentThread | undefined {
  return input.store.getThread(input.threadId)
}
