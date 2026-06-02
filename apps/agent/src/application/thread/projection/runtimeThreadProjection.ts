import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentRun } from '../../../state/shared/types.js'
import { projectRunStatusOntoThread } from '../../../state/run/projection/thread/runProjection.js'

export function updateRuntimeThreadRunStatus(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  threadId: string
  status: AgentRun['status']
  now: string
  runId?: string
}): boolean {
  const { store, threadId, status, now, runId } = input
  const thread = store.getThread(threadId)
  if (!thread) return false
  projectRunStatusOntoThread({ thread, status, ...(runId ? { runId } : {}), now })
  store.updateThread(thread)
  return true
}
